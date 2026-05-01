// Shared math + EXR I/O glue for the static (scene-pass) and
// coffee-steam routes. Both bakes feed pre-rendered Cycles light-group
// AOVs through the same per-pixel position-recovery formula:
//
//     U_global = (Σ_K col_K · cell_K.b + Σ_K cell_K.r) / (N · Σ_K cell_K.b)
//     V_global = (Σ_K row_K · cell_K.b + Σ_K cell_K.g) / (N · Σ_K cell_K.b)
//
// See COMPOSITE_THEORY.md for the derivation. Caller passes the
// per-cell light-group prefix ("screen" or "steam") so the same code
// can read either pass.

use std::fs;
use std::path::{Path, PathBuf};
use std::result::Result;

use exr::prelude::*;
use half::f16;
use serde::Deserialize;

// Sigma of the 2D Gaussian applied to (U, V, whitelight) before
// encoding. 0 disables the blur. Tune to soften cell-boundary flicker
// against reflection sharpness.
pub const POSITION_BLUR_SIGMA_PX: f32 = 2.0;

#[derive(Deserialize)]
pub struct CellsManifest {
    #[serde(rename = "cellsPerSide")]
    pub cells_per_side: usize,
    pub cells: Vec<CellEntry>,
}

#[derive(Deserialize)]
pub struct CellEntry {
    pub index: usize,
    pub col: i32,
    pub row: i32,
}

pub fn read_manifest(path: &Path) -> Result<CellsManifest, Box<dyn std::error::Error>> {
    let text = fs::read_to_string(path)?;
    let manifest: CellsManifest = serde_json::from_str(&text)?;
    Ok(manifest)
}

// Project the manifest's per-cell (col, row) entries onto a flat
// vector indexed by cell_index, so the cell loop can look the cell's
// screen-plane position up by index without a hash.
pub fn build_cell_grid(manifest: &CellsManifest) -> Vec<(i32, i32)> {
    let cell_count = manifest.cells_per_side * manifest.cells_per_side;
    let mut cell_grid: Vec<(i32, i32)> = vec![(0, 0); cell_count];
    for cell in manifest.cells.iter() {
        if cell.index < cell_count {
            cell_grid[cell.index] = (cell.col, cell.row);
        }
    }
    cell_grid
}

pub fn linear_to_srgb_byte(linear: f32) -> u8 {
    let clamped = linear.clamp(0.0, 1.0);
    let encoded = if clamped <= 0.003_130_8 {
        12.92 * clamped
    } else {
        1.055 * clamped.powf(1.0 / 2.4) - 0.055
    };
    (encoded * 255.0).round().clamp(0.0, 255.0) as u8
}

fn make_gaussian_kernel(sigma: f32) -> Vec<f32> {
    let radius = (3.0 * sigma).ceil() as i32;
    let mut kernel: Vec<f32> = (-radius..=radius)
        .map(|index| {
            let offset = index as f32;
            (-(offset * offset) / (2.0 * sigma * sigma)).exp()
        })
        .collect();
    let kernel_sum: f32 = kernel.iter().sum();
    for weight in kernel.iter_mut() {
        *weight /= kernel_sum;
    }
    kernel
}

pub fn gaussian_blur_2d(buffer: &mut [f32], width: usize, height: usize, sigma: f32) {
    if sigma <= 0.0 {
        return;
    }
    let kernel = make_gaussian_kernel(sigma);
    let radius = (kernel.len() / 2) as i32;
    let width_signed = width as i32;
    let height_signed = height as i32;
    let mut intermediate = vec![0.0_f32; width * height];
    for row in 0..height {
        for column in 0..width {
            let mut accumulator = 0.0_f32;
            for kernel_offset in -radius..=radius {
                let sample_column = (column as i32 + kernel_offset)
                    .clamp(0, width_signed - 1) as usize;
                accumulator +=
                    buffer[row * width + sample_column] * kernel[(kernel_offset + radius) as usize];
            }
            intermediate[row * width + column] = accumulator;
        }
    }
    for row in 0..height {
        for column in 0..width {
            let mut accumulator = 0.0_f32;
            for kernel_offset in -radius..=radius {
                let sample_row = (row as i32 + kernel_offset)
                    .clamp(0, height_signed - 1) as usize;
                accumulator += intermediate[sample_row * width + column]
                    * kernel[(kernel_offset + radius) as usize];
            }
            buffer[row * width + column] = accumulator;
        }
    }
}

// Reads three named float channels out of a single-layer flat EXR.
// Cell EXRs name them `<prefix>_K.{R,G,B}`; the beauty EXR names them
// `R/G/B` directly.
pub fn read_named_rgb(
    path: &Path,
    expected: [&str; 3],
) -> Result<(usize, usize, [Vec<f32>; 3]), Box<dyn std::error::Error>> {
    let image = read()
        .no_deep_data()
        .largest_resolution_level()
        .all_channels()
        .first_valid_layer()
        .all_attributes()
        .from_file(path)?;

    let layer = &image.layer_data;
    let width = layer.size.x();
    let height = layer.size.y();
    let mut found: [Option<Vec<f32>>; 3] = [None, None, None];

    for channel in layer.channel_data.list.iter() {
        let channel_name = channel.name.to_string();
        for (slot, expected_name) in expected.iter().enumerate() {
            if channel_name == *expected_name {
                let samples: Vec<f32> = match &channel.sample_data {
                    FlatSamples::F16(values) => {
                        values.iter().map(|sample| sample.to_f32()).collect()
                    }
                    FlatSamples::F32(values) => values.clone(),
                    FlatSamples::U32(values) => {
                        values.iter().map(|sample| *sample as f32).collect()
                    }
                };
                found[slot] = Some(samples);
            }
        }
    }

    let [r_opt, g_opt, b_opt] = found;
    let r = r_opt.ok_or_else(|| {
        format!("missing channel {:?} in {}", expected[0], path.display())
    })?;
    let g = g_opt.ok_or_else(|| {
        format!("missing channel {:?} in {}", expected[1], path.display())
    })?;
    let b = b_opt.ok_or_else(|| {
        format!("missing channel {:?} in {}", expected[2], path.display())
    })?;

    Ok((width, height, [r, g, b]))
}

// Writes an uncompressed scanline RGBA half-float EXR. The runtime
// decoder (src/composite/decodeExr.ts) only handles this format, so
// the encoding choice is load-bearing.
pub fn write_position_exr(
    path: &Path,
    width: usize,
    height: usize,
    u_channel: &[f32],
    v_channel: &[f32],
    whitelight: &[f32],
) -> Result<(), Box<dyn std::error::Error>> {
    let pixels = SpecificChannels::rgba(|position: Vec2<usize>| {
        let pixel_index = position.y() * width + position.x();
        (
            f16::from_f32(u_channel[pixel_index]),
            f16::from_f32(v_channel[pixel_index]),
            f16::from_f32(whitelight[pixel_index]),
            f16::from_f32(1.0_f32),
        )
    });

    // The JS decoder only handles uncompressed scanline EXR with
    // INCREASING_Y. The exr crate's named presets (FAST_LOSSLESS,
    // SMALL_FAST_LOSSLESS) all use Tiles, so set every field
    // explicitly.
    let layer = Layer::new(
        (width, height),
        LayerAttributes::named("position"),
        Encoding {
            compression: Compression::Uncompressed,
            blocks: Blocks::ScanLines,
            line_order: LineOrder::Increasing,
        },
        pixels,
    );

    Image::from_layer(layer).write().to_file(path)?;
    Ok(())
}

pub fn write_beauty_png(
    path: &Path,
    width: usize,
    height: usize,
    r_channel: &[f32],
    g_channel: &[f32],
    b_channel: &[f32],
) -> Result<(), Box<dyn std::error::Error>> {
    let mut bytes = Vec::with_capacity(width * height * 3);
    for pixel_index in 0..(width * height) {
        bytes.push(linear_to_srgb_byte(r_channel[pixel_index]));
        bytes.push(linear_to_srgb_byte(g_channel[pixel_index]));
        bytes.push(linear_to_srgb_byte(b_channel[pixel_index]));
    }

    let file = fs::File::create(path)?;
    let writer = std::io::BufWriter::new(file);
    let mut encoder = png::Encoder::new(writer, width as u32, height as u32);
    encoder.set_color(png::ColorType::Rgb);
    encoder.set_depth(png::BitDepth::Eight);
    let mut png_writer = encoder.write_header()?;
    png_writer.write_image_data(&bytes)?;
    Ok(())
}

pub struct PositionFields {
    pub width: usize,
    pub height: usize,
    pub position_u: Vec<f32>,
    pub position_v: Vec<f32>,
    pub whitelight: Vec<f32>,
}

// Linear-quantize position fields into an 8-bit RGB PNG. R = U, G = V,
// B = whitelight / whitelight_scale, all clamped to [0, 1] then rounded
// to [0, 255]. Use this for the steam atlas where the EXR file size is
// the bottleneck and 1/256 UV precision is acceptable for a soft
// volumetric refraction. Caller must record `whitelight_scale` so the
// runtime can multiply it back in.
pub fn write_position_png_8bit(
    path: &Path,
    width: usize,
    height: usize,
    u_channel: &[f32],
    v_channel: &[f32],
    whitelight: &[f32],
    whitelight_scale: f32,
) -> Result<(), Box<dyn std::error::Error>> {
    let inverse_scale = if whitelight_scale > 0.0 {
        1.0 / whitelight_scale
    } else {
        1.0
    };
    let mut bytes = Vec::with_capacity(width * height * 3);
    for pixel_index in 0..(width * height) {
        let u = u_channel[pixel_index].clamp(0.0, 1.0);
        let v = v_channel[pixel_index].clamp(0.0, 1.0);
        let w = (whitelight[pixel_index] * inverse_scale).clamp(0.0, 1.0);
        bytes.push((u * 255.0).round() as u8);
        bytes.push((v * 255.0).round() as u8);
        bytes.push((w * 255.0).round() as u8);
    }
    let file = fs::File::create(path)?;
    let writer = std::io::BufWriter::new(file);
    let mut encoder = png::Encoder::new(writer, width as u32, height as u32);
    encoder.set_color(png::ColorType::Rgb);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Best);
    let mut png_writer = encoder.write_header()?;
    png_writer.write_image_data(&bytes)?;
    Ok(())
}

// Per-pixel position recovery for a single set of `cell_count` cell
// EXRs. Reads each cell's `<prefix>_K.{R,G,B}` channels, integrates
// against the manifest's (col_K, row_K), and divides by N · whitelight.
// Output buffers are the same width/height as the input cell EXRs.
pub fn composite_cells(
    cell_paths: &[PathBuf],
    cell_grid: &[(i32, i32)],
    cells_per_side: usize,
    light_group_prefix: &str,
) -> Result<PositionFields, Box<dyn std::error::Error>> {
    let cell_count = cells_per_side * cells_per_side;
    if cell_paths.len() != cell_count {
        return Err(format!(
            "expected {cell_count} cell paths, got {}",
            cell_paths.len()
        )
        .into());
    }

    let first_red_name = format!("{light_group_prefix}_0.R");
    let first_green_name = format!("{light_group_prefix}_0.G");
    let first_blue_name = format!("{light_group_prefix}_0.B");
    let (width, height, _) = read_named_rgb(
        &cell_paths[0],
        [&first_red_name, &first_green_name, &first_blue_name],
    )?;
    let pixel_count = width * height;
    let mut weighted_u = vec![0.0_f32; pixel_count];
    let mut weighted_v = vec![0.0_f32; pixel_count];
    let mut whitelight = vec![0.0_f32; pixel_count];

    for cell_index in 0..cell_count {
        let red_name = format!("{light_group_prefix}_{cell_index}.R");
        let green_name = format!("{light_group_prefix}_{cell_index}.G");
        let blue_name = format!("{light_group_prefix}_{cell_index}.B");
        let (cell_width, cell_height, [red, green, blue]) = read_named_rgb(
            &cell_paths[cell_index],
            [&red_name, &green_name, &blue_name],
        )?;
        if cell_width != width || cell_height != height {
            return Err(format!(
                "cell {cell_index} dims {cell_width}x{cell_height} != cell 0 {width}x{height}"
            )
            .into());
        }
        let (column, row) = cell_grid[cell_index];
        let column_f = column as f32;
        let row_f = row as f32;
        // cell_K.R already carries `within_U * intensity_K`; adding
        // col_K * cell_K.B yields `(col_K + within_U) * intensity_K`.
        // Same shape for V using rows. Whitelight is the plain sum of
        // intensities — the denominator of the global UV ratio.
        for pixel_index in 0..pixel_count {
            weighted_u[pixel_index] += red[pixel_index] + column_f * blue[pixel_index];
            weighted_v[pixel_index] += green[pixel_index] + row_f * blue[pixel_index];
            whitelight[pixel_index] += blue[pixel_index];
        }
    }

    let n = cells_per_side as f32;
    let mut position_u = vec![0.0_f32; pixel_count];
    let mut position_v = vec![0.0_f32; pixel_count];
    for pixel_index in 0..pixel_count {
        let denominator = whitelight[pixel_index] * n;
        if denominator > 1e-6 {
            position_u[pixel_index] = weighted_u[pixel_index] / denominator;
            position_v[pixel_index] = weighted_v[pixel_index] / denominator;
        }
    }

    Ok(PositionFields {
        width,
        height,
        position_u,
        position_v,
        whitelight,
    })
}

pub fn repo_root() -> PathBuf {
    // CARGO_MANIFEST_DIR is the absolute path of scripts/bake-textures/
    // baked at compile time. Up two levels is the repo root regardless
    // of how the binary is invoked.
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .map(PathBuf::from)
        .expect("CARGO_MANIFEST_DIR has unexpected layout")
}

pub fn composite_output_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let dir = repo_root().join("public").join("composite");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_steam_3x3_manifest() {
        let json = r#"{
            "cellsPerSide": 3,
            "cells": [
                {"index": 0, "col": 0, "row": 2, "uvOrigin": [0.0, 0.667], "uvSize": [0.333, 0.333]},
                {"index": 1, "col": 1, "row": 2, "uvOrigin": [0.333, 0.667], "uvSize": [0.333, 0.333]},
                {"index": 2, "col": 2, "row": 2, "uvOrigin": [0.667, 0.667], "uvSize": [0.333, 0.333]},
                {"index": 3, "col": 0, "row": 1, "uvOrigin": [0.0, 0.333], "uvSize": [0.333, 0.333]},
                {"index": 4, "col": 1, "row": 1, "uvOrigin": [0.333, 0.333], "uvSize": [0.333, 0.333]},
                {"index": 5, "col": 2, "row": 1, "uvOrigin": [0.667, 0.333], "uvSize": [0.333, 0.333]},
                {"index": 6, "col": 0, "row": 0, "uvOrigin": [0.0, 0.0], "uvSize": [0.333, 0.333]},
                {"index": 7, "col": 1, "row": 0, "uvOrigin": [0.333, 0.0], "uvSize": [0.333, 0.333]},
                {"index": 8, "col": 2, "row": 0, "uvOrigin": [0.667, 0.0], "uvSize": [0.333, 0.333]}
            ]
        }"#;
        let manifest: CellsManifest = serde_json::from_str(json).unwrap();
        assert_eq!(manifest.cells_per_side, 3);
        assert_eq!(manifest.cells.len(), 9);
        let cell_grid = build_cell_grid(&manifest);
        assert_eq!(cell_grid.len(), 9);
        // Cell 0 is at (col=0, row=2) per the bmesh subdivide order.
        assert_eq!(cell_grid[0], (0, 2));
        // Cell 4 is the center of a 3x3 grid.
        assert_eq!(cell_grid[4], (1, 1));
        // Last cell is at (col=2, row=0) — the upper-right of the grid.
        assert_eq!(cell_grid[8], (2, 0));
    }

    #[test]
    fn build_cell_grid_tolerates_out_of_range_indices() {
        let manifest = CellsManifest {
            cells_per_side: 2,
            cells: vec![
                CellEntry { index: 0, col: 0, row: 1 },
                CellEntry { index: 99, col: 7, row: 7 },
                CellEntry { index: 3, col: 1, row: 0 },
            ],
        };
        let grid = build_cell_grid(&manifest);
        assert_eq!(grid.len(), 4);
        assert_eq!(grid[0], (0, 1));
        assert_eq!(grid[3], (1, 0));
    }
}

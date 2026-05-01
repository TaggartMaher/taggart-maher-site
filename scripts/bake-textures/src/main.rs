// Bakes the runtime composite inputs from Blender's per-cell light-group
// AOVs:
//
//   public/composite/position.exr  (RGBA16F, half-float)
//     R = emitter U   in [0, 1]
//     G = emitter V   in [0, 1]
//     B = whitelight  (scene-referred, linear)
//     A = 1.0
//
//   public/composite/beauty.png    (8-bit sRGB)
//     The scene rendered with the screen emitter off.
//
// The cell-loop math that the runtime shader used to do per fragment
// happens here once at build time; the shader is then a two-texture
// sample. See COMPOSITE_THEORY.md for the math.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use exr::prelude::*;
// `exr::prelude::*` re-exports a `Result<T>` alias bound to its own
// error type; shadow it with `std::result::Result` so this file can
// keep using the two-parameter form.
use std::result::Result;

use half::f16;
use serde::Deserialize;

// Sigma of the 2D Gaussian applied to (U, V, whitelight) before
// encoding. 0 disables the blur. Tune to soften cell-boundary flicker
// against reflection sharpness.
const POSITION_BLUR_SIGMA_PX: f32 = 2.0;

#[derive(Deserialize)]
struct CellsManifest {
    #[serde(rename = "cellsPerSide")]
    cells_per_side: usize,
    cells: Vec<CellEntry>,
}

#[derive(Deserialize)]
struct CellEntry {
    index: usize,
    col: i32,
    row: i32,
}

fn linear_to_srgb_byte(linear: f32) -> u8 {
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

fn gaussian_blur_2d(buffer: &mut [f32], width: usize, height: usize, sigma: f32) {
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
// Cell EXRs name them `screen_K.{R,G,B}`; the beauty EXR names them
// `R/G/B` directly.
fn read_named_rgb(
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
fn write_position_exr(
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

fn write_beauty_png(
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

fn cell_path(cells_dir: &Path, cell_index: usize) -> Option<PathBuf> {
    let padded = cells_dir.join(format!("screen_{cell_index}_0001.exr"));
    if padded.is_file() {
        return Some(padded);
    }
    let unpadded = cells_dir.join(format!("screen_{cell_index}_.exr"));
    if unpadded.is_file() {
        return Some(unpadded);
    }
    None
}

fn repo_root() -> PathBuf {
    // CARGO_MANIFEST_DIR is the absolute path of scripts/bake-textures/
    // baked at compile time. Up two levels is the repo root regardless
    // of how the binary is invoked.
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .map(PathBuf::from)
        .expect("CARGO_MANIFEST_DIR has unexpected layout")
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let blender_renders_dir = match env::var("BLENDER_RENDERS_DIR") {
        Ok(value) if !value.is_empty() => PathBuf::from(value),
        _ => {
            eprintln!(
                "[bake] BLENDER_RENDERS_DIR is unset — skipping bake. Site will run in fallback mode."
            );
            return Ok(());
        }
    };

    let cells_per_side: usize = env::var("CELLS_PER_SIDE")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(9);
    let cell_count = cells_per_side * cells_per_side;

    let cells_dir = blender_renders_dir.join("cells");
    let manifest_path = cells_dir.join("cells_manifest.json");
    if !manifest_path.is_file() {
        eprintln!(
            "[bake] {} missing — skipping bake.",
            manifest_path.display()
        );
        return Ok(());
    }
    let manifest_text = fs::read_to_string(&manifest_path)?;
    let manifest: CellsManifest = serde_json::from_str(&manifest_text)?;
    if manifest.cells_per_side != cells_per_side {
        return Err(format!(
            "CELLS_PER_SIDE={} disagrees with cells_manifest.json's {}",
            cells_per_side, manifest.cells_per_side
        )
        .into());
    }

    let mut cell_grid: Vec<(i32, i32)> = vec![(0, 0); cell_count];
    for cell in manifest.cells.iter() {
        if cell.index < cell_count {
            cell_grid[cell.index] = (cell.col, cell.row);
        }
    }

    let mut cell_paths: Vec<PathBuf> = Vec::with_capacity(cell_count);
    for cell_index in 0..cell_count {
        match cell_path(&cells_dir, cell_index) {
            Some(path) => cell_paths.push(path),
            None => {
                eprintln!(
                    "[bake] missing cell {} EXR in {} — skipping bake.",
                    cell_index,
                    cells_dir.display()
                );
                return Ok(());
            }
        }
    }

    let beauty_path = blender_renders_dir.join("beauty").join("beauty-0001.exr");
    if !beauty_path.is_file() {
        eprintln!(
            "[bake] beauty frame 1 missing at {} — skipping bake.",
            beauty_path.display()
        );
        return Ok(());
    }

    let composite_dir = repo_root().join("public").join("composite");
    fs::create_dir_all(&composite_dir)?;
    let position_out = composite_dir.join("position.exr");
    let beauty_out = composite_dir.join("beauty.png");

    eprintln!("[bake] reading {cell_count} cells, accumulating per-pixel sums...");
    let (width, height, _) = read_named_rgb(
        &cell_paths[0],
        ["screen_0.R", "screen_0.G", "screen_0.B"],
    )?;
    let pixel_count = width * height;
    let mut weighted_u = vec![0.0_f32; pixel_count];
    let mut weighted_v = vec![0.0_f32; pixel_count];
    let mut whitelight = vec![0.0_f32; pixel_count];

    for cell_index in 0..cell_count {
        let red_name = format!("screen_{cell_index}.R");
        let green_name = format!("screen_{cell_index}.G");
        let blue_name = format!("screen_{cell_index}.B");
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

    eprintln!("[bake] dividing by N · whitelight to extract emitter UV...");
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

    if POSITION_BLUR_SIGMA_PX > 0.0 {
        eprintln!("[bake] applying Gaussian blur (sigma = {POSITION_BLUR_SIGMA_PX} px)...");
        gaussian_blur_2d(&mut position_u, width, height, POSITION_BLUR_SIGMA_PX);
        gaussian_blur_2d(&mut position_v, width, height, POSITION_BLUR_SIGMA_PX);
        gaussian_blur_2d(&mut whitelight, width, height, POSITION_BLUR_SIGMA_PX);
    }

    eprintln!(
        "[bake] writing {} ({}x{}, RGBA16F uncompressed)...",
        position_out.display(),
        width,
        height
    );
    write_position_exr(
        &position_out,
        width,
        height,
        &position_u,
        &position_v,
        &whitelight,
    )?;

    eprintln!("[bake] writing beauty PNG...");
    let (beauty_width, beauty_height, [beauty_r, beauty_g, beauty_b]) =
        read_named_rgb(&beauty_path, ["R", "G", "B"])?;
    write_beauty_png(
        &beauty_out,
        beauty_width,
        beauty_height,
        &beauty_r,
        &beauty_g,
        &beauty_b,
    )?;

    eprintln!("[bake] done.");
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("[bake] error: {error}");
            ExitCode::FAILURE
        }
    }
}

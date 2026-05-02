// Bakes the runtime composite inputs from the scene-pass per-cell
// light-group AOVs:
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
// See COMPOSITE_THEORY.md for the per-pixel position-recovery math
// that composite::composite_cells implements.

use std::env;
use std::path::{Path, PathBuf};
use std::result::Result;

use crate::composite;

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

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let blender_renders_dir = match env::var("BLENDER_RENDERS_DIR") {
        Ok(value) if !value.is_empty() => PathBuf::from(value),
        _ => {
            eprintln!(
                "[bake static] BLENDER_RENDERS_DIR is unset — skipping. Site will run in fallback mode."
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
            "[bake static] {} missing — skipping.",
            manifest_path.display()
        );
        return Ok(());
    }
    let manifest = composite::read_manifest(&manifest_path)?;
    if manifest.cells_per_side != cells_per_side {
        return Err(format!(
            "CELLS_PER_SIDE={} disagrees with cells_manifest.json's {}",
            cells_per_side, manifest.cells_per_side
        )
        .into());
    }

    let cell_grid = composite::build_cell_grid(&manifest);

    let mut cell_paths: Vec<PathBuf> = Vec::with_capacity(cell_count);
    for cell_index in 0..cell_count {
        match cell_path(&cells_dir, cell_index) {
            Some(path) => cell_paths.push(path),
            None => {
                eprintln!(
                    "[bake static] missing cell {} EXR in {} — skipping.",
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
            "[bake static] beauty frame 1 missing at {} — skipping.",
            beauty_path.display()
        );
        return Ok(());
    }

    let composite_dir = composite::composite_output_dir()?;
    let position_out = composite_dir.join("position.exr");
    let beauty_out = composite_dir.join("beauty.png");

    eprintln!("[bake static] reading {cell_count} cells, accumulating per-pixel sums...");
    let mut fields =
        composite::composite_cells(&cell_paths, &cell_grid, cells_per_side, "screen")?;

    if composite::POSITION_BLUR_SIGMA_PX > 0.0 {
        eprintln!(
            "[bake static] applying Gaussian blur (sigma = {} px)...",
            composite::POSITION_BLUR_SIGMA_PX
        );
        composite::gaussian_blur_2d(
            &mut fields.position_u,
            fields.width,
            fields.height,
            composite::POSITION_BLUR_SIGMA_PX,
        );
        composite::gaussian_blur_2d(
            &mut fields.position_v,
            fields.width,
            fields.height,
            composite::POSITION_BLUR_SIGMA_PX,
        );
        composite::gaussian_blur_2d(
            &mut fields.whitelight,
            fields.width,
            fields.height,
            composite::POSITION_BLUR_SIGMA_PX,
        );
    }

    eprintln!(
        "[bake static] writing {} ({}x{}, RGBA16F uncompressed)...",
        position_out.display(),
        fields.width,
        fields.height
    );
    composite::write_position_exr(
        &position_out,
        fields.width,
        fields.height,
        &fields.position_u,
        &fields.position_v,
        &fields.whitelight,
    )?;

    eprintln!("[bake static] writing beauty PNG...");
    let (beauty_width, beauty_height, [beauty_r, beauty_g, beauty_b]) =
        composite::read_named_rgb(&beauty_path, ["R", "G", "B"])?;
    composite::write_beauty_png(
        &beauty_out,
        beauty_width,
        beauty_height,
        &beauty_r,
        &beauty_g,
        &beauty_b,
    )?;

    eprintln!("[bake static] done.");
    Ok(())
}

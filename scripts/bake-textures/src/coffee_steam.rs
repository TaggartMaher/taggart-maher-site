// Bakes the runtime steam-overlay input by compositing 96 frames'
// worth of per-cell light-group AOVs (3×3 grid, 9 cells per frame)
// into a single position-data atlas:
//
//   public/composite/steam_atlas.exr
//     Layout: STEAM_ATLAS_COLUMNS × STEAM_ATLAS_ROWS frames packed
//     row-major, top-left = frame 0. Each frame is a half-float RGBA
//     position field (R = emitter U, G = emitter V, B = whitelight,
//     A = 1) sized to the cropped strip.
//
//   public/composite/steam_cells_manifest.json
//     Copy of the Blender-side manifest so the runtime can verify
//     cellsPerSide before sampling.
//
// See COMPOSITE_THEORY.md for the per-pixel position-recovery math.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::result::Result;

use crate::composite;

pub const STEAM_FRAME_COUNT: usize = 24;
pub const STEAM_ATLAS_COLUMNS: usize = 16;
pub const STEAM_ATLAS_ROWS: usize = 6;

fn cell_frame_path(steam_cells_dir: &Path, cell_index: usize, frame_number: usize) -> PathBuf {
    steam_cells_dir.join(format!("steam_{cell_index}_{frame_number:04}.exr"))
}

fn combined_frame_path(steam_cells_dir: &Path, frame_number: usize) -> PathBuf {
    steam_cells_dir.join(format!("steam_combined_{frame_number:04}.exr"))
}

// EXR channel name written by the CoffeeSteam compositor's combined
// File Output node — its `file_output_items` entry is named
// "steam_combined", so each channel inside lands as
// `steam_combined.{R,G,B,A}`.
const COMBINED_ALPHA_CHANNEL: &str = "steam_combined.A";

fn read_optional_float_env(name: &str) -> Option<f32> {
    env::var(name).ok().and_then(|value| value.parse::<f32>().ok())
}

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let blender_renders_dir = match env::var("BLENDER_RENDERS_DIR") {
        Ok(value) if !value.is_empty() => PathBuf::from(value),
        _ => {
            eprintln!(
                "[bake coffee-steam] BLENDER_RENDERS_DIR is unset — skipping. Site will run without steam."
            );
            return Ok(());
        }
    };

    // Crop env vars are authoritative for render_steam.sh and the
    // runtime shader; the baker just logs them so a mismatch shows up
    // in build output. The per-frame dim is derived from the cell EXR
    // itself.
    let crop_min_x = read_optional_float_env("STEAM_CROP_MIN_X");
    let crop_max_x = read_optional_float_env("STEAM_CROP_MAX_X");
    let crop_min_y = read_optional_float_env("STEAM_CROP_MIN_Y");
    let crop_max_y = read_optional_float_env("STEAM_CROP_MAX_Y");
    if let (Some(min_x), Some(max_x), Some(min_y), Some(max_y)) =
        (crop_min_x, crop_max_x, crop_min_y, crop_max_y)
    {
        eprintln!(
            "[bake coffee-steam] strip in frame coords: x={:.3}..{:.3}, y={:.3}..{:.3}",
            min_x, max_x, min_y, max_y
        );
    } else {
        eprintln!(
            "[bake coffee-steam] STEAM_CROP_* env vars missing or unparseable — runtime defaults will be used."
        );
    }

    // POSITION_BLUR_SIGMA_PX is tuned in atlas pixels at the .blend's
    // native render resolution. render_steam.sh multiplies render_x /
    // render_y by STEAM_RESOLUTION_MULTIPLIER to sharpen the steam
    // pass without rescaling the overlay; if we kept sigma fixed, the
    // scene-space softness would shrink by the same factor and
    // cell-boundary flicker could come back. Scale sigma by the same
    // multiplier so the post-blur radius in scene units stays
    // identical regardless of multiplier setting. Default to 4.0 —
    // matches render_steam.sh's default.
    let steam_resolution_multiplier =
        read_optional_float_env("STEAM_RESOLUTION_MULTIPLIER").unwrap_or(4.0);
    let steam_blur_sigma_px = composite::POSITION_BLUR_SIGMA_PX * steam_resolution_multiplier;
    eprintln!(
        "[bake coffee-steam] resolution multiplier {:.3} → blur sigma {:.3} atlas px",
        steam_resolution_multiplier, steam_blur_sigma_px
    );

    let steam_cells_dir = blender_renders_dir.join("steam_cells");
    let manifest_path = steam_cells_dir.join("steam_cells_manifest.json");
    if !manifest_path.is_file() {
        eprintln!(
            "[bake coffee-steam] {} missing — skipping.",
            manifest_path.display()
        );
        return Ok(());
    }
    let manifest = composite::read_manifest(&manifest_path)?;
    if manifest.cells_per_side != 3 {
        return Err(format!(
            "expected steam manifest cellsPerSide=3, got {}",
            manifest.cells_per_side
        )
        .into());
    }
    let cell_grid = composite::build_cell_grid(&manifest);
    let cell_count = manifest.cells_per_side * manifest.cells_per_side;

    // Verify every per-frame cell EXR exists before doing real work.
    // Saves the user from a half-finished atlas if a frame is missing.
    for frame_number in 1..=STEAM_FRAME_COUNT {
        for cell_index in 0..cell_count {
            let path = cell_frame_path(&steam_cells_dir, cell_index, frame_number);
            if !path.is_file() {
                eprintln!(
                    "[bake coffee-steam] missing cell {} frame {} at {} — skipping.",
                    cell_index,
                    frame_number,
                    path.display()
                );
                return Ok(());
            }
        }
    }

    // The Combined-pass alpha (volume density) is optional: if the
    // file is missing for every frame, the atlas's alpha channel falls
    // back to 0 and the runtime composites purely additively (same
    // visual result as before this change). If it's missing only for
    // *some* frames, that's a render misconfiguration — fail fast.
    let combined_alpha_present = combined_frame_path(&steam_cells_dir, 1).is_file();
    if combined_alpha_present {
        for frame_number in 1..=STEAM_FRAME_COUNT {
            let path = combined_frame_path(&steam_cells_dir, frame_number);
            if !path.is_file() {
                return Err(format!(
                    "combined-alpha frame 1 exists but frame {} missing at {} — \
                     re-render the CoffeeSteam pass for all frames or remove frame 1",
                    frame_number,
                    path.display()
                )
                .into());
            }
        }
        eprintln!(
            "[bake coffee-steam] combined-alpha present — atlas A channel will carry density."
        );
    } else {
        eprintln!(
            "[bake coffee-steam] no steam_combined_####.exr — atlas A = 0 (purely additive runtime)."
        );
    }

    let composite_dir = composite::composite_output_dir()?;
    let atlas_out = composite_dir.join("steam_atlas.png");
    let atlas_meta_out = composite_dir.join("steam_atlas_meta.json");
    let manifest_out = composite_dir.join("steam_cells_manifest.json");

    // Prime atlas dims from frame 1's cell 0. All cells across all
    // frames must match — Cycles writes consistent crop dims when the
    // render-region settings don't change between frames.
    let probe_path = cell_frame_path(&steam_cells_dir, 0, 1);
    let (frame_width, frame_height, _) =
        composite::read_named_rgb(&probe_path, ["steam_0.R", "steam_0.G", "steam_0.B"])?;
    let atlas_width = frame_width * STEAM_ATLAS_COLUMNS;
    let atlas_height = frame_height * STEAM_ATLAS_ROWS;
    let atlas_pixel_count = atlas_width * atlas_height;
    let mut atlas_position_u = vec![0.0_f32; atlas_pixel_count];
    let mut atlas_position_v = vec![0.0_f32; atlas_pixel_count];
    let mut atlas_whitelight = vec![0.0_f32; atlas_pixel_count];
    let mut atlas_density = vec![0.0_f32; atlas_pixel_count];

    eprintln!(
        "[bake coffee-steam] per-frame dim {}x{}, atlas {}x{} ({} cols × {} rows × {} frames)",
        frame_width,
        frame_height,
        atlas_width,
        atlas_height,
        STEAM_ATLAS_COLUMNS,
        STEAM_ATLAS_ROWS,
        STEAM_FRAME_COUNT
    );

    for frame_number in 1..=STEAM_FRAME_COUNT {
        let mut cell_paths: Vec<PathBuf> = Vec::with_capacity(cell_count);
        for cell_index in 0..cell_count {
            cell_paths.push(cell_frame_path(&steam_cells_dir, cell_index, frame_number));
        }
        let fields = composite::composite_cells(
            &cell_paths,
            &cell_grid,
            manifest.cells_per_side,
            "steam",
            steam_blur_sigma_px,
        )?;
        if fields.width != frame_width || fields.height != frame_height {
            return Err(format!(
                "frame {} dim {}x{} != frame 1 {}x{}",
                frame_number, fields.width, fields.height, frame_width, frame_height
            )
            .into());
        }
        // Read the Combined-pass alpha for this frame (if present)
        // and verify dims match the cell EXRs. The Combined pass and
        // the per-cell passes share the same render border + render
        // resolution, so their crop dims agree by construction.
        let mut density_field = if combined_alpha_present {
            let combined_path = combined_frame_path(&steam_cells_dir, frame_number);
            let (combined_width, combined_height, samples) =
                composite::read_named_alpha(&combined_path, COMBINED_ALPHA_CHANNEL)?;
            if combined_width != fields.width || combined_height != fields.height {
                return Err(format!(
                    "combined frame {} dim {}x{} != cell {}x{}",
                    frame_number, combined_width, combined_height, fields.width, fields.height
                )
                .into());
            }
            samples
        } else {
            vec![0.0_f32; fields.width * fields.height]
        };

        // Position fields (U/V/whitelight) are already blurred inside
        // composite_cells before the per-pixel divide. Density comes
        // from a separate EXR, so blur it here to match the position
        // fields' softness — keeps the steam edge from looking harder
        // in the density channel than in the scattered-light channel.
        if steam_blur_sigma_px > 0.0 {
            composite::gaussian_blur_2d(
                &mut density_field,
                fields.width,
                fields.height,
                steam_blur_sigma_px,
            );
        }

        let frame_index = frame_number - 1;
        let frame_col = frame_index % STEAM_ATLAS_COLUMNS;
        let frame_row = frame_index / STEAM_ATLAS_COLUMNS;
        let atlas_x_origin = frame_col * frame_width;
        let atlas_y_origin = frame_row * frame_height;
        for row_within in 0..frame_height {
            let atlas_row = atlas_y_origin + row_within;
            let frame_row_offset = row_within * frame_width;
            let atlas_row_offset = atlas_row * atlas_width + atlas_x_origin;
            for column_within in 0..frame_width {
                let atlas_index = atlas_row_offset + column_within;
                let frame_index_local = frame_row_offset + column_within;
                atlas_position_u[atlas_index] = fields.position_u[frame_index_local];
                atlas_position_v[atlas_index] = fields.position_v[frame_index_local];
                atlas_whitelight[atlas_index] = fields.whitelight[frame_index_local];
                atlas_density[atlas_index] = density_field[frame_index_local];
            }
        }

        if frame_number % 8 == 0 || frame_number == STEAM_FRAME_COUNT {
            eprintln!(
                "[bake coffee-steam] composited frame {}/{}",
                frame_number, STEAM_FRAME_COUNT
            );
        }
    }

    // Compute the max whitelight across the whole atlas so we can
    // normalize the [0, max] linear range into the [0, 1] window the
    // PNG encoder needs. Floor at 1e-6 to avoid divide-by-zero when
    // every pixel is dark; the runtime multiplies the sampled .b back
    // by this scale.
    let max_whitelight = atlas_whitelight
        .iter()
        .fold(0.0_f32, |accumulator, value| accumulator.max(*value));
    let whitelight_scale = max_whitelight.max(1e-6);

    eprintln!(
        "[bake coffee-steam] writing {} ({}x{}, RGBA8 PNG; whitelightScale = {:.6})...",
        atlas_out.display(),
        atlas_width,
        atlas_height,
        whitelight_scale
    );
    composite::write_position_png_8bit(
        &atlas_out,
        atlas_width,
        atlas_height,
        &atlas_position_u,
        &atlas_position_v,
        &atlas_whitelight,
        &atlas_density,
        whitelight_scale,
    )?;

    let meta_json = serde_json::json!({
        "whitelightScale": whitelight_scale,
        "atlasColumns": STEAM_ATLAS_COLUMNS,
        "atlasRows": STEAM_ATLAS_ROWS,
        "frameCount": STEAM_FRAME_COUNT,
    });
    fs::write(&atlas_meta_out, serde_json::to_string_pretty(&meta_json)?)?;
    eprintln!(
        "[bake coffee-steam] wrote atlas meta -> {}",
        atlas_meta_out.display()
    );

    eprintln!(
        "[bake coffee-steam] copying manifest to {}",
        manifest_out.display()
    );
    fs::copy(&manifest_path, &manifest_out)?;

    eprintln!("[bake coffee-steam] done.");
    Ok(())
}

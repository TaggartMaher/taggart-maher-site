// CLI dispatcher for the bake binary. Two routes:
//
//   bake-textures static
//     Composites the scene-pass per-cell EXRs into
//     public/composite/{position.exr, beauty.png}. See static.rs.
//
//   bake-textures coffee-steam
//     Composites the rendered steam frames into a single
//     public/composite/steam_atlas.png. Frame-grid layout is read from
//     STEAM_ATLAS_COLUMNS / STEAM_ATLAS_ROWS env vars. See
//     coffee_steam.rs.
//
// build.sh / dev.sh runs both routes sequentially.

use std::env;
use std::process::ExitCode;

mod composite;
mod coffee_steam;
#[path = "static.rs"]
mod static_pass;

fn print_usage() {
    eprintln!("usage: bake-textures <static|coffee-steam>");
}

fn main() -> ExitCode {
    let arguments: Vec<String> = env::args().collect();
    let subcommand = match arguments.get(1) {
        Some(value) => value.as_str(),
        None => {
            print_usage();
            return ExitCode::FAILURE;
        }
    };

    let result = match subcommand {
        "static" => static_pass::run(),
        "coffee-steam" => coffee_steam::run(),
        "--help" | "-h" | "help" => {
            print_usage();
            return ExitCode::SUCCESS;
        }
        other => {
            eprintln!("[bake] unknown subcommand: {other}");
            print_usage();
            return ExitCode::FAILURE;
        }
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("[bake] error: {error}");
            ExitCode::FAILURE
        }
    }
}

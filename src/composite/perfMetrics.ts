// Per-frame performance snapshot the Compositor publishes for any UI that
// wants to display it (currently the debug menu). Kept separate from
// Compositor.tsx so the React fast-refresh boundary stays clean.
//
// CPU/GPU times are smoothed (EMA) inside the compositor so the readout
// is legible. `gpuFrameMs` is null when EXT_disjoint_timer_query_webgl2
// is unavailable (some browser/OS/driver combinations).
export interface PerfMetrics {
  displayFps: number;
  cpuFrameMs: number;
  gpuFrameMs: number | null;
  // How often the screen-content rasterizer (snapDOM) is producing
  // updated frames into the screen-content canvas. Decoupled from
  // displayFps — the compositor still draws at the display rate even
  // when the rasterizer has nothing new to publish. Updated by
  // ScreenOverlay.
  rasterizerFps: number;
  // True when the GPU is busy AND the rasterizer is actively producing
  // frames. Computed and published by ScreenOverlay; SteamCompositor
  // reads it to suspend the steam pass during interaction. The
  // rasterizerFps > 0 gate keeps us out of low-power on a baseline-
  // expensive iGPU where idle gpuFrameMs alone could trip the threshold.
  lowPowerMode: boolean;
}

export function makeEmptyPerfMetrics(): PerfMetrics {
  return {
    displayFps: 0,
    cpuFrameMs: 0,
    gpuFrameMs: null,
    rasterizerFps: 0,
    lowPowerMode: false,
  };
}

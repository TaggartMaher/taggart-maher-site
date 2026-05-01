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
}

export function makeEmptyPerfMetrics(): PerfMetrics {
  return { displayFps: 0, cpuFrameMs: 0, gpuFrameMs: null };
}

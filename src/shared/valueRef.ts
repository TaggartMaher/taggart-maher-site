// Framework-free replacement for the React RefObjects that used to
// plumb mutable, non-reactive values between the screen overlay and
// the compositors (offscreen canvas, revision counter, perf metrics).
// Mutating `current` intentionally does not trigger any re-render —
// the rAF loops poll it.
export interface ValueRef<T> {
  current: T;
}

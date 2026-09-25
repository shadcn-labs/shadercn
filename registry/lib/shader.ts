import { d, std, tgpu } from "typegpu";

/** 2D rotation matrix — spins and tilts a ray before marching it. */
export const rot2 = tgpu.fn(
  [d.f32],
  d.mat2x2f
)((angle) => {
  "use gpu";
  const c = std.cos(angle);
  const s = std.sin(angle);
  return d.mat2x2f(d.vec2f(c, -s), d.vec2f(s, c));
});

/** BT.601 luminance — the axis saturation and scatter extinction work about. */
export const luma = tgpu.fn(
  [d.vec3f],
  d.f32
)((col) => std.dot(col, d.vec3f(0.299, 0.587, 0.114)));

/**
 * Safety taper at the frame boundary: 1 inside `fadeStart`, 0 by the time the
 * orb-space radius reaches 1.
 *
 * `fadeStart` is clamped below 1 because the ramp degenerates there. WGSL
 * leaves `smoothstep(low, high, x)` indeterminate once `low >= high`, and Tint
 * rejects `low == high` outright when both are constants. Worse, a `fadeStart`
 * above 1 silently inverts the ramp — the orb's centre fades out instead of its
 * rim — so the value must never reach the crossover, whatever a caller passes.
 */
export const EDGE_FADE_MAX = 0.985;

export const edgeFade = tgpu.fn(
  [d.f32, d.f32],
  d.f32
)(
  (fadeStart, radius) =>
    1 - std.smoothstep(std.min(fadeStart, EDGE_FADE_MAX), 1, radius)
);

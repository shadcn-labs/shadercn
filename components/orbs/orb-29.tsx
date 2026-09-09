"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const MOSAIC_FRAG = `
fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: user input widens the lit coverage, agent output turns
  // the panel brightness up.
  var coverNow: f32 =uP_coverage + 0.07 * uInput;
  var gainNow: f32 =uP_gain * (0.85 + 0.5 * uOutput);

  // resolution-relative tile grid — same wall at every size
  var cellPx: f32 =max(min(uRes.x, uRes.y) / max(uP_cells, 8.0), 4.0);
  var cellIdx: vec2f = floor(fragCoord / cellPx);
  var cellCentre: vec2f = (cellIdx + 0.5) * cellPx;
  var g: vec2f = fract(fragCoord / cellPx); // 0..1 inside the tile

  var suv: vec2f = (2.0 * cellCentre - uRes) / min(uRes.x, uRes.y);
  var duv: vec2f = suv / uP_radius;
  var r2: f32 =dot(duv, duv);

  // blocky silhouette, cut on the tile grid like the wall itself
  var mask: f32 =1.0 - step(1.0, r2);

  var z: f32 =sqrt(max(1.0 - r2, 0.0));
  var n: vec3f = vec3f(duv, z);

  // rotating dome, stereographic projection — the blobs roll around the
  // ball as the dome turns
  var rot: f32 =uP_spin; // integrated clock
  var cr: f32 =cos(rot);
  var sr: f32 =sin(rot);
  var sp: vec3f = vec3f(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);
  var p2: vec2f = sp.xy / (abs(sp.z) + 1.2) * uP_scale * 3.0;

  /*
    Per-state motion, each on its own integrated clock:
      DRIFT    the blob field streams across the wall     (idle flows)
      CHURN    the fluid warp evolves in place            (thinking boils)
      SHUFFLE  the confetti promotion cycles              (thinking races it)
      PULSE    rings radiate from the centre              (speaking)
    Rates glide; a rate at zero freezes that motion with its phase intact.
    The pulse depth is an amplitude, so idle carries no static rings.
  */
  var driftT: f32 =uP_drift;     // integrated clock: blob stream
  var churnT: f32 =uP_churn;     // integrated clock: warp evolution
  var shuffleT: f32 =uP_shuffle; // integrated clock: confetti reshuffle
  var f1: vec2f = vec2f(driftT * 0.5, -driftT * 0.35);
  var f2: vec2f = vec2f(-churnT * 0.4, churnT * 0.6);

  /*
    FLUID domain warp: two decorrelated fbm channels displace the sample
    point before the blob field reads it, and the displacement itself
    evolves on the churn clock. The blobs curl, stretch and merge like
    liquid instead of sliding across the wall as one rigid sheet.
  */
  var warp: vec2f = vec2f(
    fbm(p2 * 0.9 + f2),
    fbm(p2 * 0.9 + f2.yx + 13.7)
  ) - 0.5;
  var field: f32 =fbm(p2 + f1 + warp * uP_swirl * 2.4);

  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.7))), 0.0, 1.0);
  var lum: f32 =smoothstep(1.0 - coverNow, 1.14 - coverNow, field
    + 0.25 * uP_light * lambert
    + uP_pulse * 0.3 * sin(length(duv) * 5.0 - driftT * 3.2));
  lum *= gainNow;

  /*
    The tile: a bevelled square face inside a frame. The face is the lit
    part; the frame stays dark; an unlit tile keeps a faint presence so the
    wall reads as hardware even where nothing is lit.
  */
  var d2: vec2f = abs(g - 0.5);
  var d: f32 =max(d2.x, d2.y);
  var face: f32 =1.0 - smoothstep(0.26, 0.36, d);
  var tile: f32 =1.0 - smoothstep(0.42, 0.48, d);
  // a soft centre hot-spot on the face, like an LED under a diffuser
  var hot: f32 =1.0 - smoothstep(0.0, 0.34, length(d2));

  /*
    Confetti: a per-tile hash cycles against the shuffle clock, and the top
    uP_confetti slice of the cycle is promoted from warm white to a fully
    saturated hue drawn from a second hash. Which tiles are coloured
    therefore reshuffles continuously — slowly at rest, fast in thought.
  */
  var h1: f32 =hash(cellIdx * 1.618 + 7.3);
  var h2: f32 =hash(cellIdx * 2.113 + 41.7);
  var cyc: f32 =fract(h1 + shuffleT * 0.06);
  var promoted: f32 =step(1.0 - uP_confetti, cyc);
  var confetti: vec3f = 0.5 + 0.5 * cos(6.2831 * (h2 + vec3f(0.0, 0.33, 0.67)));
  confetti = normalize(confetti + 0.05) * 1.2;
  var litCol: vec3f = mix(uC_lit, confetti, promoted);

  // lit face over the dark wall; frames and off-tiles stay faintly present
  var offCol: vec3f = uC_wall * tile;
  var onCol: vec3f = litCol * (face * 1.05 + hot * 0.5) * lum;
  var col: vec3f = offCol + onCol;

  col = pow(max(col, vec3f(0.0)), vec3f(uP_contrast));

  // Surface-lit orb bounded by a mask: alpha IS coverage, so premultiply —
  // the opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(col * a, a);
}
`;

export const orb29Orb: OrbVariant = {
  colors: [
    { default: "#fff2dd", key: "lit", label: "Lit tile" },
    { default: "#161616", key: "wall", label: "Wall" },
  ],
  frag: MOSAIC_FRAG,
  key: "orb-29",
  label: "ORB-29",
  note: "an LED tile wall lighting up in flowing blobs, wrapped on the ball",
  params: [
    {
      default: 0.45,
      integrate: true,
      key: "drift",
      label: "Drift",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.5,
      integrate: true,
      key: "churn",
      label: "Churn",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 1.2,
      key: "swirl",
      label: "Fluidity",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.6,
      integrate: true,
      key: "shuffle",
      label: "Shuffle",
      max: 20,
      min: 0,
      step: 0.1,
    },
    {
      default: 0,
      key: "pulse",
      label: "Pulse depth",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.1,
      integrate: true,
      key: "spin",
      label: "Roll",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 0.9,
      key: "radius",
      label: "Radius",
      max: 3,
      min: 0.15,
      step: 0.015,
    },
    {
      default: 48,
      key: "cells",
      label: "Tile grid",
      max: 160,
      min: 16,
      step: 2,
    },
    {
      default: 1.3,
      key: "scale",
      label: "Blob scale",
      max: 10,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.52,
      key: "coverage",
      label: "Coverage",
      max: 1.2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.22,
      key: "confetti",
      label: "Confetti",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.6,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 1,
      key: "gain",
      label: "Panel gain",
      max: 5,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1,
      key: "contrast",
      label: "Contrast",
      max: 10,
      min: 0.15,
      step: 0.05,
    },
  ],
  /*
    Each state animates DIFFERENTLY — its own motion, same palette and
    composition throughout (no stateColors on purpose).
  */
  /*
    Coverage is staged DOWN in the active states on purpose: the synthesized
    volumes push it up, and without the counterweight thinking and speaking
    flood the wall with light — the composition lives on its big dark
    voids, so every state keeps them.
  */
  statePresets: {
    idle: {
      churn: 0.5,
      coverage: 0.52,
      drift: 0.45,
      gain: 1,
      pulse: 0,
      shuffle: 0.6,
      spin: 0.1,
    },
    speaking: {
      churn: 0.9,
      coverage: 0.44,
      drift: 0.5,
      gain: 1.15,
      pulse: 0.55,
      shuffle: 1.2,
      spin: 0.45,
    },
    thinking: {
      churn: 1.9,
      coverage: 0.42,
      drift: 0.1,
      gain: 0.95,
      pulse: 0,
      shuffle: 5,
      spin: 0.03,
    },
  },
};

export type Orb29Props = Omit<ShaderOrbProps, "variant">;

export const Orb29 = ({ size = 280, ...rest }: Orb29Props) => (
  <ShaderOrb variant={orb29Orb} size={size} {...rest} />
);

export default Orb29;

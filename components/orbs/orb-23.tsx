"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const PHOSPHOR_FRAG = `
fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: user input densifies the glyphs, agent output turns
  // the phosphor up — the matrix visibly burns brighter while it speaks.
  var densBias: f32 =uP_density + 0.2 * uInput;
  var gainNow: f32 =uP_gain * (0.85 + 0.5 * uOutput);

  // resolution-relative glyph grid — same character count at every size
  var cellPx: f32 =max(min(uRes.x, uRes.y) / max(uP_cells, 8.0), 4.0);
  var cellIdx: vec2f = floor(fragCoord / cellPx);
  var cellCentre: vec2f = (cellIdx + 0.5) * cellPx;
  var g: vec2f = fract(fragCoord / cellPx); // 0..1 inside the cell

  var suv: vec2f = (2.0 * cellCentre - uRes) / min(uRes.x, uRes.y);
  var nuv: vec2f = suv / uP_radius;
  var r2: f32 =dot(nuv, nuv);

  // blocky silhouette, cut on the cell grid like the rest of the matrix
  var mask: f32 =1.0 - step(1.0, r2);

  var z: f32 =sqrt(max(1.0 - r2, 0.0));
  var n: vec3f = vec3f(nuv, z);

  // rotating dome, stereographic projection — the weave compresses toward
  // the rim and rolls around the ball as the dome turns
  var rot: f32 =uP_spin; // integrated clock
  var cr: f32 =cos(rot);
  var sr: f32 =sin(rot);
  var sp: vec3f = vec3f(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);
  var p2: vec2f = sp.xy / (abs(sp.z) + 1.2) * uP_scale * 3.0;

  /*
    Three motions, one per state, each on its OWN integrated clock so a
    state change morphs the movement instead of jumping it:

      DRIFT   diagonal lava-flow streaming        (idle)
      SCROLL  vertical paging, terminal-style     (thinking)
      PULSE   radial waves radiating from centre  (speaking)

    The clocks are rates in the presets — a rate gliding to zero freezes
    that motion in place, phase intact. The pulse's amplitude is a separate
    non-integrated param, so idle carries no static rings.
  */
  var driftT: f32 =uP_drift;   // integrated clock: diagonal stream
  var scrollT: f32 =uP_scroll; // integrated clock: vertical paging
  var t: f32 =uP_speed;        // integrated clock: pulse phase
  var flow: vec2f = vec2f(driftT * 0.6, -driftT * 0.45 - scrollT);

  var field: f32 =fbm(p2 + flow);
  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.7))), 0.0, 1.0);
  var dens: f32 =clamp((field - 0.5) * 1.8 + densBias + 0.4 * uP_light * lambert
    + uP_pulse * 0.35 * sin(length(nuv) * 5.5 - t * 2.4), 0.0, 1.0);

  /*
    The glyph: four dash rows split by three stripe gaps. Rows light from
    the bottom as density rises — the step() against the row index IS the
    ASCII quantizer, so a cell is always a whole character.
  */
  var rowI: f32 =floor(g.y * 4.0);
  var bar: f32 =step(0.22, fract(g.y * 4.0)) * step(fract(g.y * 4.0), 0.9);
  var stripe: f32 =step(0.18, fract(g.x * 3.0));
  var lit: f32 =step(rowI + 0.5, dens * 4.0 * gainNow);
  var glyph: f32 =bar * stripe * lit;

  /*
    Blocky dropouts: the same field, resampled on a 2x2 super-grid and
    thresholded. Because whole super-cells fail together, the dark zones
    become hard rectangular holes instead of dim characters.
  */
  var superCentre: vec2f = (floor(cellIdx / 2.0) * 2.0 + 1.0) * cellPx;
  var sSuv: vec2f = (2.0 * superCentre - uRes) / min(uRes.x, uRes.y);
  var sUv2: vec2f = sSuv / uP_radius;
  var sz: f32 =sqrt(max(1.0 - dot(sUv2, sUv2), 0.0));
  var ssp: vec3f = vec3f(sUv2.x * cr - sz * sr, sUv2.y, sUv2.x * sr + sz * cr);
  var superField: f32 =fbm(ssp.xy / (abs(ssp.z) + 1.2) * uP_scale * 3.0 + flow);
  var keep: f32 =step(uP_dropout, superField + 0.15 * uOutput);
  glyph *= keep;

  // phosphor ramp: deep green floor to hot glow, whitening at the top end
  var glyphCol: vec3f = mix(uC_deep, uC_glow, dens);
  glyphCol += vec3f(0.7, 1.0, 0.9) * pow(dens, 3.0) * 0.35;

  // a dark body under the matrix plus a glow-coloured fresnel rim, so the
  // orb reads as a solid ball and not loose characters
  var fres: f32 =pow(1.0 - z, 2.2);
  var col: vec3f = uC_deep * 0.22 + glyphCol * glyph + uC_glow * fres * uP_rim;

  col = pow(max(col, vec3f(0.0)), vec3f(uP_contrast));

  // Surface-lit orb bounded by a mask: alpha IS coverage, so premultiply —
  // the opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(col * a, a);
}
`;

export const orb23Orb: OrbVariant = {
  colors: [
    { default: "#57ffc9", key: "glow", label: "Glow" },
    { default: "#0b3b2d", key: "deep", label: "Deep" },
  ],
  frag: PHOSPHOR_FRAG,
  key: "orb-23",
  label: "ORB-23",
  note: "an ASCII glyph matrix in CRT green, wrapped on the ball",
  params: [
    {
      default: 0.55,
      integrate: true,
      key: "drift",
      label: "Drift",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.05,
      integrate: true,
      key: "scroll",
      label: "Scroll",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.5,
      integrate: true,
      key: "speed",
      label: "Pulse rate",
      max: 10,
      min: 0.015,
      step: 0.05,
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
      default: 0.12,
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
      default: 40,
      key: "cells",
      label: "Glyph grid",
      max: 120,
      min: 16,
      step: 2,
    },
    {
      default: 1.6,
      key: "scale",
      label: "Field scale",
      max: 10,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.48,
      key: "density",
      label: "Glyph density",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.48,
      key: "dropout",
      label: "Dropout",
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
      default: 0.45,
      key: "rim",
      label: "Rim glow",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 1,
      key: "gain",
      label: "Phosphor gain",
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
  // violet at rest, aqua while searching, red while answering
  stateColors: {
    idle: { glow: "#6a57ff" },
    speaking: { glow: "#ff5757" },
    thinking: { glow: "#57ffe3" },
  },
  /*
    Each state ANIMATES differently — its own kind of motion, not just its
    own speed — and each has its own phosphor colour. Every motion has its own integrated clock, so a rate gliding to zero
    freezes that motion in place with its phase intact; the pulse depth is
    an amplitude.
  */
  statePresets: {
    idle: {
      cells: 68,
      density: 0.31,
      drift: 0.55,
      dropout: 0.24,
      gain: 0.9,
      light: 1.11,
      pulse: 0,
      rim: 0.66,
      scale: 5.1,
      scroll: 0.05,
      speed: 0.52,
      spin: 0.12,
    },
    speaking: {
      cells: 120,
      density: 0.56,
      drift: 0.4,
      dropout: 0.59,
      gain: 2.95,
      light: 0.39,
      pulse: 1.27,
      rim: 0.51,
      scale: 7.2,
      scroll: 0.1,
      speed: 2.85,
      spin: 1.05,
    },
    thinking: {
      cells: 86,
      contrast: 1.3,
      density: 0.33,
      drift: 3.05,
      dropout: 0.13,
      gain: 0.95,
      light: 0.855,
      pulse: 0.58,
      rim: 0.51,
      scroll: 0.65,
      speed: 0.45,
      spin: 0.04,
    },
  },
};

export type Orb23Props = Omit<ShaderOrbProps, "variant">;

export const Orb23 = ({ size = 280, ...rest }: Orb23Props) => (
  <ShaderOrb variant={orb23Orb} size={size} {...rest} />
);

export default Orb23;

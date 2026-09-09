"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const RADAR_FRAG = `
const VORTICES: i32 = 6;
const FBM3_OCT: i32 = 4;
// Volume-reactive values, resolved once per fragment in main().
var<private> radarLoNow: f32;
var<private> radarDensityNow: f32;

/*
  3D value noise. The prelude's noise is 2D, and a 2D field wrapped onto
  the ball has to be projected — and every projection either distorts
  somewhere or seams somewhere, which is exactly what the roll dragged
  into view. Evaluating the field ON the sphere's own points needs
  nothing projected: the roll is just a rotation of the sample point.
*/
fn hash3(p: vec3f) -> f32 {
  return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453123);
}
fn noise3(p: vec3f) -> f32 {
  var i: vec3f = floor(p);
  var f: vec3f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  var n000: f32 =hash3(i);
  var n100: f32 =hash3(i + vec3f(1.0, 0.0, 0.0));
  var n010: f32 =hash3(i + vec3f(0.0, 1.0, 0.0));
  var n110: f32 =hash3(i + vec3f(1.0, 1.0, 0.0));
  var n001: f32 =hash3(i + vec3f(0.0, 0.0, 1.0));
  var n101: f32 =hash3(i + vec3f(1.0, 0.0, 1.0));
  var n011: f32 =hash3(i + vec3f(0.0, 1.0, 1.0));
  var n111: f32 =hash3(i + vec3f(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}
fn fbm3(p: vec3f) -> f32 {
  var q: vec3f = p;
  var v: f32 =0.0;
  var a: f32 =0.5;
  for (var i: i32 =0; i < FBM3_OCT; i = i + 1) {
    v += a * noise3(q);
    q = q * 2.03 + vec3f(11.7, 7.3, 3.1);
    a *= 0.5;
  }
  return v;
}

// rotate v about the unit axis k by angle a (Rodrigues)
fn rotateAbout(v: vec3f, k: vec3f, a: f32) -> vec3f {
  var c: f32 =cos(a);
  var s: f32 =sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

// the precipitation intensity, 0..1, at a point of the unit sphere
fn intensity(sp: vec3f, t: f32) -> f32 {
  var q: vec3f = sp;
  /*
    The vortices: hashed points on the sphere, each twisting the space
    around itself — a rotation about the axis through it, by an angle
    that falls off with the angular distance, alternating in sense. The
    centres wander slowly so no spiral sits still.
  */
  for (var k: i32 =0; k < VORTICES; k = k + 1) {
    var fk: f32 =f32(k);
    var c: vec3f = normalize(vec3f(
      hash(vec2f(fk * 3.7, 1.1)) - 0.5,
      hash(vec2f(fk * 5.9, 2.3)) - 0.5,
      hash(vec2f(fk * 7.1, 4.9)) - 0.5
    ));
    c = rotateAbout(c, vec3f(0.0, 1.0, 0.0), sin(t * 0.09 + fk * 1.7) * 0.25);
    var ang: f32 =acos(clamp(dot(q, c), -1.0, 1.0));
    var fall: f32 =exp(-ang * ang / (uP_vortex * uP_vortex));
    var a: f32 =uP_swirl * fall * select(-1.0, 1.0, (fk % 2.0) < 0.5);
    q = rotateAbout(q, c, a);
  }

  // bend, then drift the noise through the twisted space
  var w: vec3f = vec3f(noise3(q * 1.3 + 2.1), noise3(q * 1.3 + 7.3), noise3(q * 1.3 + 4.4)) - 0.5;
  q += w * uP_warp;
  var pq: vec3f = q * uP_freq + vec3f(t * 0.22, -t * 0.13, t * 0.07);

  /*
    Two scales multiplied, not added: a broad mask decides WHERE the storms
    are, a finer field gives each one a core and ragged edges. Adding them
    fills the whole sphere with mid-tones; multiplying leaves the calm
    between systems genuinely empty and puts the peaks inside the cells,
    which is what draws the concentric class rings.
  */
  var big: f32 =clamp((fbm3(pq) - 0.5) * 3.0 + 0.5, 0.0, 1.0);
  var fine: f32 =clamp((fbm3(pq * 2.6 + 4.7) - 0.5) * 2.4 + 0.5, 0.0, 1.0);
  var f: f32 =big * (0.55 + 0.45 * fine);

  f = clamp((f - radarLoNow) / max(uP_hi - radarLoNow, 0.01), 0.0, 1.0);
  // a response curve: the top classes are the rare peaks of a real map
  return pow(f, uP_curve);
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // input lowers the window (more of the field reads as weather), output
  // fills the dots in
  radarLoNow = uP_lo - 0.08 * uInput;
  radarDensityNow = uP_density * (1.0 + 0.5 * uOutput);

  var rd: f32 =length(uv);
  var R: f32 =uP_radius;
  var mask: f32 =smoothstep(0.012, -0.012, rd - R);

  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  var pl: vec2f = uv / R;
  var r2: f32 =dot(pl, pl);
  var z: f32 =sqrt(max(1.0 - r2, 0.0));
  var n: vec3f = vec3f(pl, z);

  var t: f32 =uP_speed; // integrated clock: the weather drifts

  /*
    The pixel grid lives on the UNROLLED dome: a stereographic wrap of the
    front hemisphere as it faces the viewer, which compresses gently toward
    the limb and never changes. The picture rolls underneath it — the
    pixels are the screen, the weather is what is on it. Laying the grid on
    the rolled dome instead put the projection's blow-up (the far side of
    the ball) wherever the roll had turned it, and the cells smeared into
    streaks there.
  */
  var st: vec2f = n.xy / (1.3 + n.z) * uP_scale;
  var g: vec2f = st * uP_cells;
  var cell: vec2f = floor(g);
  var fr: vec2f = fract(g) - 0.5;

  // the cell centre, back on the dome: invert the wrap, then roll it and
  // read the field there — once per cell, so every dot is one flat colour
  var v: vec2f = (cell + 0.5) / uP_cells / uP_scale;
  var vv: f32 =dot(v, v);
  var A: f32 =vv + 1.0;
  var B: f32 =2.6 * vv;
  var C: f32 =1.69 * vv - 1.0;
  var zc: f32 =(-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
  var nc: vec3f = vec3f(v * (1.3 + zc), zc);
  var cr: f32 =cos(uP_spin);
  var sr: f32 =sin(uP_spin);
  var spc: vec3f = vec3f(nc.x * cr - nc.z * sr, nc.y, nc.x * sr + nc.z * cr);

  var f: f32 =intensity(spc, t);

  // dither the class boundaries with a per-cell hash, then quantize into
  // the legend's seven classes. The bands are NOT even: red is broad and
  // green thin, as on the reference, and magenta is the rare peak.
  var h: f32 =hash(cell + 11.7);
  var fd: f32 =clamp(f + (h - 0.5) * uP_dither, 0.0, 1.0);
  var cls: f32 =0.0;
  cls += step(0.10, fd);
  cls += step(0.26, fd);
  cls += step(0.38, fd);
  cls += step(0.46, fd);
  cls += step(0.78, fd);
  cls += step(0.94, fd);

  // dropout: density rises with the intensity; the hash re-rolls slowly
  var frame: f32 =floor(uTime * uP_twinkle);
  var roll: f32 =hash(cell + vec2f(frame * 3.7, -frame * 1.3));
  var density: f32 =mix(uP_sparse, 1.0, smoothstep(0.0, 0.6, f)) * radarDensityNow;
  var keep: f32 =step(roll, density);

  // the dot: a square inset in its cell
  var dsq: f32 =max(abs(fr.x), abs(fr.y));
  var dotMask: f32 =1.0 - smoothstep(uP_dot - 0.06, uP_dot + 0.06, dsq);

  // the class palette
  var ink: vec3f = uC_c0;
  ink = select(ink, uC_c1, cls > 0.5 && cls < 1.5);
  ink = select(ink, uC_c2, cls > 1.5 && cls < 2.5);
  ink = select(ink, uC_c3, cls > 2.5 && cls < 3.5);
  ink = select(ink, uC_c4, cls > 3.5 && cls < 4.5);
  ink = select(ink, uC_c5, cls > 4.5 && cls < 5.5);
  ink = select(ink, uC_c6, cls > 5.5);

  var col: vec3f = mix(uC_paper, ink, dotMask * keep);

  // paper grain, so the flats are not dead
  col *= 1.0 + (hash(floor(fragCoord / 2.0) + frame) - 0.5) * uP_grain;

  // dome shading keeps the ball a ball under the mosaic
  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.7))), 0.0, 1.0);
  col *= 1.0 - uP_light * (1.0 - lambert);
  var fres: f32 =pow(1.0 - z, 3.0);
  col = mix(col, uC_c0, fres * uP_rim);

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(max(col, vec3f(0.0)) * a, a);
}
`;

export const orb27Orb: OrbVariant = {
  /*
   * The paper and the seven classes, quiet to peak: grey, blue, cyan,
   * green, red, yellow, magenta — the radar legend of the reference.
   */
  colors: [
    { default: "#efe9dc", key: "paper", label: "Paper" },
    { default: "#a9a9a6", key: "c0", label: "Quiet" },
    { default: "#2e5df0", key: "c1", label: "Class 1" },
    { default: "#38d9ec", key: "c2", label: "Class 2" },
    { default: "#22c35c", key: "c3", label: "Class 3" },
    { default: "#e8322a", key: "c4", label: "Class 4" },
    { default: "#f5d020", key: "c5", label: "Class 5" },
    { default: "#e030c0", key: "c6", label: "Peak" },
  ],
  frag: RADAR_FRAG,
  key: "orb-27",
  label: "ORB-27",
  note: "a weather-radar mosaic, fronts of coloured pixels sweeping the ball",
  params: [
    {
      default: 0.6,
      integrate: true,
      key: "speed",
      label: "Front speed",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.04,
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
      default: 2.4,
      key: "scale",
      label: "Grid zoom",
      max: 8,
      min: 0.3,
      step: 0.05,
    },
    { default: 34, key: "cells", label: "Grid", max: 120, min: 8, step: 1 },
    {
      default: 0.36,
      key: "dot",
      label: "Dot size",
      max: 0.5,
      min: 0.1,
      step: 0.01,
    },
    { default: 1.5, key: "swirl", label: "Swirl", max: 8, min: 0, step: 0.05 },
    {
      default: 0.45,
      key: "vortex",
      label: "Vortex size",
      max: 2,
      min: 0.1,
      step: 0.01,
    },
    {
      default: 1.6,
      key: "freq",
      label: "Storm scale",
      max: 8,
      min: 0.2,
      step: 0.05,
    },
    { default: 0.5, key: "warp", label: "Bend", max: 3, min: 0, step: 0.02 },
    {
      default: 0.12,
      key: "lo",
      label: "Quiet threshold",
      max: 1,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.82,
      key: "hi",
      label: "Peak threshold",
      max: 1,
      min: 0,
      step: 0.005,
    },
    {
      default: 1.4,
      key: "curve",
      label: "Response curve",
      max: 4,
      min: 0.5,
      step: 0.05,
    },
    {
      default: 0.12,
      key: "dither",
      label: "Class dither",
      max: 0.6,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.16,
      key: "sparse",
      label: "Quiet density",
      max: 1,
      min: 0,
      step: 0.01,
    },
    { default: 1, key: "density", label: "Fill", max: 1.5, min: 0, step: 0.01 },
    {
      default: 3,
      key: "twinkle",
      label: "Twinkle rate",
      max: 30,
      min: 0,
      step: 0.5,
    },
    {
      default: 0.1,
      key: "grain",
      label: "Paper grain",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.18,
      key: "light",
      label: "Key light",
      max: 1,
      min: 0,
      step: 0.01,
    },
    { default: 0.35, key: "rim", label: "Rim", max: 1, min: 0, step: 0.01 },
  ],
  // the legend holds; the paper cools while searching and warms while
  // answering
  stateColors: {
    idle: { paper: "#efe9dc" },
    speaking: { paper: "#f5e6d0" },
    thinking: { paper: "#e6e9ee" },
  },
  /*
    Staged on the drift, the swirl, the window and the fill. The grid, the
    zoom and the storm scale all multiply a coordinate or sit inside a
    floor, so they never move between states. The swirl is an angle,
    bounded, and glides safely.
  */
  statePresets: {
    idle: {
      curve: 1.4,
      density: 1,
      dither: 0.12,
      hi: 0.82,
      lo: 0.12,
      sparse: 0.16,
      speed: 1,
      spin: 0.27,
      swirl: 1.5,
      twinkle: 3,
      warp: 0.5,
    },
    speaking: {
      curve: 1.3,
      density: 1.15,
      dither: 0.1,
      grain: 0.35,
      hi: 0.8,
      lo: 0,
      sparse: 0.22,
      speed: 6.5,
      spin: 0.51,
      swirl: 2,
      twinkle: 5,
      warp: 0.45,
    },
    thinking: {
      curve: 1.7,
      density: 0.9,
      dither: 0.18,
      freq: 5.2,
      hi: 0.545,
      lo: 0,
      sparse: 0.22,
      speed: 2.4,
      spin: 0.51,
      swirl: 4,
      twinkle: 12,
      warp: 1.06,
    },
  },
};

export type Orb27Props = Omit<ShaderOrbProps, "variant">;

export const Orb27 = ({ size = 280, ...rest }: Orb27Props) => (
  <ShaderOrb variant={orb27Orb} size={size} {...rest} />
);

export default Orb27;

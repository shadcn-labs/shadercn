"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const MOIRE_FRAG = `
const LAYERS: i32 = 100;
const AA: i32 = 1;
/*
 * The listing's sin(r + f), minus the resolution. The components are a
 * quarter turn apart so the per-layer frequency pair walks a circle (see
 * the header) — the base value only sets where on that circle layer one
 * starts.
 */
const SEED: vec2f = vec2f(11.3, 12.87);

// Volume-reactive values, resolved once per fragment in main().
var<private> moireDrift: f32;
var<private> moireGlow: f32;
var<private> moireHue: f32;

fn moireRender(fragCoord: vec2f) -> vec3f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var R: f32 =max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  var pl: vec2f = uv / R;
  var z: f32 =sqrt(max(1.0 - dot(pl, pl), 0.0));

  var t: f32 =uP_speed; // integrated clock

  /*
    The layer-zero projection: the plain stereographic wrap of the dome's
    surface. Every deeper layer is this divided by its own denominator, so
    the whole parallax below costs one ratio per layer.
  */
  var bulge: f32 =1.0 + uP_bulge;
  var den0: f32 =z + bulge;

  var w: vec2f = pl / den0 * uP_scale;

  var acc: vec3f = vec3f(0.0);

  for (var li: i32 =0; li < LAYERS; li = li + 1) {
    var f: f32 =f32(li) + 1.0;
    var u: f32 =f / f32(LAYERS);

    /*
      This layer's depth along the view ray, and the projection from the
      point the ray has reached there. At depth 0 the denominator is den0
      and the ratio is 1; deeper layers see the pattern from further
      inside the ball, which spreads them at the limb and not at all
      through the centre. That gradient is what shears the stack.
    */
    var d: f32 =u * uP_depth;
    var denu: f32 =z - d + bulge * sqrt(max(1.0 - 2.0 * d * z + d * d, 0.0));
    var q: vec2f = w * (den0 / max(denu, 0.05));

    /*
      One lattice. sin(q * k) vanishes on a rectangular grid of points and
      the reciprocal of its length lights every one; the floor on that
      length is the glow's radius, and without it the divide is by exactly
      zero at every lattice point.
    */
    var k: vec2f = sin(SEED + f) / max(uP_freq, 0.001);
    var g: f32 =max(length(sin(q * k)), moireGlow);

    // tint by layer index — depth through the stack reads as hue
    var hue: vec3f = cos(f * moireHue + vec3f(0.0, 1.0, 3.0)) + 1.1;

    acc += hue / g;

    // the listing's walk between layers: the stack is a hundred grids
    // each shifted a little further along a wandering path
    w += moireDrift * sin(w.yx + t);
  }

  /*
    The listing's knee is tanh(o*o/4e4) over an unnormalized sum of a
    hundred layers. Dividing by the layer count first pulls the square's
    scale down by 100*100, so the same knee is exactly 4 here — a number
    that fits on a slider. The square is a contrast squarer, not a tone
    map: it crushes the field between the glows.
  */
  var v: vec3f = acc / f32(LAYERS);
  var col: vec3f = tanh3(v * v / max(uP_exposure, 0.0001));
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  // saturation about luminance, then the tint
  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  /*
    Dome shading, kept gentle: the layers are emission seen THROUGH the
    ball, so a hard lambert reads as a shadow thrown across the inside of
    a lamp rather than as a lit surface.
  */
  var n: vec3f = vec3f(pl, z);
  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.72))), 0.0, 1.0);
  col *= 0.6 + uP_light * lambert;

  var fres: f32 =1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: the user's voice widens the walk between layers, the
  // agent's opens the glows and runs the hue through the stack faster.
  moireDrift = uP_drift * (1.0 + 0.6 * uInput);
  moireGlow = max(uP_glowSize * (1.0 - 0.3 * uOutput), 0.002);
  moireHue = uP_hueRate * (1.0 + 0.35 * uOutput);

  var mask: f32 =smoothstep(0.012, -0.012, length(uv) - max(uP_radius, 0.001));

  // A hundred lattices per sample, none of them worth paying for outside
  // the silhouette.
  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  var col: vec3f = vec3f(0.0);
  col = moireRender(fragCoord);

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(max(col, vec3f(0.0)) * a, a);
}
`;

export const orb06Orb: OrbVariant = {
  colors: [
    { default: "#ffffff", key: "tint", label: "Tint" },
    { default: "#bcd8ff", key: "sheen", label: "Sheen" },
  ],
  frag: MOIRE_FRAG,
  key: "orb-06",
  label: "ORB-06",
  note: "a hundred glowing lattices stacked through the ball, interfering",
  params: [
    {
      default: 0.5,
      integrate: true,
      key: "speed",
      label: "Anim speed",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.02,
      key: "drift",
      label: "Layer walk",
      max: 0.3,
      min: 0,
      step: 0.002,
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
      default: 4,
      key: "scale",
      label: "Pattern scale",
      max: 20,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.3,
      key: "bulge",
      label: "Dome bulge",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.7,
      key: "depth",
      label: "Stack depth",
      max: 1.6,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.7,
      key: "freq",
      label: "Lattice spacing",
      max: 5,
      min: 0.05,
      step: 0.01,
    },
    {
      default: 0.05,
      key: "glowSize",
      label: "Glow size",
      max: 1,
      min: 0.002,
      step: 0.002,
    },
    {
      default: 0.037,
      key: "hueRate",
      label: "Hue per layer",
      max: 0.5,
      min: 0,
      step: 0.002,
    },
    {
      default: 4,
      key: "exposure",
      label: "Exposure",
      max: 200,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1.1,
      key: "contrast",
      label: "Contrast",
      max: 10,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 1.2,
      key: "saturation",
      label: "Saturation",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.45,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.4,
      key: "rim",
      label: "Rim sheen",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  stateColors: {
    idle: { sheen: "#bcd8ff", tint: "#ffffff" },
    speaking: { sheen: "#ffb277", tint: "#ffc492" },
    thinking: { sheen: "#7ea9ff", tint: "#9db8ff" },
  },
  statePresets: {
    idle: {
      contrast: 1.1,
      depth: 0.7,
      drift: 0.02,
      exposure: 4,
      glowSize: 0.05,
      hueRate: 0.037,
      speed: 0.5,
    },
    speaking: {
      contrast: 0.9,
      depth: 0.26,
      drift: 0.13,
      exposure: 2.7,
      glowSize: 0.062,
      hueRate: 0.045,
      light: 1.11,
      speed: 4.5,
    },
    thinking: {
      bulge: 2.18,
      contrast: 1.55,
      depth: 1.25,
      drift: 0.105,
      exposure: 6.5,
      glowSize: 0.016,
      hueRate: 0.095,
      speed: 2.6,
    },
  },
};

export type Orb06Props = Omit<ShaderOrbProps, "variant">;

export const Orb06 = ({ size = 280, ...rest }: Orb06Props) => (
  <ShaderOrb variant={orb06Orb} size={size} {...rest} />
);

export default Orb06;

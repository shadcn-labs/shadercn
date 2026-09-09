"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const HEAT_REST = {
  banding: 0.85,
  contrast: 1,
  gain: 1,
  grain: 0.35,
  hi: 0.74,
  jitter: 0.015,
  lo: 0.42,
  speed: 0.5,
  spin: 0.05,
  warp: 0.6,
};

const HEAT_PALETTE = {
  cold: "#0b0a1e",
  cool: "#3b2a9a",
  core: "#fff1e6",
  hot: "#f6b53a",
  warm: "#f05a28",
};

const HEAT_FRAG = `
const PI: f32 = 3.14159265359;

// Volume-reactive values, resolved once per fragment in main().
var<private> heatGainNow: f32;
var<private> heatJitterNow: f32;

fn grainNoise(gpix: vec2f, frame: f32, seed: f32) -> f32 {
  return hash(gpix + vec2f(frame * 13.71 + seed, frame * 7.37 - seed));
}

fn rot2(a: f32) -> mat2x2f {
  var c: f32 =cos(a);
  var s: f32 =sin(a);
  return mat2x2f(vec2f(c, -s), vec2f(s, c));
}

/*
  One ink screen. Square dots on a grid at angle a, offset o (the
  misregistration), sized by the coverage: coverage 0 is paper, coverage 1
  is a solid. Returns how much of this pixel the ink covers.

  The grid is laid in SCREEN space, not on the wrapped plane: a print is
  flat, and it is the picture that curves round the ball. A screen on the
  wrapped coordinates changes pitch toward the limb and beats against the
  other two into moire rings.
*/
fn screen(uv: vec2f, a: f32, o: vec2f, coverage: f32, soft: f32) -> f32 {
  var cell: vec2f = rot2(a) * uv * uP_dots + o;
  var f: vec2f = fract(cell) - 0.5;
  var d: f32 =length(f); // a round dot: reads as tone, not as a grid
  // dot half-size from coverage; sqrt so mid-tones read as mid-tones the
  // way a real screen's area does
  var size: f32 =0.5 * sqrt(clamp(coverage * uP_dotGain, 0.0, 1.0));
  return 1.0 - smoothstep(size - soft, size + soft, d);
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  heatGainNow = uP_gain * (1.0 + 0.6 * uOutput);
  heatJitterNow = uP_jitter * (1.0 + 1.5 * uInput);

  var rd: f32 = length(uv);
  var R: f32 = uP_radius;
  var mask: f32 = smoothstep(0.012, -0.012, rd - R);

  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  var pl: vec2f = uv / R;
  var r2: f32 =dot(pl, pl);
  var z: f32 =sqrt(max(1.0 - r2, 0.0));
  var n: vec3f = vec3f(pl, z);

  // roll the dome about Y on its own integrated clock
  var cr: f32 =cos(uP_spin);
  var sr: f32 =sin(uP_spin);
  var sp: vec3f = vec3f(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);

  var t: f32 =uP_speed; // integrated clock: the sources drift

  // stereographic wrap of the plane onto the ball
  var st: vec2f = sp.xy / (1.3 + sp.z) * uP_scale;

  /*
    The heat: a drifting, domain-warped noise field with a threshold window
    cut out of it. Two drifts at different rates so the pools travel and
    change shape rather than slide as one sheet; the input jitter is a fast
    wobble on top.
  */
  var p: vec2f = st * uP_freq + vec2f(t * 0.11, -t * 0.07);
  var wp: vec2f = st * uP_freq * 0.55 + vec2f(-t * 0.05, t * 0.08);
  var warp: vec2f = vec2f(noise(wp + 3.1), noise(wp + 9.4)) - 0.5;
  p += warp * uP_warp;
  p += vec2f(sin(t * 3.7), cos(t * 4.3)) * heatJitterNow;
  var field: f32 =noise(p) * 0.62 + noise(p * 2.1 + 5.3) * 0.26 + noise(p * 4.2 + 1.7) * 0.12;
  var heat: f32 =clamp((field - uP_lo) * heatGainNow / max(uP_hi - uP_lo, 0.01), 0.0, 1.0);

  // grain tap 1: dither the field before it is banded, so the contour
  // edges break up into speckle instead of clean steps
  var gpix: vec2f = floor(fragCoord / max(uP_grainSize, 1.0));
  var frame: f32 =floor(uTime * 48.0);
  heat += (grainNoise(gpix, frame, 3.1) - 0.5) * uP_dither;

  // the contours: quantize into bands, blend back with the smooth field
  var banded: f32 =floor(heat * uP_bands + 0.5) / uP_bands;
  heat = clamp(mix(heat, banded, uP_banding), 0.0, 1.0);
  heat = pow(heat, uP_contrast);

  // the thermal ramp
  var base: vec3f = mix(uC_cold, uC_cool, smoothstep(0.0, 0.3, heat));
  base = mix(base, uC_warm, smoothstep(0.3, 0.55, heat));
  base = mix(base, uC_hot, smoothstep(0.55, 0.78, heat));
  base = mix(base, uC_core, smoothstep(0.78, 0.97, heat));

  /*
    The print. Separate the palette into CMY coverage and lay each ink down
    as its own screen; the paper shows through the gaps. The angles are the
    classic offsets, scaled by the misregistration, plus a per-ink shift.
  */
  var soft: f32 =uP_dotSoft;
  var mis: f32 =uP_misregister;
  var cC: f32 =screen(uv, 0.035 * mis, vec2f(0.22, 0.12) * mis, 1.0 - base.r, soft);
  var cM: f32 =screen(uv, -0.03 * mis, vec2f(-0.14, 0.2) * mis, 1.0 - base.g, soft);
  var cY: f32 =screen(uv, 0.0, vec2f(0.0), 1.0 - base.b, soft);

  var print: vec3f = uC_paper;
  print *= mix(vec3f(1.0), vec3f(0.05, 0.62, 0.92), cC * uP_ink);
  print *= mix(vec3f(1.0), vec3f(0.92, 0.08, 0.48), cM * uP_ink);
  print *= mix(vec3f(1.0), vec3f(0.98, 0.86, 0.02), cY * uP_ink);

  // the unprinted palette is mixed back a little so the blacks stay black
  // and the screens never wash the whole ball to paper
  var col: vec3f = mix(base, print, uP_printMix);

  // grain tap 2: paper
  col *= 1.0 + (grainNoise(gpix, frame, 27.9) - 0.5) * uP_grain;

  // dome shading keeps the ball a ball under the print
  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.7))), 0.0, 1.0);
  col *= 1.0 - uP_light * (1.0 - lambert);
  var fres: f32 =pow(1.0 - z, 2.5);
  col += uC_paper * uP_rim * fres * 0.5;

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(max(col, vec3f(0.0)) * a, a);
}
`;

export const orb33Orb: OrbVariant = {
  key: "orb-33",
  label: "ORB-33",
  note: "a thermal image, risograph-printed on the ball",
  frag: HEAT_FRAG,
  params: [
    {
      default: 0.5,
      integrate: true,
      key: "speed",
      label: "Drift",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.05,
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
    { default: 3, key: "scale", label: "Zoom", max: 8, min: 0.3, step: 0.05 },
    {
      default: 1.4,
      key: "freq",
      label: "Pool scale",
      max: 6,
      min: 0.2,
      step: 0.05,
    },
    { default: 0.6, key: "warp", label: "Warp", max: 3, min: 0, step: 0.02 },
    {
      default: 0.42,
      key: "lo",
      label: "Cold threshold",
      max: 1,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.74,
      key: "hi",
      label: "Hot threshold",
      max: 1,
      min: 0,
      step: 0.005,
    },
    {
      default: 1,
      key: "gain",
      label: "Heat gain",
      max: 6,
      min: 0.1,
      step: 0.02,
    },
    {
      default: 0.015,
      key: "jitter",
      label: "Heat jitter",
      max: 0.5,
      min: 0,
      step: 0.005,
    },
    {
      default: 7,
      key: "bands",
      label: "Contour bands",
      max: 24,
      min: 2,
      step: 1,
    },
    {
      default: 0.85,
      key: "banding",
      label: "Contour strength",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 1,
      key: "contrast",
      label: "Contrast",
      max: 3,
      min: 0.3,
      step: 0.02,
    },
    {
      default: 0.05,
      key: "dither",
      label: "Dither",
      max: 0.6,
      min: 0,
      step: 0.005,
    },
    {
      default: 46,
      key: "dots",
      label: "Screen pitch",
      max: 120,
      min: 4,
      step: 1,
    },
    {
      default: 1,
      key: "dotGain",
      label: "Dot gain",
      max: 2,
      min: 0.2,
      step: 0.01,
    },
    {
      default: 0.12,
      key: "dotSoft",
      label: "Dot softness",
      max: 0.3,
      min: 0.01,
      step: 0.005,
    },
    {
      default: 0.5,
      key: "misregister",
      label: "Misregistration",
      max: 3,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.92,
      key: "ink",
      label: "Ink density",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.28,
      key: "printMix",
      label: "Print mix",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.35,
      key: "grain",
      label: "Paper grain",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 2,
      key: "grainSize",
      label: "Grain size",
      max: 8,
      min: 1,
      step: 1,
    },
    {
      default: 0.25,
      key: "light",
      label: "Key light",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.25,
      key: "rim",
      label: "Rim light",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  /*
   * Six stops: five up the thermal ramp, and the paper the screens are
   * printed on.
   */
  colors: [
    { default: "#0b0a1e", key: "cold", label: "Cold" },
    { default: "#3b2a9a", key: "cool", label: "Cool" },
    { default: "#f05a28", key: "warm", label: "Warm" },
    { default: "#f6b53a", key: "hot", label: "Hot" },
    { default: "#fff1e6", key: "core", label: "Core" },
    { default: "#f4ecdf", key: "paper", label: "Paper" },
  ],
  /*
    All three states share the rest palette; idle is the rest preset.
    Speaking is the rest look set RACING in place — the drift at eighteen
    times rest on a roll forty times as fast, the pools slightly finer and
    the warp more than doubled, with the window dropped so more of it
    reads as hot — without the rescale thinking makes. Thinking is the
    rest look zoomed out and set racing: the plane at four times the
    zoom with the pools three times finer and the warp tripled, the drift
    at twenty times rest on a roll ten times as fast, the window dropped
    so more of it reads as hot, on fewer, softer bands and a finer screen.
    Note the zoom, the pool scale, the band count and the screen pitch all
    multiply a coordinate, so the transition into and out of thinking
    glides through a rescale — chosen deliberately.
  */
  statePresets: {
    idle: HEAT_REST,
    speaking: {
      ...HEAT_REST,
      freq: 1.3,
      hi: 0.72,
      jitter: 0,
      lo: 0.345,
      speed: 8.8,
      spin: 2.01,
      warp: 1.42,
    },
    thinking: {
      ...HEAT_REST,
      banding: 0.75,
      bands: 6,
      dots: 42,
      freq: 3.1,
      hi: 0.66,
      jitter: 0,
      lo: 0.3,
      scale: 4.6,
      speed: 10,
      spin: 0.51,
      warp: 1.82,
    },
  },
  stateColors: {
    idle: HEAT_PALETTE,
    speaking: HEAT_PALETTE,
    thinking: HEAT_PALETTE,
  },
};

export type Orb33Props = Omit<ShaderOrbProps, "variant">;

export function Orb33({ size = 280, ...rest }: Orb33Props) {
  return <ShaderOrb variant={orb33Orb} size={size} {...rest} />;
}

export default Orb33;

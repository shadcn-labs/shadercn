"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const DITHER_FRAG = `
// 2x2 Bayer base: floor/fract only. (0,0)=0, (1,0)=.5, (0,1)=.75, (1,1)=.25
// — the 0,2,3,1 ordering over 4.
fn bayer2(a: vec2f) -> f32 {
  var f: vec2f = floor(a);
  return fract(f.x / 2.0 + f.y * f.y * 0.75);
}

// 8x8 by recursion: M8 = M2(a/4)/16 + M2(a/2)/4 + M2(a). No arrays, no
// bitwise — neither exists in GLSL ES 1.0.
fn bayer8(a: vec2f) -> f32 {
  return bayer2(a * 0.25) * 0.0625 + bayer2(a * 0.5) * 0.25 + bayer2(a);
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: user input deepens the waves, agent output brightens
  // the whole tone ladder — the dot field visibly blooms while it speaks.
  var plasmaAmt: f32 = uP_plasma * (1.0 + 0.4 * uInput);
  var gainNow: f32 = uP_gain * (0.85 + 0.5 * uOutput);

  /*
    Chunky pixel grid, RESOLUTION-RELATIVE: uP_cells is how many cells span
    the canvas, so a 190px gallery card and a 420px playground orb show the
    same composition — the same wave resolved by the same number of dots.
    Sized in device pixels instead, small canvases collapse to a few dozen
    blotches. All content below samples at the cell centre so every dot is
    one flat square.
  */
  var cellPx: f32 =max(min(uRes.x, uRes.y) / max(uP_cells, 8.0), 1.0);
  var pix: vec2f = floor(fragCoord / cellPx);
  var cellCentre: vec2f = (pix + 0.5) * cellPx;

  var suv: vec2f = (2.0 * cellCentre - uRes) / min(uRes.x, uRes.y);
  var puv: vec2f = suv / uP_radius;
  var r2: f32 = dot(puv, puv);

  // blocky silhouette — cut on the cell grid, deliberately not smoothed
  var mask: f32 =1.0 - step(1.0, r2);

  var z: f32 =sqrt(max(1.0 - r2, 0.0));
  var n: vec3f = vec3f(puv, z);

  /*
    The plasma is evaluated in a ROTATING frame: the dome point spins about
    Y on its own integrated clock, so the wavefronts roll around the ball
    instead of sliding across a flat disc. The light stays screen-fixed —
    the form shading holds still while the pattern travels over it.
  */
  var rot: f32 =uP_spin; // integrated clock
  var cr: f32 =cos(rot);
  var sr: f32 =sin(rot);
  var sp: vec3f = vec3f(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);

  var t: f32 =uP_speed; // integrated clock

  // the classic demoscene plasma: three interfering sine waves, each on its
  // own direction and rate
  var f: f32 =uP_scale;
  var v: f32 =sin(sp.x * f * 3.1 + t)
    + sin((sp.y * 0.85 + sp.z * 0.4) * f * 3.6 - t * 1.3)
    + sin((sp.x + sp.y + sp.z) * f * 2.2 + t * 0.7);

  // a ripple source orbiting the dome — expanding rings pushed through the
  // interference; the clock enters only as additive phase
  var src: vec2f = 0.55 * vec2f(cos(t * 0.5), sin(t * 0.5));
  v += sin(length(puv - src) * f * 5.0 - t * 2.2);
  v *= 0.25; // four unit waves back to -1..1

  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.7))), 0.0, 1.0);
  var fres: f32 =pow(1.0 - z, 2.0);

  // waves modulated by the dome shading, so the ball stays a ball under
  // the rolling pattern; everything collapses into one luminance
  var lum: f32 =(0.5 + 0.5 * v * plasmaAmt) * (0.3 + uP_light * lambert)
    + uP_rim * fres;
  lum = pow(clamp(lum * gainNow, 0.0, 1.0), uP_contrast);

  // ordered dither onto the tone ladder — levels 2 is the classic 1-bit
  // look, higher values keep the grain but add mid-tones
  var steps: f32 =max(uP_levels - 1.0, 1.0);
  var q: f32 =clamp(floor(lum * steps + bayer8(pix)) / steps, 0.0, 1.0);

  var col: vec3f = mix(uC_ink, uC_paper, q);

  // Surface-lit orb bounded by a mask: alpha IS coverage, so premultiply —
  // the opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(col * a, a);
}
`;

export const orb14Orb: OrbVariant = {
  key: "orb-14",
  label: "ORB-14",
  note: "a lit plasma dome quantized to chunky two-tone pixels",
  frag: DITHER_FRAG,
  params: [
    {
      default: 0.5,
      integrate: true,
      key: "speed",
      label: "Wave speed",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.15,
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
      default: 140,
      key: "cells",
      label: "Grid cells",
      max: 320,
      min: 32,
      step: 2,
    },
    { default: 3, key: "levels", label: "Tone steps", max: 8, min: 2, step: 1 },
    {
      default: 1.5,
      key: "scale",
      label: "Wave scale",
      max: 12,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.9,
      key: "plasma",
      label: "Wave amount",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.9,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.35,
      key: "rim",
      label: "Rim light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 1,
      key: "gain",
      label: "Brightness",
      max: 5,
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
  ],
  colors: [
    { default: "#101426", key: "ink", label: "Ink" },
    { default: "#cfe6ff", key: "paper", label: "Paper" },
  ],
  /*
    Staged in the family language: thinking churns the plasma in place while
    the light freezes, speaking sweeps the light fast and brightens the
    ladder. `pixel` and `levels` never move between states — both quantize,
    and a gliding quantizer pops instead of fading.
  */
  statePresets: {
    // calm: waves rolling slowly, dome barely turning
    idle: {
      contrast: 1.1,
      gain: 1,
      plasma: 0.9,
      speed: 0.5,
      spin: 0.15,
    },
    // computing: the interference races IN PLACE — wave clock at three
    // times idle, deeper waves — while the dome stops turning
    thinking: {
      contrast: 1.15,
      gain: 0.95,
      plasma: 1.15,
      speed: 1.6,
      spin: 0.05,
    },
    // answering: the whole dome rolls fast and the tones bloom bright
    speaking: {
      contrast: 1.05,
      gain: 1.3,
      plasma: 1,
      speed: 1.3,
      spin: 0.8,
    },
  },
  // ink/paper carry the at-a-glance read: cool print at rest, violet-blue
  // while computing, warm amber while answering
  stateColors: {
    idle: { ink: "#101426", paper: "#cfe6ff" },
    speaking: { ink: "#2a1410", paper: "#ffd9a4" },
    thinking: { ink: "#140f38", paper: "#a9b9ff" },
  },
};

export type Orb14Props = Omit<ShaderOrbProps, "variant">;

export function Orb14({ size = 280, ...rest }: Orb14Props) {
  return <ShaderOrb variant={orb14Orb} size={size} {...rest} />;
}

export default Orb14;

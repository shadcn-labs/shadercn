"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const CAUSTIC_FRAG = `
// Volume- and surge-reactive values, resolved once per fragment in main().
var<private> causticWarp: f32;

/*
  The water. The plane is folded on its own sines three times, each octave
  at a literal frequency and on its own share of the clock, so the ripples
  refract the net rather than scroll it. Amplitude is the one control.
*/
fn fold(p: vec2f, t: f32) -> vec2f {
  var q: vec2f = p;
  q += causticWarp        * sin(q.yx * 1.31 + vec2f( t * 0.90, -t * 0.70));
  q += causticWarp * 0.60 * sin(q.yx * 2.17 + vec2f(-t * 1.30,  t * 1.10));
  q += causticWarp * 0.35 * sin(q.yx * 3.73 + vec2f( t * 1.90,  t * 1.60));
  return q;
}

/*
  The light. Two crossed families of crest lines, sharpened by the edge
  exponent — the base is 1 - abs(sin), always in [0, 1], so pow is defined —
  with their product added back so the crossings, where wavefronts focus,
  burn hotter than the lines between them.
*/
fn net(p: vec2f, t: f32) -> f32 {
  var q: vec2f = fold(p, t);
  var s: vec2f = 1.0 - abs(sin(q));
  var l: vec2f = pow(s, vec2f(uP_edge));
  // Normalised to [0, 1]: the sum peaks at four on a crossing, and left
  // unbounded it drove the tone knee into clipping all three channels,
  // which turns any sun colour white. Bounded, the sun colour survives
  // the knee at the foci and gain is a real brightness rather than a
  // race to white.
  return (l.x + l.y + 2.0 * l.x * l.y) * 0.25;
}

/*
  Triplanar: the plane field read on the three axis planes of the surface
  direction and blended by the fourth power of each component, so each
  plane only shows where it faces squarely. No pole and no seam — the ball
  can turn forever.
*/
fn netOn(sp: vec3f, t: f32) -> f32 {
  var w: vec3f = sp * sp;
  w *= w;
  w /= (w.x + w.y + w.z);
  var k: f32 =uP_scale;
  return w.x * net(sp.yz * k, t) + w.y * net(sp.zx * k, t) + w.z * net(sp.xy * k, t);
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  var rd: f32 = length(uv);
  var R: f32 = uP_radius;
  var mask: f32 = smoothstep(0.012, -0.012, rd - R);
  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  var pl: vec2f = uv / R;
  var z: f32 =sqrt(max(1.0 - dot(pl, pl), 0.0));
  var n: vec3f = vec3f(pl, z);

  // the ball turns about Y on its own integrated clock
  var cr: f32 =cos(uP_spin);
  var sr: f32 =sin(uP_spin);
  var sp: vec3f = vec3f(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);

  var t: f32 =uP_flow; // integrated clock: the water

  /*
    The surge: a round trip on an integrated clock through cos, so it eases
    through both ends and never wraps. It lifts the gain and deepens the
    ripple together — brighter as the water heaves — and uP_swell is how
    much of that a state takes.

    Volume coupling in the family language: the agent's voice brightens the
    light, the user's deepens the water.
  */
  var surge: f32 =0.5 - 0.5 * cos(uP_swellRate);
  var gainNow: f32 =uP_gain * mix(1.0, 0.55 + 0.9 * surge, uP_swell) * (0.8 + 0.5 * uOutput);
  causticWarp = uP_warp * mix(1.0, 0.8 + 0.4 * surge, uP_swell) * (1.0 + 0.35 * uInput);

  /*
    Three moments of the fold, one per channel. The LIGHT is the net's
    luminance under the sun colour, so gold is gold at the foci; the
    per-channel disagreement is split off as a zero-mean residual and added
    back scaled by uP_split, so the rainbow is a fringe that rides on the
    edges where they move and vanishes where they hold — never a tint on
    the whole net. Read once with the offset baked in and once without
    would cost the same three evaluations, so the offset is constant and
    the split is a plain amplitude on the residual: safe to stage.
  */
  var ds: f32 =0.09;
  var c: vec3f = vec3f(netOn(sp, t + ds), netOn(sp, t), netOn(sp, t - ds));
  var cLum: f32 =dot(c, vec3f(1.0 / 3.0));
  var fringe: vec3f = (c - cLum) * uP_split;

  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.7))), 0.0, 1.0);
  var fres: f32 =pow(1.0 - z, 2.5);

  // the floor of the pool, then the light thrown on it — dimmer round the
  // limb, where the floor tilts away from the sun
  var col: vec3f = uC_deep * (0.35 + 0.65 * uP_light * lambert);
  col += (uC_sun * cLum + fringe) * gainNow * (0.55 + 0.45 * lambert);
  col += uC_sheen * uP_rim * fres;

  col = pow(max(col, vec3f(0.0)), vec3f(uP_contrast));
  col = tanh3(col);

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(max(col, vec3f(0.0)) * a, a);
}
`;

export const orb16Orb: OrbVariant = {
  key: "orb-16",
  label: "ORB-16",
  note: "sunlight through water — a caustic net crawling over the ball, fringing into colour where it moves",
  frag: CAUSTIC_FRAG,
  params: [
    {
      default: 0.9,
      integrate: true,
      key: "flow",
      label: "Water flow",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.08,
      integrate: true,
      key: "spin",
      label: "Turn",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 0.6,
      integrate: true,
      key: "swellRate",
      label: "Surge rate",
      max: 8,
      min: 0,
      step: 0.05,
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
      default: 9,
      key: "scale",
      label: "Net scale",
      max: 30,
      min: 3,
      step: 0.1,
    },
    {
      default: 0.8,
      key: "warp",
      label: "Ripple depth",
      max: 3,
      min: 0,
      step: 0.02,
    },
    {
      default: 2.2,
      key: "edge",
      label: "Line sharpness",
      max: 10,
      min: 0.5,
      step: 0.05,
    },
    {
      default: 0.6,
      key: "split",
      label: "Colour fringe",
      max: 3,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.15,
      key: "swell",
      label: "Surge depth",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 1.6,
      key: "gain",
      label: "Sun power",
      max: 6,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1.1,
      key: "contrast",
      label: "Tone knee",
      max: 6,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 0.9,
      key: "light",
      label: "Floor light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.6,
      key: "rim",
      label: "Rim sheen",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  // the pool floor, the light thrown on it, and the wet gloss at the limb
  colors: [
    { default: "#0b2f6e", key: "deep", label: "Water" },
    { default: "#7ff6ff", key: "sun", label: "Caustic light" },
    { default: "#bfe8ff", key: "sheen", label: "Sheen" },
  ],
  /*
    Staged on the three integrated clocks and on amplitudes only — nothing
    a state touches is a spatial frequency, so every transition cross-fades
    with nothing racing across the surface. NET SCALE is the one frequency
    in the orb and it is never staged: it multiplies the surface direction
    before the fold, so gliding it would sweep the whole net through every
    spacing in between. Line sharpness is a power exponent on a base in
    [0, 1], an amplitude, and safe at any span.

    The read is in the water:

      idle     a slow pool, lit HARD. Gentle ripple, moderate lines, the
               faintest surge, the ball barely turning — but the sun at
               full power on a firmer knee, so the caustics burn white
               over dark red water.
      thinking NERVOUS water. The flow runs at three and a half times
               resting on a ripple nearly double rest's, and the lines
               go broad under it — a coarse, fast, restless net. The
               surge is shallow but quick, a flicker rather than a heave,
               and the ball all but freezes so the motion is in the
               light. The sun is dropped to half rest's power with the
               key light and rim pulled down: white on a darker red,
               dimmer than rest.
      speaking the water HEAVES, fast. Full surge depth on a rate five
               times rest's, so the light pumps in quick breaths, on the
               deepest ripple and the broadest lines — sheets of light
               rather than threads — with the colour split wide so every
               edge fringes, and the ball plainly turning beneath it. The
               rim is all but cut so the light is the sun alone. Warm:
               gold on brick red.
  */
  statePresets: {
    idle: {
      contrast: 1.3,
      edge: 3,
      flow: 0.92,
      gain: 6,
      light: 0.9,
      rim: 0.6,
      spin: 0.09,
      split: 0.6,
      swell: 0.15,
      swellRate: 0.6,
      warp: 0.8,
    },
    speaking: {
      contrast: 0.85,
      edge: 1.7,
      flow: 1.8,
      gain: 3.6,
      light: 0.96,
      rim: 0.18,
      spin: 0.7,
      split: 1.1,
      swell: 1,
      swellRate: 5.4,
      warp: 1.7,
    },
    thinking: {
      contrast: 1.15,
      edge: 2.8,
      flow: 3.22,
      gain: 3.35,
      light: 0.525,
      rim: 0.21,
      spin: 0.03,
      split: 0.36,
      swell: 0.26,
      swellRate: 2.4,
      warp: 1.52,
    },
  },
  // aqua light on dark red water at rest, pure white on a darker red while
  // searching, gold on brick-red water while answering
  stateColors: {
    idle: {
      deep: "#6f0b0b",
      sheen: "#bfe8ff",
      sun: "#7ff6ff",
    },
    speaking: {
      deep: "#8d2525",
      sheen: "#ffb3c6",
      sun: "#ffb914",
    },
    thinking: {
      deep: "#3a0808",
      sheen: "#ffffff",
      sun: "#ffffff",
    },
  },
};

export type Orb16Props = Omit<ShaderOrbProps, "variant">;

export function Orb16({ size = 280, ...rest }: Orb16Props) {
  return <ShaderOrb variant={orb16Orb} size={size} {...rest} />;
}

export default Orb16;

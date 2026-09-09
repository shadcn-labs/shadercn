"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const TORSION_FRAG = `
const STEPS: i32 = 50;
const TURB: i32 = 9;
const AA: i32 = 1;
// Volume-reactive values, resolved once per fragment in main().
var<private> torsionTurb: f32;
var<private> torsionTwist: f32;
var<private> torsionExposure: f32;

// GLSL ES 1.0 has no round() — it arrived in ES 3.0. The listing quantizes
// with it, so it ships here. Halves round up rather than to even, which is
// what a lattice quantizer wants anyway.
fn roundv(x: vec3f) -> vec3f { return floor(x + 0.5); }

fn torsionRender(fragCoord: vec2f) -> vec3f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var ro: vec3f = vec3f(0.0, 0.0, uP_camDist);
  var rd: vec3f = normalize(vec3f(uv, -uP_focal));

  var shimmer: f32 =uP_speed; // integrated clock: cell flicker
  var wave: f32 =uP_wave;     // integrated clock: the travelling twist
  var spin: f32 =uP_spin;     // integrated clock: roll about the axis

  // the axis lean and the roll, applied to the SAMPLE rather than to the
  // axis — see the header
  var ct: f32 =cos(uP_tilt);
  var st: f32 =sin(uP_tilt);
  var cs: f32 =cos(spin);
  var ss: f32 =sin(spin);

  // the twist axis, unit by construction, which is what makes the
  // Rodrigues rotation below exact
  var axis: vec3f = vec3f(0.0, 1.0, 0.0);

  var acc: vec3f = vec3f(0.0);

  // transmittance carried front-to-back — near shells veil far ones
  var T: f32 =1.0;

  // march only the span the envelope can light, as in orb-01
  var z: f32 =max(uP_camDist - uP_envRadius * 1.3, 0.0);
  var zEnd: f32 =uP_camDist + uP_envRadius * 1.3;

  for (var it: i32 =0; it < STEPS; it = it + 1) {
    var world: vec3f = ro + rd * z;

    // into the axis frame: lean about X, then roll about Y
    var p: vec3f = vec3f(world.x, world.y * ct + world.z * st, -world.y * st + world.z * ct);
    p = vec3f(p.x * cs - p.z * ss, p.y, p.x * ss + p.z * cs);

    /*
      The travelling twist. h is the sample's radius (scaled by the twist
      knob) minus the wave clock, and the line below is an exact rotation
      about the axis by 90 degrees - h. Because h depends only on radius,
      the winding is constant on spheres: the ball's own shells are the
      structure, and raising uP_twist puts more turns between the core and
      the surface.
    */
    var h: f32 =length(p) * torsionTwist - wave;
    var a: vec3f = mix(dot(axis, p) * axis, p, sin(h)) + cos(h) * cross(axis, p);

    // cell-quantized turbulence: every lattice cell flickers on its own
    // phase, the same construction orb-22 uses
    for (var j: i32 =0; j < TURB; j = j + 1) {
      var dj: f32 =f32(j) + 1.0;
      a += torsionTurb * sin(roundv(a * dj) - shimmer).zxy / dj;
    }

    /*
      The axial density. At uP_column 0 this is the listing's
      length(a.xz) — distance from the twist axis, so the step collapses
      along the pole and the axis burns as a column. At 1 it is the plain
      radial length and the column dissolves into shells.
    */
    var d: f32 =uP_stepScale * mix(length(a.xz), length(a), uP_column);
    d = max(d, uP_envRadius * 0.003);

    /*
      The march's own colour code, from the listing: red constant, green
      by DEPTH into the ball, blue by STEP INDEX — the opposite assignment
      from orb-22, and the reason this orb runs cyan-blue where that
      one runs red-green. Blue gets twice the clamp headroom: its ramp
      runs to STEPS (50) where red is fixed at 3, and an equal clamp would
      crush the step gradient first.
    */
    var w: vec3f = vec3f(3.0, (z - uP_camDist + uP_envRadius) * uP_hueDepth, f32(it) * uP_hueStep) / d;
    w = min(w, vec3f(uP_stepClamp) * vec3f(1.0, 1.0, 2.0));

    /*
      Normalize the clamped weight back to family units, exactly as in
      orb-22: without this line the clamp value leaks into total
      energy and Exposure, Body fill and Diffusion all change meaning
      whenever the clamp moves.
    */
    w *= 20.0 / max(uP_stepClamp, 1.0);

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    var env: f32 =smoothstep(uP_envRadius * 1.12, uP_envRadius * uP_envCore, length(world));
    w = (w + uP_fill) * env;

    acc += T * w;
    T *= exp(-dot(w, vec3f(0.299, 0.587, 0.114)) * uP_scatter);

    z += d;
    if (T < 0.004 || z > zEnd) { break; }
  }

  return acc;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  torsionTurb = uP_turb * (1.0 + 0.5 * uInput);
  torsionExposure = uP_exposure * (1.0 - 0.35 * uOutput);
  // the ball winds tighter while the agent speaks
  torsionTwist = uP_twist * (1.0 + 0.4 * uOutput);

  var acc: vec3f = vec3f(0.0);
  acc = torsionRender(fragCoord);

  // tanh tone map per channel — the envelope and transmittance change the
  // accumulator's scale, so the golfed /1e4 knee is a tunable here
  var col: vec3f = tanh3(acc / max(torsionExposure, 1.0));
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  // saturation about luminance, then the tint
  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a deep blue tail
  // has low luminance but must not go transparent
  var peak: f32 =max(col.r, max(col.g, col.b));
  var a: f32 =clamp(peak * uP_alphaGain, 0.0, 1.0);

  // Analytic silhouette — identical construction to orb-01: exact
  // ray-to-centre distance against the radius, colour AND alpha.
  var mrd: vec3f = normalize(vec3f(orbUV(), -uP_focal));
  var closest: f32 =length(cross(vec3f(0.0, 0.0, uP_camDist), mrd));
  var band: f32 =mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  var mask: f32 =1.0 - smoothstep(uP_envRadius * (1.0 - band), uP_envRadius * 1.005, closest);
  col *= mask;
  a *= mask;

  // safety taper at the frame boundary — colour as well as alpha
  var r2d: f32 =length(orbUV());
  var fade: f32 =1.0 - smoothstep(uP_edgeFade, 1.0, r2d);
  col *= fade;
  a *= fade;

  // Emitted light, so rgb is already premultiplied — do NOT scale by alpha
  // again (see the same note in orb-31).
  return vec4f(col, a);
}
`;

export const orb07Orb: OrbVariant = {
  colors: [{ key: "tint", label: "Tint", default: "#ffffff" }],
  frag: TORSION_FRAG,
  key: "orb-07",
  label: "ORB-07",
  note: "a twist wave travelling out through the ball around a lit column",
  params: [
    {
      key: "speed",
      label: "Cell shimmer",
      min: 0.015,
      max: 10,
      step: 0.05,
      default: 0.5,
      integrate: true,
    },
    {
      key: "wave",
      label: "Wave speed",
      min: 0,
      max: 8,
      step: 0.03,
      default: 0.7,
      integrate: true,
    },
    { key: "twist", label: "Twist", min: 0, max: 8, step: 0.02, default: 1 },
    {
      key: "spin",
      label: "Roll",
      min: 0,
      max: 3,
      step: 0.015,
      default: 0.1,
      integrate: true,
    },
    {
      key: "tilt",
      label: "Axis lean",
      min: -1.5,
      max: 1.5,
      step: 0.015,
      default: 0.3,
    },
    {
      key: "camDist",
      label: "Camera distance",
      min: 1,
      max: 50,
      step: 0.3,
      default: 7,
    },
    {
      key: "focal",
      label: "Lens",
      min: 0.15,
      max: 15,
      step: 0.1,
      default: 2.25,
    },
    {
      key: "turb",
      label: "Cell turbulence",
      min: 0,
      max: 5,
      step: 0.03,
      default: 1,
    },
    {
      key: "column",
      label: "Column release",
      min: 0,
      max: 1,
      step: 0.01,
      default: 0,
    },
    {
      key: "stepScale",
      label: "Step scale",
      min: 0.005,
      max: 1.5,
      step: 0.005,
      default: 0.1,
    },
    {
      key: "hueDepth",
      label: "Depth hue",
      min: 0,
      max: 10,
      step: 0.03,
      default: 0.75,
    },
    {
      key: "hueStep",
      label: "Step hue",
      min: 0,
      max: 10,
      step: 0.03,
      default: 0.45,
    },
    {
      key: "envRadius",
      label: "Envelope radius",
      min: 0.15,
      max: 15,
      step: 0.1,
      default: 2.6,
    },
    {
      key: "envCore",
      label: "Envelope core",
      min: 0.3,
      max: 1.02,
      step: 0.01,
      default: 0.88,
    },
    {
      key: "fill",
      label: "Body fill",
      min: 0,
      max: 100,
      step: 0.3,
      default: 0.15,
    },
    {
      key: "stepClamp",
      label: "Step clamp",
      min: 3,
      max: 5000,
      step: 10,
      default: 400,
    },
    {
      key: "scatter",
      label: "Diffusion",
      min: 0,
      max: 0.5,
      step: 0.003,
      default: 0.01,
    },
    {
      key: "exposure",
      label: "Exposure",
      min: 1.5,
      max: 5000,
      step: 5,
      default: 60,
    },
    {
      key: "contrast",
      label: "Contrast",
      min: 0.15,
      max: 15,
      step: 0.1,
      default: 1.3,
    },
    {
      key: "saturation",
      label: "Saturation",
      min: 0,
      max: 4,
      step: 0.02,
      default: 1.15,
    },
    {
      key: "alphaGain",
      label: "Alpha gain",
      min: 0.05,
      max: 15,
      step: 0.1,
      default: 2,
    },
    {
      key: "edge",
      label: "Edge sharpness",
      min: 0,
      max: 1,
      step: 0.01,
      default: 1,
    },
    {
      key: "edgeFade",
      label: "Halo falloff",
      min: 0.1,
      max: 3,
      step: 0.015,
      default: 0.98,
    },
  ],
  stateColors: {
    idle: { tint: "#ffffff" },
    speaking: { tint: "#ffc492" },
    thinking: { tint: "#9db8ff" },
  },
  statePresets: {
    idle: {
      alphaGain: 2,
      column: 0,
      exposure: 60,
      scatter: 0.01,
      speed: 0.5,
      turb: 1,
      twist: 1,
      wave: 0.7,
    },
    speaking: {
      alphaGain: 2.7,
      column: 0.45,
      exposure: 26,
      scatter: 0.006,
      speed: 0.9,
      turb: 0.85,
      twist: 0.35,
      wave: 3.2,
    },
    thinking: {
      alphaGain: 2,
      column: 0,
      exposure: 88,
      scatter: 0.011,
      speed: 1.5,
      turb: 1.35,
      twist: 3.6,
      wave: 0.15,
    },
  },
};

export type Orb07Props = Omit<ShaderOrbProps, "variant">;

export function Orb07({ size = 280, ...rest }: Orb07Props) {
  return <ShaderOrb variant={orb07Orb} size={size} {...rest} />;
}

export default Orb07;

"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const MUONS_FRAG = `
const STEPS: i32 = 10;
const TURB: i32 = 8;
const AA: i32 = 1;
// Volume-reactive values, resolved once per fragment in main().
var<private> muonsTurb: f32;
var<private> muonsExposure: f32;

fn muonsRender(fragCoord: vec2f) -> vec3f {
  var animTime: f32 =uP_speed; // integrated clock: weave + hue phase
  var wander: f32 =uP_wander;  // integrated clock: axis drift

  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var ro: vec3f = vec3f(0.0, 0.0, uP_camDist);
  var rd: vec3f = normalize(vec3f(uv, -uP_focal));

  /*
    Anchor the micro-slab to the ball: intersect the ray with the shell
    analytically and start the ten steps AT the entry point, so the slab
    hugs the sphere's curve. Rays that miss fall back to their closest
    approach — the envelope and silhouette cut them anyway.
  */
  var proj: f32 =dot(-ro, rd);
  var b2: f32 =dot(ro, ro) - proj * proj;
  var R: f32 =uP_envRadius * 0.96;
  var entry: f32 =proj - sqrt(max(R * R - b2, 0.0));

  var acc: vec3f = vec3f(0.0);
  var T: f32 =1.0;
  var z: f32 =entry;
  var s: f32 =0.0;

  for (var it: i32 =0; it < STEPS; it = it + 1) {
    var p: vec3f = ro + rd * z;

    // shell points scaled into field space — the original worked around
    // magnitude 9, and the ring density rides on that magnitude
    var q: vec3f = p * uP_fieldScale;

    // the per-layer axis, with the original's s feedback — each of the
    // ten layers takes a differently jittered axis
    var axis: vec3f = normalize(cos(vec3f(7.0, 1.0, 0.0) + wander - s));

    // the minus-90-degree Rodrigues twin of orb-22
    var a: vec3f = axis * dot(axis, q) - cross(axis, q);

    for (var j: i32 =0; j < TURB; j = j + 1) {
      var dj: f32 =f32(j) + 2.0;
      a += muonsTurb * sin(a * dj + animTime).yzx / dj;
    }

    // the shells: the march sticks where the field magnitude sits on a
    // multiple of pi, and 1/d blows up — that is the web
    s = length(a);
    var d: f32 =uP_stepScale * abs(sin(s));
    d = max(d, 1e-5);
    z += d;

    /*
      Layer-cycled palette, with the depth measured from the ENTRY point
      so the banding follows the ball's skin. Clamp then normalize to
      family units, as in orb-22 — the raw spikes run to 1/1e-5.
    */
    var w: vec3f = (cos((z - entry) / max(uP_stepScale, 1e-3) + animTime + vec3f(0.0, 2.0, 3.0) * uP_disperse) + 1.0)
      / d / max(s, 0.5);
    w = min(w, vec3f(uP_stepClamp));
    w *= 20.0 / max(uP_stepClamp, 1.0);

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    var env: f32 =smoothstep(uP_envRadius * 1.12, uP_envRadius * uP_envCore, length(p));
    w = (w + uP_fill) * env;

    acc += T * w;
    T *= exp(-dot(w, vec3f(0.299, 0.587, 0.114)) * uP_scatter);

    if (T < 0.004) { break; }
  }

  return acc;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  muonsTurb = uP_turb * (1.0 + 0.5 * uInput);
  muonsExposure = uP_exposure * (1.0 - 0.35 * uOutput);

  var acc: vec3f = vec3f(0.0);
  acc = muonsRender(fragCoord);

  // tanh tone map per channel — the golfed /3e3 knee is a tunable here
  var col: vec3f = tanh3(acc / max(muonsExposure, 1.0));
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  // saturation about luminance, then the tint
  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a saturated violet
  // thread has low luminance but must not go transparent
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

export const orb15Orb: OrbVariant = {
  colors: [{ default: "#ffffff", key: "tint", label: "Tint" }],
  frag: MUONS_FRAG,
  key: "orb-15",
  label: "ORB-15",
  note: "an iridescent particle-track web worn as the ball's skin",
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
      default: 0.15,
      integrate: true,
      key: "wander",
      label: "Axis wander",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 7,
      key: "camDist",
      label: "Camera distance",
      max: 50,
      min: 1,
      step: 0.3,
    },
    {
      default: 2.25,
      key: "focal",
      label: "Lens",
      max: 15,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 2.4,
      key: "fieldScale",
      label: "Web density",
      max: 20,
      min: 1,
      step: 0.1,
    },
    { default: 0.8, key: "turb", label: "Weave", max: 5, min: 0, step: 0.03 },
    {
      default: 0.015,
      key: "stepScale",
      label: "Skin depth",
      max: 0.4,
      min: 0.0015,
      step: 0.005,
    },
    {
      default: 1,
      key: "disperse",
      label: "Dispersion",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 2.6,
      key: "envRadius",
      label: "Envelope radius",
      max: 15,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 1,
      key: "envCore",
      label: "Envelope core",
      max: 1.02,
      min: 0.3,
      step: 0.01,
    },
    {
      default: 0.3,
      key: "fill",
      label: "Body fill",
      max: 100,
      min: 0,
      step: 0.3,
    },
    {
      default: 150,
      key: "stepClamp",
      label: "Step clamp",
      max: 5000,
      min: 3,
      step: 30,
    },
    {
      default: 0.01,
      key: "scatter",
      label: "Diffusion",
      max: 0.5,
      min: 0,
      step: 0.003,
    },
    {
      default: 50,
      key: "exposure",
      label: "Exposure",
      max: 1500,
      min: 1.5,
      step: 10,
    },
    {
      default: 1.35,
      key: "contrast",
      label: "Contrast",
      max: 15,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 1.35,
      key: "saturation",
      label: "Saturation",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 2,
      key: "alphaGain",
      label: "Alpha gain",
      max: 15,
      min: 0.05,
      step: 0.1,
    },
    {
      default: 1,
      key: "edge",
      label: "Edge sharpness",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.98,
      key: "edgeFade",
      label: "Halo falloff",
      max: 3,
      min: 0.1,
      step: 0.015,
    },
  ],
  /*
    Staged on the two integrated clocks, as across the family: thinking
    sends the AXIS hunting (the web continuously reweaves in place) while
    speaking is speed-led (the layer-cycled iridescence shimmers fast and
    bright). turb and disperse are amplitudes/phases — everything glides.
  */
  statePresets: {
    idle: {
      alphaGain: 2,
      disperse: 1,
      exposure: 72,
      scatter: 0.01,
      speed: 0.4,
      turb: 0.75,
      wander: 0.12,
    },
    speaking: {
      alphaGain: 2.5,
      disperse: 1.6,
      exposure: 46,
      scatter: 0.0075,
      speed: 2,
      turb: 1.1,
      wander: 0.3,
    },
    thinking: {
      alphaGain: 2.1,
      disperse: 0.8,
      exposure: 66,
      scatter: 0.0095,
      speed: 1,
      turb: 0.95,
      wander: 0.7,
    },
  },
};

export type Orb15Props = Omit<ShaderOrbProps, "variant">;

export const Orb15 = ({ size = 280, ...rest }: Orb15Props) => (
  <ShaderOrb variant={orb15Orb} size={size} {...rest} />
);

export default Orb15;

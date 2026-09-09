"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const ION_FRAG = `
const STEPS: i32 = 64;
// Volume-reactive values, resolved once per fragment in main().
var<private> ionSharp: f32;
var<private> ionWrithe: f32;
var<private> ionCore: f32;
var<private> ionExposure: f32;
var<private> ionRadius: f32;

fn ionRot2(a: f32) -> mat2x2f {
  var c: f32 =cos(a);
  var s: f32 =sin(a);
  return mat2x2f(vec2f(c, -s), vec2f(s, c));
}

fn ionRender(fragCoord: vec2f) -> vec3f {
  var t: f32 =uP_speed;      // integrated clock: filament crawl
  var spinAng: f32 =uP_spin; // integrated clock: array precession

  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var ro: vec3f = vec3f(0.0, 0.0, uP_camDist);
  var rd: vec3f = normalize(vec3f(uv, -uP_focal));

  // exact ray/sphere chord — the march never leaves the globe, so no
  // envelope fade is needed and every step length is meaningful
  var proj: f32 =dot(-ro, rd);
  var b2: f32 =dot(ro, ro) - proj * proj;
  var half_: f32 =sqrt(max(ionRadius * ionRadius - b2, 0.0));
  var zNear: f32 =proj - half_;
  var stepLen: f32 =2.0 * half_ / f32(STEPS);
  // per-pixel jitter of the march start: a filament grazed at a shallow
  // angle is crossed periodically by the fixed step grid and renders as a
  // dotted chain — the jitter decorrelates neighbouring rays and melts the
  // dots into plasma grain
  zNear += (hash(fragCoord) - 0.5) * stepLen;

  var acc: vec3f = vec3f(0.0);
  var T: f32 =1.0;

  for (var i: i32 =0; i < STEPS; i = i + 1) {
    var p: vec3f = ro + rd * (zNear + (f32(i) + 0.5) * stepLen);

    // precess the whole filament array; a static tilt keeps the spin axis
    // off-vertical so the motion reads in 3D
    var pr: vec3f = p;
    let prSpun = ionRot2(spinAng) * vec2f(pr.x, pr.z);
    pr.x = prSpun.x;
    pr.z = prSpun.y;
    let prTilt = ionRot2(uP_tilt) * vec2f(pr.y, pr.z);
    pr.y = prTilt.x;
    pr.z = prTilt.y;

    var r: f32 =length(pr);
    var dir: vec3f = pr / max(r, 1e-4);
    var rr: f32 =r / max(ionRadius, 1e-3);

    // writhe: bend the sampling direction with radius and time, rooted at
    // the nucleus by the smoothstep so filaments stay attached
    var wr: f32 =ionWrithe * smoothstep(0.0, ionRadius * 0.35, r);
    var q: vec3f = dir * uP_fils;
    q += wr * vec3f(
      sin(r * uP_writheFreq        - t * 1.2 + q.y * 1.8),
      sin(r * uP_writheFreq * 0.83 + t * 1.0 + q.z * 1.8),
      sin(r * uP_writheFreq * 1.19 - t * 0.7 + q.x * 1.8));

    // two independent fields over the direction sphere; their joint zero
    // set is the filament curves. Time enters as additive phase only.
    var f1: f32 =sin(q.x + t * 0.70)
             + sin(q.y * 1.31 - t * 0.50)
             + sin(q.z * 1.13 + t * 0.90);
    var f2: f32 =sin(q.y * 1.21 + t * 0.60 + 1.7)
             + sin(q.z * 1.43 - t * 0.80 + 3.1)
             + sin(q.x * 0.87 + t * 0.40 + 5.0);
    var d2: f32 =f1 * f1 + f2 * f2;
    var g: f32 =1.0 / (d2 * ionSharp + uP_soft);

    // flare where a streamer lands on the glass, and the hot nucleus
    g *= 1.0 + uP_tipGain * smoothstep(0.55, 0.95, rr);
    var core: f32 =ionCore / (r * r * 8.0 + 0.05);

    // pink near the nucleus, violet-blue at the glass, cores whitened by
    // their own intensity
    var fCol: vec3f = mix(uC_inner, uC_arc, smoothstep(0.1, 0.75, rr));
    var w: vec3f = (fCol + vec3f(uP_whiten) * g) * g + uC_inner * core + vec3f(uP_fill);
    w = min(w, vec3f(uP_stepClamp));
    w *= stepLen; // length-fair: limb chords are short and dim correctly

    acc += T * w;
    T *= exp(-dot(w, vec3f(0.299, 0.587, 0.114)) * uP_scatter);
    if (T < 0.004) { break; }
  }

  return acc;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Louder agent output softens and thickens the arcs and quickens the
  // writhe; user input flares the nucleus — the globe answers being spoken
  // to the way the real toy answers a fingertip.
  ionSharp = uP_sharp * (1.0 - 0.25 * uOutput);
  ionWrithe = uP_writhe * (1.0 + 0.6 * uOutput);
  ionCore = uP_coreGain * (1.0 + 1.6 * uInput + 0.4 * uOutput);
  ionExposure = uP_exposure * (1.0 - 0.35 * uOutput);
  ionRadius = uP_envRadius + uP_swell * uInput;

  var acc: vec3f = ionRender(fragCoord);

  // tanh tone map with a tunable knee, then the usual finishing chain
  var col: vec3f = tanh3(acc / max(ionExposure, 0.01));
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel — a saturated violet streamer has low
  // luminance but must not go transparent
  var peak: f32 =max(col.r, max(col.g, col.b));
  var a: f32 =clamp(peak * uP_alphaGain, 0.0, 1.0);

  // analytic silhouette, identical construction to orb-01: exact
  // ray-to-centre distance against the radius, colour AND alpha
  var mrd: vec3f = normalize(vec3f(orbUV(), -uP_focal));
  var closest: f32 =length(cross(vec3f(0.0, 0.0, uP_camDist), mrd));
  var band: f32 =mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  var mask: f32 =1.0 - smoothstep(ionRadius * (1.0 - band), ionRadius * 1.005, closest);
  col *= mask;
  a *= mask;

  // Emitted light, so rgb is already premultiplied — do NOT scale by alpha
  // again (see the same note in orb-31).
  return vec4f(col, a);
}
`;

export const orb13Orb: OrbVariant = {
  colors: [
    { default: "#ff70d8", key: "inner", label: "Nucleus" },
    { default: "#5a5cff", key: "arc", label: "Arc" },
    { default: "#ffffff", key: "tint", label: "Tint" },
  ],
  frag: ION_FRAG,
  key: "orb-13",
  label: "ORB-13",
  note: "plasma globe: crawling lightning filaments",
  params: [
    {
      default: 1,
      integrate: true,
      key: "speed",
      label: "Anim speed",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.2,
      integrate: true,
      key: "spin",
      label: "Spin rate",
      max: 5,
      min: 0,
      step: 0.03,
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
      default: 2.6,
      key: "envRadius",
      label: "Globe radius",
      max: 15,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 0.15,
      key: "swell",
      label: "Input swell",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.4,
      key: "tilt",
      label: "Axis tilt",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 6,
      key: "fils",
      label: "Filament density",
      max: 12,
      min: 0.5,
      step: 0.1,
    },
    {
      default: 0.9,
      key: "writhe",
      label: "Writhe",
      max: 3,
      min: 0,
      step: 0.02,
    },
    {
      default: 1.6,
      key: "writheFreq",
      label: "Writhe frequency",
      max: 8,
      min: 0.2,
      step: 0.05,
    },
    {
      default: 4,
      key: "sharp",
      label: "Arc sharpness",
      max: 60,
      min: 0.5,
      step: 0.5,
    },
    {
      default: 0.06,
      key: "soft",
      label: "Arc core softness",
      max: 0.5,
      min: 0.002,
      step: 0.002,
    },
    {
      default: 0.008,
      key: "whiten",
      label: "Core whitening",
      max: 0.2,
      min: 0,
      step: 0.002,
    },
    {
      default: 1.6,
      key: "coreGain",
      label: "Nucleus glow",
      max: 5,
      min: 0,
      step: 0.05,
    },
    {
      default: 1.8,
      key: "tipGain",
      label: "Glass flare",
      max: 6,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.02,
      key: "fill",
      label: "Body haze",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 40,
      key: "stepClamp",
      label: "Step clamp",
      max: 300,
      min: 0.3,
      step: 1.5,
    },
    {
      default: 0.012,
      key: "scatter",
      label: "Diffusion",
      max: 0.5,
      min: 0,
      step: 0.003,
    },
    {
      default: 11,
      key: "exposure",
      label: "Exposure",
      max: 200,
      min: 0.1,
      step: 0.5,
    },
    {
      default: 1,
      key: "contrast",
      label: "Contrast",
      max: 15,
      min: 0.15,
      step: 0.1,
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
      default: 2.5,
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
  ],
  statePresets: {
    idle: {
      coreGain: 1.6,
      exposure: 11,
      fils: 6,
      sharp: 4,
      soft: 0.06,
      speed: 1,
      spin: 0.2,
      tipGain: 1.8,
      whiten: 0.008,
      writhe: 0.9,
    },
    speaking: {
      coreGain: 2,
      exposure: 8.5,
      fils: 8,
      sharp: 3.5,
      soft: 0.05,
      speed: 2.6,
      spin: 0.3,
      tipGain: 2.4,
      whiten: 0.012,
      writhe: 1.3,
    },
    thinking: {
      coreGain: 1.2,
      exposure: 10,
      fils: 7,
      sharp: 3,
      soft: 0.08,
      speed: 1.8,
      spin: 0.45,
      tipGain: 1.5,
      whiten: 0.012,
      writhe: 1.2,
    },
  },
};

export type Orb13Props = Omit<ShaderOrbProps, "variant">;

export const Orb13 = ({ size = 280, ...rest }: Orb13Props) => (
  <ShaderOrb variant={orb13Orb} size={size} {...rest} />
);

export default Orb13;

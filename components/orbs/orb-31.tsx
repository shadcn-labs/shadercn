"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const CORONA_FRAG = `
const AA: i32 = 1;
const MAX_STEPS: i32 = 256;
fn transpose3(m: mat3x3f) -> mat3x3f {
  return mat3x3f(
    m[0][0], m[1][0], m[2][0],
    m[0][1], m[1][1], m[2][1],
    m[0][2], m[1][2], m[2][2]
  );
}

// An artistic tumble, not an orthonormal rotation — the axes shear against each
// other so the shell never repeats a clean spin.
fn coronaRot(a: f32) -> mat3x3f {
  return mat3x3f(
    cos(a), sin(a / 2.0) * sin(a), sin(a) * cos(a / 2.0),
    0.0, cos(a / 2.0), -sin(a / 2.0),
    -sin(a), sin(a / 2.0) * cos(a), cos(a / 2.0) * cos(a)
  );
}

var<private> globalRot: mat3x3f;
var<private> globalInvRot: mat3x3f;

// Volume-reactive values, resolved once per fragment in main().
var<private> shellRadius: f32;
var<private> warpAmount: f32;
var<private> rayGain: f32;
var<private> warpFreqNow: f32;
var<private> smoothKNow: f32;

fn smin(a: f32, b: f32, k: f32) -> f32 {
  var h: f32 =clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn coronaSDF(p: vec3f) -> f32 {
  var p1: vec3f = p;
  // p1.zyx += ... : WGSL has no swizzle assignment, so the reversed
  // components are written back one at a time from a temporary.
  var w: vec3f = sin(p.xzy * warpFreqNow) / max(warpAmount, 0.001);
  p1 = vec3f(p1.x + w.z, p1.y + w.y, p1.z + w.x);
  return -smin(length(p1) - shellRadius, shellRadius - length(p), smoothKNow);
}

fn shellColor(p: vec3f) -> vec3f {
  var eps: f32 =0.001;
  var normal: vec3f = globalInvRot * normalize(vec3f(
    coronaSDF(p + vec3f(eps, 0.0, 0.0)) - coronaSDF(p - vec3f(eps, 0.0, 0.0)),
    coronaSDF(p + vec3f(0.0, eps, 0.0)) - coronaSDF(p - vec3f(0.0, eps, 0.0)),
    coronaSDF(p + vec3f(0.0, 0.0, eps)) - coronaSDF(p - vec3f(0.0, 0.0, eps))
  ));

  var next: vec3f = 1.0 - (normal * 0.5 + 0.5);
  next = vec3f(dot(next, vec3f(1.0)) / 3.0);
  return 1.025 - next * next;
}

fn coronaRender(fragCoord: vec2f) -> vec4f {
  var uv: vec2f = (fragCoord * 2.0 - uRes) / min(uRes.x, uRes.y);

  var ro: vec3f = vec3f(0.0, 0.0, -uP_camDist);
  var rd: vec3f = normalize(vec3f(uv, uP_fov));

  ro = globalRot * ro;
  rd = globalRot * rd;

  var p: vec3f = ro;
  var d: f32 =1.0;
  var t: f32 =0.0;
  var godrays: f32 =0.0;

  for (var i: i32 =0; i < MAX_STEPS; i = i + 1) {
    if (d <= 0.005 || t >= uP_maxDist) { break; }
    p = ro + rd * t;
    d = coronaSDF(p) / max(uP_stepScale, 0.5);

    // Gate the accumulation on the shell so light bleeds out of the hollow
    // instead of glowing uniformly through empty space.
    var fog: f32 = select(
      1.0,
      smoothstep(0.0, 0.5, coronaSDF(normalize(p) * shellRadius)),
      length(p) > shellRadius
    );
    godrays += (rayGain / (1.0 + dot(p, p) * uP_rayFalloff)) * fog;

    t += d;
  }

  var col: vec3f = vec3f(uP_ambient);
  if (t < uP_maxDist) { col = shellColor(p) * uP_surfaceLit; }
  col += godrays;

  return vec4f(col, 1.0);
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  var animTime: f32 = uP_speed; // integrated clock
  globalRot = coronaRot(animTime);
  globalInvRot = transpose3(coronaRot(animTime));

  /*
    One shared BACK-AND-FORTH phase for the swept values. sin() of an
    integrated clock is a true round trip — it eases through both ends
    instead of snapping at a wrap, which fract() or mod() would do.

    Every swept value is resolved HERE, once per fragment, and never read
    straight from its uniform inside coronaSDF: the normal estimate calls
    that SDF six more times, and a value that moved between those calls
    would corrupt the finite difference and pit the shading.

    uP_sweepRate is its own integrated clock, so the breathing rate tunes
    without jumping the phase, and it only ever enters through sin() —
    safe for an unbounded clock. All three swings share the phase, so the
    shell breathes as one motion rather than three unrelated wobbles.
  */
  var sweepPhase: f32 =sin(uP_sweepRate);

  // Louder agent output pushes the godrays; user input roughens the shell and
  // swells it slightly, so the silhouette breathes with speech.
  shellRadius = uP_radius + uP_swell * uInput;
  warpAmount = (uP_warp + uP_warpSwing * sweepPhase) * (1.0 - 0.25 * uInput - 0.15 * uOutput);
  warpAmount = max(warpAmount, 0.05);
  rayGain = uP_rayGain * (0.7 + 0.8 * uOutput + 0.3 * uInput);

  warpFreqNow = max(uP_warpFreq + uP_freqSwing * sweepPhase, 0.05);

  /*
    smoothK reaches EXACTLY zero at the bottom of the speaking sweep
    (0.25 +/- 0.25), and smin() divides by it — an unguarded zero is a
    NaN across the whole SDF. The floor keeps the blend hard but finite.
  */
  smoothKNow = max(uP_smoothK + uP_smoothSwing * sweepPhase, 0.005);

  var acc: vec4f = vec4f(0.0);
  acc = coronaRender(fragCoord);

  // Luminance becomes alpha so the orb composites onto the page instead of
  // painting an opaque square.
  //
  // The colour is emitted light, so it is already premultiplied: rgb is what
  // the orb adds, alpha is only how much background it hides. Multiplying rgb
  // by alpha again (the usual move for a lit surface) would darken the glow
  // quadratically and wash the godrays out.
  var col: vec3f = clamp(acc.rgb, vec3f(0.0), vec3f(1.0));
  var lum: f32 =dot(col, vec3f(0.2126, 0.7152, 0.0722));
  var a: f32 =clamp(lum * uP_alphaGain, 0.0, 1.0);

  // The godrays are volumetric, so they reach the frame boundary and would
  // otherwise show the canvas as a hard-edged glowing square. Taper radially to
  // let the halo fall off into the page instead — colour as well as alpha,
  // since premultiplied output would otherwise keep emitting at full brightness
  // right up to the cutoff and leave a visible rim.
  var fade: f32 =1.0 - smoothstep(uP_edgeFade, 1.0, length(orbUV()));
  col *= fade;
  a *= fade;

  return vec4f(col, a);
}
`;

export const orb31Orb: OrbVariant = {
  colors: [],
  frag: CORONA_FRAG,
  key: "orb-31",
  label: "ORB-31",
  note: "raymarched shell, volumetric godrays",
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
      default: 0.5,
      integrate: true,
      key: "sweepRate",
      label: "Sweep rate",
      max: 6,
      min: 0,
      step: 0.02,
    },
    {
      default: 2.6,
      key: "radius",
      label: "Shell radius",
      max: 10,
      min: 0.4,
      step: 0.05,
    },
    {
      default: 0.18,
      key: "swell",
      label: "Input swell",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.9,
      key: "warp",
      label: "Warp divisor",
      max: 10,
      min: 0.3,
      step: 0.05,
    },
    {
      default: 5.25,
      key: "warpFreq",
      label: "Warp frequency",
      max: 30,
      min: 0.15,
      step: 0.15,
    },
    {
      default: 0,
      key: "warpSwing",
      label: "Warp swing",
      max: 8,
      min: 0,
      step: 0.05,
    },
    {
      default: 0,
      key: "freqSwing",
      label: "Frequency swing",
      max: 15,
      min: 0,
      step: 0.05,
    },
    {
      default: 0,
      key: "smoothSwing",
      label: "Softness swing",
      max: 2,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.42,
      key: "smoothK",
      label: "Blend softness",
      max: 4,
      min: 0.015,
      step: 0.02,
    },
    {
      default: 0.8,
      key: "rayGain",
      label: "Godray gain",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 10.5,
      key: "rayFalloff",
      label: "Godray falloff",
      max: 100,
      min: 0.3,
      step: 0.5,
    },
    {
      default: 0.105,
      key: "surfaceLit",
      label: "Surface light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0,
      key: "ambient",
      label: "Ambient",
      max: 1,
      min: 0,
      step: 0.005,
    },
    {
      default: 3,
      key: "alphaGain",
      label: "Alpha gain",
      max: 15,
      min: 0.05,
      step: 0.1,
    },
    {
      default: 0.45,
      key: "edgeFade",
      label: "Halo falloff",
      max: 3,
      min: 0.1,
      step: 0.015,
    },
    {
      default: 12,
      key: "camDist",
      label: "Camera distance",
      max: 100,
      min: 1.5,
      step: 0.5,
    },
    { default: 3.5, key: "fov", label: "Lens", max: 20, min: 0.3, step: 0.1 },
    {
      default: 9,
      key: "stepScale",
      label: "Step safety",
      max: 30,
      min: 0.3,
      step: 0.5,
    },
    {
      default: 22,
      key: "maxDist",
      label: "Max distance",
      max: 100,
      min: 3,
      step: 1,
    },
  ],
  statePresets: {
    idle: {
      alphaGain: 3,
      freqSwing: 0,
      rayFalloff: 10.5,
      rayGain: 0.8,
      smoothK: 0.42,
      smoothSwing: 0,
      speed: 1,
      swell: 0.18,
      warp: 0.9,
      warpFreq: 5.25,
      warpSwing: 0,
    },
    speaking: {
      alphaGain: 1.8,
      freqSwing: 4.5,
      rayFalloff: 8,
      rayGain: 0.52,
      smoothK: 0.25,
      smoothSwing: 0.25,
      speed: 0.9,
      sweepRate: 0.8,
      swell: 0.66,
      warp: 3.75,
      warpFreq: 19.5,
      warpSwing: 2.25,
    },
    thinking: {
      alphaGain: 1.8,
      freqSwing: 2,
      rayFalloff: 8,
      rayGain: 0.52,
      smoothK: 0.58,
      smoothSwing: 0,
      speed: 0.9,
      sweepRate: 0.5,
      swell: 0.66,
      warp: 1,
      warpFreq: 7,
      warpSwing: 0,
    },
  },
};

export type Orb31Props = Omit<ShaderOrbProps, "variant">;

export const Orb31 = ({ size = 280, ...rest }: Orb31Props) => (
  <ShaderOrb variant={orb31Orb} size={size} {...rest} />
);

export default Orb31;

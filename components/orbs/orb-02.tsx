"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const ROCAILLE_FRAG = `
const LAYERS: i32 = 10;
const WARP: i32 = 9;
fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  var R: f32 =uP_radius + uP_swell * uInput;
  var r2d: f32 =length(uv);
  var mask: f32 =smoothstep(0.012, -0.012, r2d - R);
  var nr: f32 =clamp(r2d / max(R, 0.001), 0.0, 1.0);
  var z: f32 =sqrt(max(1.0 - nr * nr, 0.0));

  var animTime: f32 =uP_speed; // integrated clock

  var sp: vec3f = vec3f(uv / max(R, 0.001), z);

  /*
    Stereographic projection: sphere → plane. Equal steps in screen space map to
    ever-larger steps in pattern space as the rim is approached, which is exactly
    the foreshortening that sells a flat field as wrapped geometry. uP_bulge
    softens the divisor — higher flattens it back toward a disc.

    DO NOT rotate sp in 3D before this. Spinning the dome about Y mixes sp.x
    into sp.z, so near the rim the divisor collapses toward zero, p explodes,
    length(v) goes huge, and 1/length(v) leaves most of the sphere black. That
    is what hollowed the orb out. The projection needs sp.z to stay the
    view-facing component.

    Motion comes from animTime inside the warp below instead, which changes the
    scrollwork without ever touching the projection. If you want the pattern to
    travel, rotate or translate p here in 2D — that is projection-safe.
  */
  var p: vec2f = sp.xy / (sp.z + 1.0 + uP_bulge) * uP_zoom;

  // projection-safe 2D drift, in place of a dome spin
  var sw: f32 =animTime * uP_swirl;
  p = mat2x2f(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;

  // input volume tightens the warp; output volume brightens the layers
  var warpFreq: f32 =uP_warpFreq * (1.0 + 0.35 * uInput);
  var gain: f32 =uP_gain * (0.75 + 0.7 * uOutput);

  var acc: vec4f = vec4f(0.0);
  for (var i: i32 =1; i <= LAYERS; i = i + 1) {
    var fi: f32 =f32(i);
    var v: vec2f = p;
    for (var j: i32 =1; j <= WARP; j = j + 1) {
      var f: f32 =f32(j);
      v += sin(v.yx * f * warpFreq + fi + animTime) / f;
    }
    // uP_coreClamp guards the divide and doubles as the flare size — the
    // original has no guard and relies on length(v) never hitting zero.
    //
    // uP_falloff is the FILL control. The original's plain 1/length(v) decays
    // fast, so only the knots where the warp lands near the origin light up and
    // the rest of the sphere stays near black. An exponent below 1 flattens the
    // tail — at length(v)=10 a 0.6 power is ~4x brighter than 1/x — which lifts
    // the filigree between the knots without blowing the knots themselves out.
    var rad: f32 =pow(max(length(v), uP_coreClamp), uP_falloff);
    acc += (cos(fi + vec4f(0.0, 1.0, 2.0, 3.0) + uP_hueShift) + 1.0) / 6.0 / rad;
  }

  // the original squares before tone-mapping, which is what crushes the dim
  // filigree and leaves the bright scrollwork
  var col: vec3f = tanh3(acc.rgb * acc.rgb * gain);

  // rim light, so the silhouette reads as a ball rather than a cut-out
  var fresnel: f32 =pow(1.0 - z, uP_rimPow);
  col += vec3f(fresnel) * uP_rim;

  var lum: f32 =dot(col, vec3f(0.2126, 0.7152, 0.0722));
  var visibility: f32 =clamp(lum * uP_alphaGain + uP_baseVis + fresnel * 0.25, 0.0, 1.0);

  // Surface-lit and mask-bounded, so alpha is coverage: premultiply normally.
  // (Unlike Corona and Nimbus, which are emissive and must not be.)
  var a: f32 =mask * visibility;
  return vec4f(col * a, a);
}
`;

export const orb02Orb: OrbVariant = {
  colors: [],
  frag: ROCAILLE_FRAG,
  key: "orb-02",
  label: "ORB-02",
  note: "ornate scrollwork on a rolling dome",
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
      default: 0.06,
      key: "swirl",
      label: "Swirl",
      max: 3,
      min: 0,
      step: 0.015,
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
      default: 0.06,
      key: "swell",
      label: "Input swell",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 4.4,
      key: "zoom",
      label: "Pattern zoom",
      max: 40,
      min: 0.15,
      step: 0.2,
    },
    {
      default: 0.35,
      key: "bulge",
      label: "Sphere bulge",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 1.5,
      key: "warpFreq",
      label: "Warp frequency",
      max: 10,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 0,
      key: "hueShift",
      label: "Hue shift",
      max: 6.283,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.12,
      key: "coreClamp",
      label: "Flare size",
      max: 3,
      min: 0.003,
      step: 0.015,
    },
    {
      default: 1,
      key: "falloff",
      label: "Fill",
      max: 4,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 0.55,
      key: "gain",
      label: "Exposure",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.12,
      key: "rim",
      label: "Rim light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 2.2,
      key: "rimPow",
      label: "Rim tightness",
      max: 15,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 2.4,
      key: "alphaGain",
      label: "Alpha gain",
      max: 15,
      min: 0.05,
      step: 0.1,
    },
    {
      default: 0.08,
      key: "baseVis",
      label: "Base visibility",
      max: 1.5,
      min: 0,
      step: 0.01,
    },
  ],
  /*
   * No dome rotation in any state — see the projection note in the shader. The
   * states differ by how fast the scrollwork evolves and how dense it is.
   *
   * `swirl` is deliberately absent from every preset: the rotation angle is
   * animTime * swirl, so a per-state swirl value makes a state change sweep
   * the angle by (accumulated clock) x (delta) — the whole dome visibly spins
   * while the preset glides. Held constant, the angle stays continuous and a
   * state change only retimes the scrollwork.
   */
  statePresets: {
    idle: {
      alphaGain: 2.4,
      coreClamp: 0.12,
      falloff: 1,
      gain: 0.55,
      rim: 0.12,
      speed: 0.5,
      warpFreq: 1.5,
      zoom: 4.4,
    },
    speaking: {
      alphaGain: 3,
      coreClamp: 0.07,
      falloff: 1.1,
      gain: 0.85,
      rim: 0.2,
      speed: 3,
      warpFreq: 1.2,
      zoom: 4.4,
    },
    thinking: {
      alphaGain: 2.5,
      coreClamp: 0.11,
      falloff: 0.96,
      gain: 0.6,
      rim: 0.13,
      speed: 0.65,
      warpFreq: 1.6,
      zoom: 4.6,
    },
  },
};

export type Orb02Props = Omit<ShaderOrbProps, "variant">;

export const Orb02 = ({ size = 280, ...rest }: Orb02Props) => (
  <ShaderOrb variant={orb02Orb} size={size} {...rest} />
);

export default Orb02;

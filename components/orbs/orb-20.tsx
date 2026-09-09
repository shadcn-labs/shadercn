"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const FALLS_FRAG = `
const STEPS: i32 = 50;
const TURB: i32 = 5;
const AA: i32 = 1;
// Volume-reactive values, resolved once per fragment in main().
var<private> fallsFoam: f32;
var<private> fallsExposure: f32;

fn fallsRot(a: f32) -> mat2x2f {
  var c: f32 =cos(a);
  var s: f32 =sin(a);
  return mat2x2f(vec2f(c, -s), vec2f(s, c));
}

fn fallsRender(fragCoord: vec2f) -> vec3f {
  var animTime: f32 =uP_speed; // integrated clock: ripple phase
  var flow: f32 =uP_flow;      // integrated clock: the 9t rush, tunable

  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var ro: vec3f = vec3f(0.0, 0.0, uP_camDist);
  var rd: vec3f = normalize(vec3f(uv, -uP_focal));

  var rShell: f32 =uP_envRadius * 0.92;

  var acc: vec3f = vec3f(0.0);

  // transmittance carried front-to-back — near foam veils far foam
  var T: f32 =1.0;

  // march only the span the envelope can light, as in orb-01
  var z: f32 =max(uP_camDist - uP_envRadius * 1.3, 0.0);
  var zEnd: f32 =uP_camDist + uP_envRadius * 1.3;

  for (var it: i32 =0; it < STEPS; it = it + 1) {
    var c: vec3f = ro + rd * z;

    // a slight static tilt of the flow axis
    // (swizzle assignment is illegal in WGSL — rotate through a temp)
    let cTilt = fallsRot(uP_tilt) * vec2f(c.y, c.z);
    c.y = cTilt.x;
    c.z = cTilt.y;

    /*
      The fall grain: squash the vertical axis, then the five octaves with
      the rush phase on the first component — cos(p.yzx*f + ...) writes
      that component to x, so height and time drive the sideways waves,
      exactly the original's x*t construction.
    */
    var p: vec3f = c;
    p.y *= uP_stretch;
    for (var j: i32 =0; j < TURB; j = j + 1) {
      var fj: f32 =f32(j) + 1.3;
      p += cos(p.yzx * fj + f32(it) + z + vec3f(flow, 0.0, 0.0)) / fj;
    }

    // the foam blend — most of the displacement is thrown away, leaving a
    // film of detail over a coherent surface
    var pm: vec3f = mix(c, p, fallsFoam);

    /*
      The surface, swapped from the sigmoid cliff to the ball's own shell:
      distance to the sphere (sharpened by uP_wall) plus the original's
      traveling ripple. f can still reach zero exactly — the guard feeds
      both the division and the march step.
    */
    var f: f32 =uP_stepScale * (abs(length(pm) - rShell) * uP_wall
      + sin(pm.x - pm.z + animTime * 2.0) + 1.0);
    f = max(f, 1e-3);
    z += f;

    /*
      Vertical hue sheets from the listing, bright where the march grazes
      the film. The CLAMP is load-bearing, as in every accumulator here —
      one f-null step would own the whole 50-step sum.
    */
    var w: vec3f = (cos(pm.x * uP_hueScale + f + vec3f(6.0, 1.0, 2.0)) + 2.0) / f / max(z, 1.0);
    w = min(w, vec3f(uP_stepClamp));

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    var env: f32 =smoothstep(uP_envRadius * 1.12, uP_envRadius * uP_envCore, length(ro + rd * z));
    w = (w + uP_fill) * env;

    acc += T * w;
    T *= exp(-dot(w, vec3f(0.299, 0.587, 0.114)) * uP_scatter);

    if (T < 0.004 || z > zEnd) { break; }
  }

  return acc;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  fallsFoam = uP_foam * (1.0 + 0.5 * uInput);
  fallsExposure = uP_exposure * (1.0 - 0.35 * uOutput);

  var acc: vec3f = vec3f(0.0);
  acc = fallsRender(fragCoord);

  // tanh tone map per channel — the golfed /3e1 knee is a tunable here
  var col: vec3f = tanh3(acc / max(fallsExposure, 1.0));
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  // saturation about luminance, then the tint
  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a deep blue sheet
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

export const orb20Orb: OrbVariant = {
  colors: [{ key: "tint", label: "Tint", default: "#ffffff" }],
  frag: FALLS_FRAG,
  key: "orb-20",
  label: "ORB-20",
  note: "a water film rushing down the ball, fountain-style",
  params: [
    {
      key: "speed",
      label: "Ripple speed",
      min: 0.015,
      max: 10,
      step: 0.05,
      default: 0.5,
      integrate: true,
    },
    {
      key: "flow",
      label: "Fall rush",
      min: 0,
      max: 20,
      step: 0.1,
      default: 3,
      integrate: true,
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
      key: "tilt",
      label: "Flow tilt",
      min: 0,
      max: 4,
      step: 0.02,
      default: 0.15,
    },
    {
      key: "stretch",
      label: "Fall stretch",
      min: 0.03,
      max: 3,
      step: 0.015,
      default: 0.3,
    },
    { key: "foam", label: "Foam", min: 0, max: 3, step: 0.015, default: 0.3 },
    {
      key: "wall",
      label: "Film sharpness",
      min: 0.15,
      max: 20,
      step: 0.1,
      default: 3,
    },
    {
      key: "stepScale",
      label: "Step scale",
      min: 0.015,
      max: 1.5,
      step: 0.01,
      default: 0.2,
    },
    {
      key: "hueScale",
      label: "Hue banding",
      min: 0,
      max: 3,
      step: 0.015,
      default: 0.85,
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
      default: 1,
    },
    {
      key: "fill",
      label: "Body fill",
      min: 0,
      max: 100,
      step: 0.3,
      default: 0.4,
    },
    {
      key: "stepClamp",
      label: "Step clamp",
      min: 0.3,
      max: 300,
      step: 1.5,
      default: 20,
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
      max: 1500,
      step: 10,
      default: 22,
    },
    {
      key: "contrast",
      label: "Contrast",
      min: 0.15,
      max: 15,
      step: 0.1,
      default: 1.15,
    },
    {
      key: "saturation",
      label: "Saturation",
      min: 0,
      max: 4,
      step: 0.02,
      default: 1.55,
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
  statePresets: {
    idle: {
      speed: 0.5,
      flow: 3,
      foam: 0.3,
      exposure: 22,
      scatter: 0.01,
      alphaGain: 2,
    },
    thinking: {
      speed: 0.6,
      flow: 3.3,
      foam: 0.33,
      exposure: 21,
      scatter: 0.0095,
      alphaGain: 2.1,
    },
    // loudest: full rush, thick foam, hot film
    speaking: {
      speed: 1,
      flow: 5.5,
      foam: 0.45,
      exposure: 16,
      scatter: 0.0075,
      alphaGain: 2.5,
    },
  },
};

export type Orb20Props = Omit<ShaderOrbProps, "variant">;

export function Orb20({ size = 280, ...rest }: Orb20Props) {
  return <ShaderOrb variant={orb20Orb} size={size} {...rest} />;
}

export default Orb20;

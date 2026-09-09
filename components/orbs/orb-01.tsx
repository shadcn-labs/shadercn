"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const DISPERSION_FRAG = `
const STEPS: i32 = 60;
const TURB: i32 = 5;
const AA: i32 = 1;
// Volume-reactive values, resolved once per fragment in main().
var<private> dispersionTurb: f32;
var<private> dispersionExposure: f32;

fn rot2(a: f32) -> mat2x2f {
  var c: f32 =cos(a);
  var s: f32 =sin(a);
  return mat2x2f(vec2f(c, -s), vec2f(s, c));
}

fn dispersionRender(fragCoord: vec2f) -> vec3f {
  var animTime: f32 =uP_speed; // integrated clock: turbulence + sheet drift
  var spinAng: f32 =uP_spin;   // integrated clock: prism precession

  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var ro: vec3f = vec3f(0.0, 0.0, uP_camDist);
  var rd: vec3f = normalize(vec3f(uv, -uP_focal));

  var acc: vec3f = vec3f(0.0);

  // transmittance carried front-to-back, as in orb-21 and the README's
  // diffusion note — near sheets veil far ones, which is where the depth
  // read comes from
  var T: f32 =1.0;

  /*
    March only the span that can contribute. The tube is infinite, so a ray
    grazing its wall far in FRONT of the ball would otherwise stall there —
    small d, step after step — and exhaust STEPS before ever reaching the
    envelope, leaving a dark notch across the orb. Start at the envelope's
    near edge and break past its far edge; all 60 steps land where the
    envelope is non-zero.
  */
  var z: f32 =max(uP_camDist - uP_envRadius * 1.3, 0.0);
  var zEnd: f32 =uP_camDist + uP_envRadius * 1.3;

  for (var it: i32 =0; it < STEPS; it = it + 1) {
    var p: vec3f = ro + rd * z;

    // orient the prism: static tilt about x, then precession about y from
    // the spin clock. Real rotations — see the header note.
    var q: vec3f = p;
    let spun = rot2(spinAng) * vec2f(q.x, q.z);
    q.x = spun.x;
    q.z = spun.y;
    let tilted = rot2(uP_tilt) * vec2f(q.y, q.z);
    q.y = tilted.x;
    q.z = tilted.y;

    // turbulence in the prism's rotating frame; the +f32(it) offset is the
    // original's +i, decorrelating octaves per step for a smoky depth
    var a: vec3f = q;
    for (var j: i32 =0; j < TURB; j = j + 1) {
      var dj: f32 =f32(j) + 3.0;
      a -= dispersionTurb * sin(a * dj + animTime + f32(it)).yzx / dj;
    }

    /*
      The orb's own shell, in place of the original's square tube
      (golfed there as max(p=abs(p),p.y).x — just max(|x|,|y|)). Evaluated
      on the WARPED point, so the turbulence shimmers the surface itself
      like an oil film; at turb 0 it is a perfect glass shell. The cos
      sheets fill the interior with the dispersive volume.
    */
    var wall: f32 =abs(length(a) - uP_envRadius);
    var s: f32 =a.z + a.y - animTime;
    var d: f32 =max(wall + abs(cos(s)) / uP_sheets, 1e-4);

    /*
      Per-channel palette: one cosine phase per channel, scaled by uP_disperse
      (0 collapses to monochrome breathing, 1 is the original rainbow). The
      -z term couples depth into the phase, which is what turns the sheets
      into striations; uP_stria scales it.

      The CLAMP is load-bearing, same as the other accumulators here: 1/d
      spikes where a ray grazes the wall exactly where a sheet sits, and one
      unclamped sample would own the whole 60-step sum at some phases.
    */
    var w: vec3f = (cos(s - z * uP_stria + vec3f(0.0, 1.0, 8.0) * uP_disperse) + 1.0) / d;
    w = min(w, vec3f(uP_stepClamp));

    /*
      Envelope: bounds the sheet glow (the cos field lives EVERYWHERE in
      space, not just inside the ball) and adds the uP_fill floor that
      guarantees a body. The outer bound sits 12% PAST the radius on
      purpose: the shell IS the radius now, the silhouette is cut
      analytically in main(), and a hard cut only reads as a sharp edge if
      there is still emission left at the boundary to cut. envCore is where
      the plateau saturates — 1 keeps the shell at full strength, lower
      values pull the brightness into the core.
    */
    var env: f32 =smoothstep(uP_envRadius * 1.12, uP_envRadius * uP_envCore, length(p));
    w = (w + uP_fill) * env;

    acc += T * w;
    T *= exp(-dot(w, vec3f(0.299, 0.587, 0.114)) * uP_scatter);

    z += d;
    if (T < 0.004 || z > zEnd) { break; }
  }

  return acc;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  dispersionTurb = uP_turb * (1.0 + 0.5 * uInput);
  dispersionExposure = uP_exposure * (1.0 - 0.35 * uOutput);

  var acc: vec3f = vec3f(0.0);
  acc = dispersionRender(fragCoord);

  // tanh tone map, as in the original but per channel and with a tunable
  // knee — the envelope and transmittance change the accumulator's scale
  // completely, so the golfed /2e2 constant means nothing here
  var col: vec3f = tanh3(acc / max(dispersionExposure, 1.0));
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  // saturation about luminance, then the tint
  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a saturated violet
  // fringe has low luminance but must not go transparent
  var peak: f32 =max(col.r, max(col.g, col.b));
  var a: f32 =clamp(peak * uP_alphaGain, 0.0, 1.0);

  /*
    Analytic silhouette: the perpendicular distance from the sphere's centre
    to this pixel's ray, against the shell radius. Exact — not a fade of the
    accumulated glow — which is what makes the edge read as cut glass.
    uP_edge trades the transition band: 1 is a couple of pixels, 0 falls
    back to a soft feather. Colour AND alpha, as always.
  */
  var mrd: vec3f = normalize(vec3f(orbUV(), -uP_focal));
  var closest: f32 =length(cross(vec3f(0.0, 0.0, uP_camDist), mrd));
  var band: f32 =mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  var mask: f32 =1.0 - smoothstep(uP_envRadius * (1.0 - band), uP_envRadius * 1.005, closest);
  col *= mask;
  a *= mask;

  // Fade colour as well as alpha — with premultiplied output, fading only
  // alpha leaves the pixel emitting at full brightness up to the cutoff,
  // which reads as a hard rim. With the analytic mask doing the real work
  // this is only a safety taper at the frame boundary.
  var r2d: f32 =length(orbUV());
  var fade: f32 =1.0 - smoothstep(uP_edgeFade, 1.0, r2d);
  col *= fade;
  a *= fade;

  // Emitted light, so rgb is already premultiplied — do NOT scale by alpha
  // again (see the same note in orb-31).
  return vec4f(col, a);
}
`;

export const orb01Orb: OrbVariant = {
  colors: [{ key: "tint", label: "Tint", default: "#ffffff" }],
  frag: DISPERSION_FRAG,
  key: "orb-01",
  label: "ORB-01",
  note: "cut-glass orb with a dispersive, turbulent interior",
  params: [
    {
      key: "speed",
      label: "Anim speed",
      min: 0.015,
      max: 10,
      step: 0.05,
      default: 0.5,
      integrate: true,
    },
    {
      key: "spin",
      label: "Spin rate",
      min: 0,
      max: 5,
      step: 0.03,
      default: 0.25,
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
      label: "Field tilt",
      min: 0,
      max: 4,
      step: 0.02,
      default: 0.5,
    },
    {
      key: "turb",
      label: "Turbulence",
      min: 0,
      max: 5,
      step: 0.03,
      default: 0.3,
    },
    {
      key: "sheets",
      label: "Sheet density",
      min: 1,
      max: 60,
      step: 0.5,
      default: 7,
    },
    {
      key: "disperse",
      label: "Dispersion",
      min: 0,
      max: 5,
      step: 0.03,
      default: 1,
    },
    {
      key: "stria",
      label: "Striation depth",
      min: 0,
      max: 10,
      step: 0.05,
      default: 1,
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
      default: 1.5,
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
      default: 0.02,
    },
    {
      key: "exposure",
      label: "Exposure",
      min: 1.5,
      max: 1500,
      step: 10,
      default: 60,
    },
    {
      key: "contrast",
      label: "Contrast",
      min: 0.15,
      max: 15,
      step: 0.1,
      default: 1,
    },
    {
      key: "saturation",
      label: "Saturation",
      min: 0,
      max: 4,
      step: 0.02,
      default: 1,
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
      spin: 0.25,
      turb: 0.3,
      disperse: 1,
      sheets: 7,
      exposure: 60,
      scatter: 0.02,
      alphaGain: 2,
    },
    thinking: {
      speed: 0.6,
      spin: 0.5,
      turb: 0.35,
      disperse: 1.1,
      sheets: 7,
      exposure: 57,
      scatter: 0.019,
      alphaGain: 2.1,
    },
    // loudest: fast drift, dense sheets, wide rainbow
    speaking: {
      speed: 1.2,
      spin: 0.7,
      turb: 0.55,
      disperse: 1.5,
      sheets: 5.5,
      exposure: 45,
      scatter: 0.015,
      alphaGain: 2.5,
    },
  },
};

export type Orb01Props = Omit<ShaderOrbProps, "variant">;

export function Orb01({ size = 280, ...rest }: Orb01Props) {
  return <ShaderOrb variant={orb01Orb} size={size} {...rest} />;
}

export default Orb01;

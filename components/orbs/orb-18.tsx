"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const OCTANT_FRAG = `
const STEPS: i32 = 50;
const AA: i32 = 1;
// Volume-reactive values, resolved once per fragment in main().
var<private> octantFold: f32;
var<private> octantFreq: f32;
var<private> octantExposure: f32;

fn octantRender(fragCoord: vec2f) -> vec3f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var ro: vec3f = vec3f(0.0, 0.0, uP_camDist);
  var rd: vec3f = normalize(vec3f(uv, -uP_focal));

  var wander: f32 =uP_wander; // integrated clock: the axis, and with it the
                            // mirror planes, tumble

  /*
    The wandering axis. Unit by construction, which is what makes the
    rotation below an exact one — and the three phases are far enough
    apart that the cosines can never null together, so the normalize is
    safe without a guard.
  */
  var axis: vec3f = normalize(cos(wander + vec3f(0.0, 2.0, 4.0)));

  var acc: vec3f = vec3f(0.0);

  // transmittance carried front-to-back — near cells veil far ones
  var T: f32 =1.0;

  // march only the span the envelope can light, as in orb-01
  var z: f32 =max(uP_camDist - uP_envRadius * 1.3, 0.0);
  var zEnd: f32 =uP_camDist + uP_envRadius * 1.3;

  for (var it: i32 =0; it < STEPS; it = it + 1) {
    var p: vec3f = ro + rd * z;

    // the exact minus-90-degree rotation about the wandering axis
    var a: vec3f = dot(axis, p) * axis - cross(axis, p);

    /*
      The two folds, both blendable. uP_fold reflects the octants together
      and uP_crease creases the diagonals; at zero the crystal dissolves
      back into an ordinary periodic field, which is worth being able to
      see, because the symmetry is doing more work here than the field is.
    */
    a = mix(a, abs(a), octantFold);
    a = mix(a, max(a, a.yzx), uP_crease);

    // step and density in one quantity, as in the listing
    var d: f32 =uP_stepScale * length(cos(a * octantFreq));
    d = max(d, uP_envRadius * 0.004);

    /*
      Depth as hue, near as bright.

      The hue is keyed to depth measured from where the envelope BEGINS,
      not from the camera. The listing marches from the lens out to twenty
      units and cycles its ramp several times over that; bounded to the
      ball, the same .2 slope covers barely a quarter turn of the wheel —
      and the quarter it covers has both green and blue sitting at the
      bottom of their cosines, so the first build of this orb came out a
      flat dark red. Anchored to the ball, the ramp spans it, and moving
      the camera no longer repaints the crystal.

      No step-length weighting here, unlike orb-nova and against the
      README's usual rule — because 1/d IS this shader's density, not an
      artefact of sphere tracing. Multiply it by the step and the two
      cancel exactly, leaving a flat sum with every trace of the cell walls
      gone. The clamp does the job the step weight would have, which is
      also what orb-22 does with the same construction.
    */
    var zRel: f32 =z - (uP_camDist - uP_envRadius);
    var w: vec3f = cos(uP_hue * zRel + vec3f(0.0, 2.0, 3.0) * uP_spread) + 1.0;
    w /= d * max(z, 0.05);
    w = min(w, vec3f(uP_stepClamp));

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
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
  octantFold = clamp(uP_fold * (1.0 + 0.3 * uInput), 0.0, 1.0);
  octantFreq = uP_freq * (1.0 + 0.25 * uInput);
  octantExposure = uP_exposure * (1.0 - 0.35 * uOutput);

  var acc: vec3f = vec3f(0.0);
  acc = octantRender(fragCoord);

  // tanh tone map per channel — the envelope and transmittance change the
  // accumulator's scale, so the golfed /1e2 knee is a tunable here
  var col: vec3f = tanh3(acc / max(octantExposure, 0.01));
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  // saturation about luminance, then the tint
  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a deep blue cell
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

export const orb18Orb: OrbVariant = {
  colors: [{ default: "#ffffff", key: "tint", label: "Tint" }],
  frag: OCTANT_FRAG,
  key: "orb-18",
  label: "ORB-18",
  note: "a crystal folded out of one eighth of space, tumbling",
  params: [
    {
      default: 0.5,
      integrate: true,
      key: "wander",
      label: "Tumble",
      max: 5,
      min: 0,
      step: 0.02,
    },
    {
      default: 4,
      key: "camDist",
      label: "Camera distance",
      max: 50,
      min: 1,
      step: 0.3,
    },
    {
      default: 1.5,
      key: "focal",
      label: "Lens",
      max: 15,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 1,
      key: "fold",
      label: "Octant fold",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 1,
      key: "crease",
      label: "Diagonal crease",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 5,
      key: "freq",
      label: "Crystal frequency",
      max: 20,
      min: 0.1,
      step: 0.05,
    },
    {
      default: 0.3,
      key: "stepScale",
      label: "Step scale",
      max: 2,
      min: 0.02,
      step: 0.01,
    },
    {
      default: 1.5,
      key: "hue",
      label: "Depth hue",
      max: 4,
      min: 0,
      step: 0.01,
    },
    {
      default: 1,
      key: "spread",
      label: "Colour spread",
      max: 3,
      min: 0,
      step: 0.02,
    },
    {
      default: 2.1,
      key: "envRadius",
      label: "Envelope radius",
      max: 15,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 0.9,
      key: "envCore",
      label: "Envelope core",
      max: 1.02,
      min: 0.3,
      step: 0.01,
    },
    {
      default: 0.02,
      key: "fill",
      label: "Body fill",
      max: 20,
      min: 0,
      step: 0.01,
    },
    {
      default: 40,
      key: "stepClamp",
      label: "Step clamp",
      max: 2000,
      min: 1,
      step: 1,
    },
    {
      default: 0.004,
      key: "scatter",
      label: "Diffusion",
      max: 0.2,
      min: 0,
      step: 0.001,
    },
    {
      default: 18,
      key: "exposure",
      label: "Exposure",
      max: 500,
      min: 0.2,
      step: 0.5,
    },
    {
      default: 1.2,
      key: "contrast",
      label: "Contrast",
      max: 15,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 1.25,
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
  // the depth ramp supplies the colour, so the tint only shifts its
  // temperature: neutral at rest, cooled while searching, warmed while
  // answering
  stateColors: {
    idle: { tint: "#ffffff" },
    speaking: { tint: "#ffc492" },
    thinking: { tint: "#9db8ff" },
  },
  /*
    Staged on the two folds, which is the only orb here where SYMMETRY is
    the mood: a crystal at rest, the mirrors relaxing open while it works,
    and locked hard shut while it answers. The tumble carries the tempo.
  */
  statePresets: {
    idle: {
      alphaGain: 2,
      crease: 1,
      exposure: 18,
      fold: 1,
      freq: 5,
      scatter: 0.004,
      wander: 0.5,
    },
    speaking: {
      alphaGain: 2.7,
      crease: 1,
      envCore: 0.49,
      exposure: 8,
      fold: 1,
      freq: 6.05,
      hue: 2,
      saturation: 2,
      scatter: 0.002,
      stepScale: 0.51,
      wander: 0.7,
    },
    thinking: {
      alphaGain: 2,
      crease: 1,
      exposure: 26,
      focal: 2.7,
      fold: 0.91,
      freq: 4.1,
      scatter: 0.02,
      stepClamp: 1200,
      wander: 1.08,
    },
  },
};

export type Orb18Props = Omit<ShaderOrbProps, "variant">;

export const Orb18 = ({ size = 280, ...rest }: Orb18Props) => (
  <ShaderOrb variant={orb18Orb} size={size} {...rest} />
);

export default Orb18;

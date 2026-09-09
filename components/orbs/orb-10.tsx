"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const WEAVE_FRAG = `
const STEPS: i32 = 40;
const TURB: i32 = 6;
const AA: i32 = 1;
// Volume-reactive values, resolved once per fragment in main().
var<private> weaveTurb: f32;
var<private> weaveCell: f32;
var<private> weaveExposure: f32;

fn weaveRender(fragCoord: vec2f) -> vec3f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var ro: vec3f = vec3f(0.0, 0.0, uP_camDist);
  var rd: vec3f = normalize(vec3f(uv, -uP_focal));

  var animTime: f32 =uP_speed;  // integrated clock: the warp
  var scroll: f32 =uP_scroll;   // integrated clock: the skin climbs

  var acc: vec3f = vec3f(0.0);

  // transmittance carried front-to-back — the near skin veils the far one
  var T: f32 =1.0;

  // march only the span the envelope can light, as in orb-01
  var z: f32 =max(uP_camDist - uP_envRadius * 1.3, 0.0);
  var zEnd: f32 =uP_camDist + uP_envRadius * 1.3;

  for (var it: i32 =0; it < STEPS; it = it + 1) {
    var fi: f32 =f32(it) + 1.0;
    var world: vec3f = ro + rd * z;

    /*
      The unwrap, with the listing's cylinder swapped for the ball: angle
      about the axis, height, and distance from the CENTRE less the shell
      radius. uP_wrap wants to stay a whole number — see the header.
    */
    var rl: f32 =length(world);
    var p: vec3f = vec3f(
      atan2(world.z, world.x) * uP_wrap,
      world.y * uP_climb + scroll,
      rl - uP_shellR
    );

    // six octaves of feedback warp, each march step on its own phase
    for (var j: i32 =0; j < TURB; j = j + 1) {
      var dj: f32 =f32(j) + 1.0;
      p += weaveTurb * sin(p.yzx * dj + animTime + uP_layer * fi) / dj;
    }

    /*
      The lattice. Small only where all three cosines sit at one and the
      sample is on the shell — so the cells of a 3D lattice in unwrapped
      space are cut by the ball's surface, and what is left is a knitted
      skin. uP_cell is the listing's .3: the amplitude of the cosine terms
      against the shell term, and therefore how much the lattice matters
      relative to simply being on the surface.
    */
    var d: f32 =uP_stepScale * length(vec4f(weaveCell * cos(p) - weaveCell, p.z));
    d = max(d, uP_envRadius * 0.004);

    // colour by unwrapped height, with each step offset again
    var w: vec3f = cos(p.y + fi * uP_hueStep + vec3f(6.0, 1.0, 2.0) * uP_spread) + 1.0;
    w /= d;
    w = min(w, vec3f(uP_stepClamp));

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    var env: f32 =smoothstep(uP_envRadius * 1.12, uP_envRadius * uP_envCore, rl);
    w = (w + uP_fill) * env;

    acc += T * w;
    T *= exp(-dot(w, vec3f(0.299, 0.587, 0.114)) * uP_scatter);

    z += d;
    if (T < 0.004 || z > zEnd) { break; }
  }

  return acc;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  weaveTurb = uP_turb * (1.0 + 0.4 * uInput);
  weaveCell = uP_cell * (1.0 + 0.3 * uInput);
  weaveExposure = uP_exposure * (1.0 - 0.3 * uOutput);

  var acc: vec3f = vec3f(0.0);
  acc = weaveRender(fragCoord);

  /*
    The listing's knee is tanh(o*o/6e3) over an unnormalized sum of forty
    steps. Dividing by the step count first pulls the square's scale down
    by forty squared, so the same knee lands near four — a number that fits
    on a slider. The square is a contrast squarer, not a tone map.
  */
  var v: vec3f = acc / f32(STEPS);
  var col: vec3f = tanh3(v * v / max(weaveExposure, 0.0001));
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  // saturation about luminance, then the tint
  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a deep blue thread
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

export const orb10Orb: OrbVariant = {
  colors: [{ default: "#ffffff", key: "tint", label: "Tint" }],
  frag: WEAVE_FRAG,
  key: "orb-10",
  label: "ORB-10",
  note: "a lattice of light knitted into the ball's own skin",
  params: [
    {
      default: 0.6,
      integrate: true,
      key: "speed",
      label: "Anim speed",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 1.2,
      integrate: true,
      key: "scroll",
      label: "Climb",
      max: 8,
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
    { default: 2, key: "focal", label: "Lens", max: 15, min: 0.15, step: 0.05 },
    {
      default: 2.6,
      key: "shellR",
      label: "Shell radius",
      max: 20,
      min: 0.2,
      step: 0.1,
    },
    {
      default: 8,
      key: "wrap",
      label: "Wraps around",
      max: 14,
      min: 1,
      step: 1,
    },
    {
      default: 4,
      key: "climb",
      label: "Band spacing",
      max: 12,
      min: 0.05,
      step: 0.05,
    },
    { default: 0.35, key: "turb", label: "Warp", max: 3, min: 0, step: 0.02 },
    {
      default: 0.5,
      key: "layer",
      label: "Layer offset",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.45,
      key: "cell",
      label: "Lattice weight",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.15,
      key: "stepScale",
      label: "Step scale",
      max: 3,
      min: 0.02,
      step: 0.005,
    },
    {
      default: 0.4,
      key: "hueStep",
      label: "Layer hue",
      max: 3,
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
      default: 2.9,
      key: "envRadius",
      label: "Envelope radius",
      max: 20,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 0.92,
      key: "envCore",
      label: "Envelope core",
      max: 1.02,
      min: 0.3,
      step: 0.01,
    },
    {
      default: 0.1,
      key: "fill",
      label: "Body fill",
      max: 40,
      min: 0,
      step: 0.05,
    },
    {
      default: 300,
      key: "stepClamp",
      label: "Step clamp",
      max: 5000,
      min: 5,
      step: 5,
    },
    {
      default: 0.004,
      key: "scatter",
      label: "Diffusion",
      max: 0.2,
      min: 0,
      step: 0.0005,
    },
    {
      default: 30,
      key: "exposure",
      label: "Exposure",
      max: 500,
      min: 0.05,
      step: 0.5,
    },
    {
      default: 1.15,
      key: "contrast",
      label: "Contrast",
      max: 15,
      min: 0.15,
      step: 0.05,
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
  stateColors: {
    idle: { tint: "#ffffff" },
    speaking: { tint: "#ffc492" },
    thinking: { tint: "#e8f4ff" },
  },

  statePresets: {
    idle: {
      alphaGain: 2,
      cell: 0.45,
      exposure: 30,
      scatter: 0.004,
      scroll: 1.2,
      speed: 0.6,
      turb: 0.35,
    },
    speaking: {
      alphaGain: 2.8,
      cell: 0.95,
      contrast: 0.9,
      exposure: 11,
      saturation: 1.45,
      scatter: 0.0015,
      scroll: 4.2,
      speed: 1,
      turb: 0.18,
    },
    thinking: {
      alphaGain: 2.6,
      cell: 0.3,
      contrast: 1.05,
      exposure: 13,
      fill: 0.12,
      layer: 0.65,
      saturation: 1.7,
      scatter: 0.006,
      scroll: 0.5,
      speed: 1.9,
      spread: 1.55,
      stepScale: 0.09,
      turb: 0.85,
    },
  },
};

export type Orb10Props = Omit<ShaderOrbProps, "variant">;

export const Orb10 = ({ size = 280, ...rest }: Orb10Props) => (
  <ShaderOrb variant={orb10Orb} size={size} {...rest} />
);

export default Orb10;

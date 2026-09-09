"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const GEODE_FRAG = `
const STEPS: i32 = 50;
const TURB: i32 = 6;
const AA: i32 = 1;
// Volume-reactive values, resolved once per fragment in main().
var<private> geodeTurb: f32;
var<private> geodeWidth: f32;
var<private> geodeExposure: f32;

// GLSL ES 1.0 has no round() — it arrived in ES 3.0. The listing quantizes
// with it, so it ships here.
fn roundv(x: vec3f) -> vec3f { return floor(x + 0.5); }

fn geodeRender(fragCoord: vec2f) -> vec3f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var ro: vec3f = vec3f(0.0, 0.0, uP_camDist);
  var rd: vec3f = normalize(vec3f(uv, -uP_focal));

  var animTime: f32 =uP_speed; // integrated clock
  var shellR: f32 =uP_shellR;
  var pitch: f32 =max(uP_pitch, 0.002);

  // the run-away bound for rays that miss the shell entirely
  var zEnd: f32 =uP_camDist + shellR * 2.5;

  var acc: vec3f = vec3f(0.0);

  // The listing starts its march at the camera and lets the trace do the
  // travelling — see the header. z is the distance already walked.
  var z: f32 =0.0;

  for (var it: i32 =0; it < STEPS; it = it + 1) {
    var p: vec3f = ro + rd * z;

    /*
      Six octaves on ONE lattice. The pitch never changes; only the phase
      multiplier does, so the displacement is piecewise constant on a
      single grid and the shell facets at one scale.
    */
    for (var j: i32 =0; j < TURB; j = j + 1) {
      var f: f32 =f32(j) + 2.0;
      p += geodeTurb * sin(roundv(p.zxy / pitch) * pitch * f - animTime) / f;
    }

    /*
      Sphere trace toward the shell, on the WARPED point — so the facets
      are what the ray is chasing, not a smooth ball underneath them. The
      slack is the listing's tenth, and the floor is the surface width.
    */
    var d: f32 =geodeWidth + uP_slack * abs(length(p) - shellR);

    z += d;

    /*
      Position as colour, washing toward white with depth. Guarded on z:
      the listing gets away with reading p/z here because its comma
      operator advances z first, which is worth knowing before anyone
      reorders these two lines.
    */
    acc += (p * uP_hueGain / max(z, 1e-3) + uP_floorLevel) / d;

    if (z > zEnd) { break; }
  }

  return acc;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  geodeTurb = uP_turb * (1.0 + 0.5 * uInput);
  geodeWidth = max(uP_width * (1.0 - 0.4 * uOutput), 0.0002);
  geodeExposure = uP_exposure * (1.0 - 0.3 * uOutput);

  var acc: vec3f = vec3f(0.0);
  acc = geodeRender(fragCoord);

  // tanh tone map per channel — the golfed /2e3 knee is a tunable here
  var col: vec3f = tanh3(acc / max(geodeExposure, 1.0));
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  // saturation about luminance, then the tint
  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a deep blue facet
  // has low luminance but must not go transparent
  var peak: f32 =max(col.r, max(col.g, col.b));
  var a: f32 =clamp(peak * uP_alphaGain, 0.0, 1.0);

  /*
    Analytic silhouette against the shell, widened by uP_envScale because
    the turbulence pushes the visible surface OUT past the nominal radius —
    cut at the bare radius and the facets would be shaved flat all round
    the limb.
  */
  var mrd: vec3f = normalize(vec3f(orbUV(), -uP_focal));
  var closest: f32 =length(cross(vec3f(0.0, 0.0, uP_camDist), mrd));
  var sil: f32 =uP_shellR * uP_envScale;
  var band: f32 =mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  var mask: f32 =1.0 - smoothstep(sil * (1.0 - band), sil * 1.005, closest);
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

export const orb04Orb: OrbVariant = {
  colors: [{ default: "#ffffff", key: "tint", label: "Tint" }],
  frag: GEODE_FRAG,
  key: "orb-04",
  label: "ORB-04",
  note: "a hollow shell of light, faceted by a voxel lattice",
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
      default: 9,
      key: "camDist",
      label: "Camera distance",
      max: 60,
      min: 1,
      step: 0.3,
    },
    {
      default: 1.35,
      key: "focal",
      label: "Lens",
      max: 15,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 5,
      key: "shellR",
      label: "Shell radius",
      max: 20,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.3,
      key: "pitch",
      label: "Facet size",
      max: 1.5,
      min: 0.005,
      step: 0.005,
    },
    {
      default: 0.45,
      key: "turb",
      label: "Displacement",
      max: 5,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.1,
      key: "slack",
      label: "Trace slack",
      max: 0.9,
      min: 0.01,
      step: 0.005,
    },
    {
      default: 0.003,
      key: "width",
      label: "Surface width",
      max: 0.3,
      min: 0.0005,
      step: 0.0005,
    },
    {
      default: 1,
      key: "hueGain",
      label: "Position hue",
      max: 6,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.8,
      key: "floorLevel",
      label: "White floor",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 1.16,
      key: "envScale",
      label: "Silhouette margin",
      max: 2,
      min: 1,
      step: 0.01,
    },
    {
      default: 3000,
      key: "exposure",
      label: "Exposure",
      max: 40_000,
      min: 20,
      step: 20,
    },
    {
      default: 1.3,
      key: "contrast",
      label: "Contrast",
      max: 15,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 1.3,
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
  // the position ramp supplies the colour, so the tint only shifts its
  // temperature: neutral at rest and cool for both of the busy states —
  // blue while searching, a brighter cyan while answering
  stateColors: {
    idle: { tint: "#ffffff" },
    speaking: { tint: "#94f3ff" },
    thinking: { tint: "#9db8ff" },
  },
  /*
    Staged on displacement — how far the lattice pushes the shell out of
    round — and on surface width, which is the only material control this
    shader has.

    FACET SIZE was held still across all three for a reason: it is a
    quantizer, and a gliding quantizer pops instead of fading (the same rule
    as orb-14's cell grid and orb-17's grain). Answering now moves it, 0.3
    to 0.22, so the lattice re-snaps through the half second either side of
    that state rather than cross-fading. Deliberate — see the note there.
  */
  statePresets: {
    idle: {
      contrast: 1.3,
      exposure: 3000,
      hueGain: 1,
      slack: 0.1,
      speed: 0.6,
      turb: 0.45,
      width: 0.003,
    },
    speaking: {
      contrast: 0.92,
      envScale: 1.67,
      exposure: 1220,
      floorLevel: 0.82,
      hueGain: 0.5,
      pitch: 0.22,
      saturation: 1.66,
      slack: 0.165,
      speed: 2,
      turb: 0.8,
      width: 0.032,
    },
    thinking: {
      contrast: 1.75,
      exposure: 4800,
      hueGain: 1.7,
      slack: 0.07,
      speed: 1.8,
      turb: 0.85,
      width: 0.0012,
    },
  },
};

export type Orb04Props = Omit<ShaderOrbProps, "variant">;

export const Orb04 = ({ size = 280, ...rest }: Orb04Props) => (
  <ShaderOrb variant={orb04Orb} size={size} {...rest} />
);

export default Orb04;

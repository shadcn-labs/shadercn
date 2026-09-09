"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const IRIS_FRAG = `
const RINGS: i32 = 10;
const TURB: i32 = 9;
const AA: i32 = 2;
// Volume-reactive values, resolved once per fragment in main().
var<private> irisWarp: f32;
var<private> irisGlow: f32;
var<private> irisFringe: f32;

fn irisRender(fragCoord: vec2f) -> vec3f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var R: f32 =max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  var pl: vec2f = uv / R;
  var z: f32 =sqrt(max(1.0 - dot(pl, pl), 0.0));
  var n: vec3f = vec3f(pl, z);

  var t: f32 =uP_speed; // integrated clock

  // tilt about X, then roll about Y on its own integrated clock
  var ct: f32 =cos(uP_tilt);
  var st: f32 =sin(uP_tilt);
  var sp: vec3f = vec3f(n.x, n.y * ct - n.z * st, n.y * st + n.z * ct);
  var cr: f32 =cos(uP_spin);
  var sr: f32 =sin(uP_spin);
  sp = vec3f(sp.x * cr - sp.z * sr, sp.y, sp.x * sr + sp.z * cr);

  /*
    Radius becomes the polar angle from the dome's axis (see the header),
    so ring i lands on the latitude at angle i / uP_scale and the rings
    crowd toward the limb the way a globe's latitudes do. acos is defined
    on the whole sphere, so the roll above can put the axis anywhere —
    including behind the visible face, which sweeps the outer rings into
    view over the limb.
  */
  var pol: f32 =acos(clamp(sp.z, -1.0, 1.0));
  var dir: vec2f = sp.xy / max(length(sp.xy), 1e-4);
  var p: vec2f = dir * pol * uP_scale;

  var acc: vec3f = vec3f(0.0);

  for (var ri: i32 =0; ri < RINGS; ri = ri + 1) {
    var i: f32 =f32(ri) + 1.0;

    /*
      Each ring re-warps the ORIGINAL point with its own seed, exactly as
      the listing does — this loop is why the rings tear differently
      instead of nesting like tree rings.
    */
    var v: vec2f = p;
    for (var j: i32 =0; j < TURB; j = j + 1) {
      var f: f32 =f32(j) + 1.0;
      v += irisWarp * sin(ceil(v * f + i * uP_seed) - t * 0.5) / f;
    }

    var l: f32 =length(v) - i;

    // the asymmetric absolute value, with the floor doubling as the line
    // width — a wider floor is a fatter, softer wavefront
    var side: f32 =max(max(l, -uP_inner * l), uP_lineSoft);

    /*
      The hue sweep, softened. l/(l*l+g) tracks 1/l off the ring and rolls
      over to a finite peak on it, so the rainbow compresses into a fringe
      of finite width instead of an aliased band.
    */
    var fr: f32 =irisFringe * l / (l * l + uP_fringeSoft);
    var hue: vec3f = cos(t - i * uP_ringPhase + fr + vec3f(0.0, 1.0, 2.0)) + 1.1;

    acc += (irisGlow / side) * hue;
  }

  // the listing's tanh knee, with the divisor exposed
  var col: vec3f = tanh3(acc / max(uP_exposure, 0.001));
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  // saturation about luminance, then the tint
  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  // dome shading keeps the ball a ball under the rings — gentler than the
  // sibling orbs use, because these rings are emission and a hard lambert
  // reads as a shadow thrown across a light source
  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.72))), 0.0, 1.0);
  col *= 0.55 + uP_light * lambert;

  var fres: f32 =1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: the user's voice tears the rings harder, the agent's
  // brightens them and opens the rainbow fringe.
  irisWarp = uP_warp * (1.0 + 0.5 * uInput);
  irisGlow = uP_glow * (0.85 + 0.5 * uOutput);
  irisFringe = uP_fringe * (1.0 + 0.6 * uOutput);

  // the mask uses the orb-space uv handed in by the entry point
  var mask: f32 =smoothstep(0.012, -0.012, length(uv) - max(uP_radius, 0.001));

  // Ninety sines per sample before supersampling — none of them worth
  // paying for outside the silhouette.
  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  var col: vec3f = vec3f(0.0);
  col = irisRender(fragCoord);

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(max(col, vec3f(0.0)) * a, a);
}
`;

export const orb09Orb: OrbVariant = {
  colors: [
    { default: "#ffffff", key: "tint", label: "Tint" },
    { default: "#b9d6ff", key: "sheen", label: "Sheen" },
  ],
  frag: IRIS_FRAG,
  key: "orb-09",
  label: "ORB-09",
  note: "torn rings of rainbow light worn as the ball's latitudes",
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
      default: 0.12,
      integrate: true,
      key: "spin",
      label: "Roll",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.4,
      key: "tilt",
      label: "Tilt",
      max: 1.5,
      min: -1.5,
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
      default: 3.5,
      key: "scale",
      label: "Ring spacing",
      max: 20,
      min: 0.3,
      step: 0.1,
    },
    { default: 0.45, key: "warp", label: "Tear", max: 3, min: 0, step: 0.02 },
    {
      default: 0.9,
      key: "seed",
      label: "Ring seed",
      max: 3,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.05,
      key: "glow",
      label: "Ring glow",
      max: 1,
      min: 0,
      step: 0.002,
    },
    {
      default: 0.05,
      key: "lineSoft",
      label: "Ring width",
      max: 1,
      min: 0.002,
      step: 0.002,
    },
    {
      default: 3,
      key: "inner",
      label: "Inner falloff",
      max: 12,
      min: 0.2,
      step: 0.05,
    },
    {
      default: 0.1,
      key: "fringe",
      label: "Rainbow fringe",
      max: 2,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.003,
      key: "fringeSoft",
      label: "Fringe width",
      max: 1,
      min: 0.001,
      step: 0.001,
    },
    {
      default: 0.8,
      key: "ringPhase",
      label: "Ring hue step",
      max: 3,
      min: 0,
      step: 0.01,
    },
    {
      default: 1.1,
      key: "exposure",
      label: "Exposure",
      max: 20,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1.1,
      key: "contrast",
      label: "Contrast",
      max: 10,
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
      default: 0.5,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.4,
      key: "rim",
      label: "Rim sheen",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  stateColors: {
    idle: { sheen: "#b9d6ff", tint: "#ffffff" },
    speaking: { sheen: "#ffb277", tint: "#ffc492" },
    thinking: { sheen: "#7ba6ff", tint: "#9db8ff" },
  },

  statePresets: {
    idle: {
      contrast: 1.15,
      exposure: 1.1,
      fringe: 0.1,
      glow: 0.05,
      lineSoft: 0.05,
      speed: 0.6,
      spin: 0.12,
      warp: 0.45,
    },
    speaking: {
      contrast: 0.85,
      exposure: 0.68,
      fringe: 0.81,
      fringeSoft: 0.058,
      glow: 0.04,
      light: 0.99,
      lineSoft: 0.22,
      rim: 0.015,
      ringPhase: 1.03,
      seed: 1.02,
      speed: 4.7,
      spin: 0.34,
      warp: 0.22,
    },
    thinking: {
      contrast: 1.15,
      exposure: 1.75,
      fringe: 0.96,
      fringeSoft: 0.854,
      glow: 0.2,
      light: 1.035,
      lineSoft: 0.152,
      rim: 0.66,
      ringPhase: 2.53,
      saturation: 2.22,
      warp: 2.54,
    },
  },
};

export type Orb09Props = Omit<ShaderOrbProps, "variant">;

export const Orb09 = ({ size = 280, ...rest }: Orb09Props) => (
  <ShaderOrb variant={orb09Orb} size={size} {...rest} />
);

export default Orb09;

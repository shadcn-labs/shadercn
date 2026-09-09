"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const NIMBUS_FRAG = `
const STEPS: i32 = 56;
const LIGHT_STEPS: i32 = 4;
const DENSITY_OCT: i32 = 4;
const AA: i32 = 1;
const PI: f32 = 3.14159265359;

// Volume-reactive values, resolved once per fragment in main().
var<private> nimbusPower: f32;
var<private> nimbusDensity: f32;

/*
  Density inside the sphere.

  The radial term falls to zero at the boundary, which both bounds the volume
  and gives the soft edge for free. The cos-warp folds the sample point a few
  times — the same cheap turbulence the other orbs use — and the threshold
  carves that into clumps rather than an even fog.
*/
fn density(p: vec3f, animTime: f32) -> f32 {
  var shell: f32 =1.0 - length(p) / uP_radius;
  if (shell <= 0.0) { return 0.0; }

  var q: vec3f = p * uP_scale;
  var f: f32 =1.0;
  for (var k: i32 =0; k < DENSITY_OCT; k = k + 1) {
    q += cos(q.yzx * f + animTime * uP_churn) / f;
    f *= 1.8;
  }

  var n: f32 =(sin(q.x) + sin(q.y) + sin(q.z)) / 3.0 * 0.5 + 0.5;
  // smoothstep against the threshold is the clump control: high threshold
  // leaves sparse wisps, low fills the sphere with even fog
  var clump: f32 =smoothstep(uP_threshold, 1.0, n);
  return clump * pow(shell, uP_edgeSoft) * nimbusDensity;
}

/*
  Henyey-Greenstein: g > 0 biases scattering forward, which is what gives the
  bloom on the limb facing the light.

  The physical form carries a 1/(4*PI) normalisation. It is dropped here and
  folded into uP_power instead — kept in, the whole term sits around 0.02 and
  the orb renders black unless power is pushed into the hundreds, which makes
  the slider useless.
*/
fn phaseHG(c: f32, g: f32) -> f32 {
  var g2: f32 =g * g;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 0.0001), 1.5);
}

fn nimbusRender(fragCoord: vec2f) -> vec4f {
  var animTime: f32 =uP_speed; // integrated clock

  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var ro: vec3f = vec3f(0.0, 0.0, -uP_camDist);
  var rd: vec3f = normalize(vec3f(uv, uP_focal));

  /*
    Light direction, slowly orbiting so the shading is never static.

    The z term is kept POSITIVE — the camera looks along +z, so a light also
    pointing along +z sits behind the cloud. That is the back-lit case, where
    dot(rd, L) approaches 1 and the forward-scattering phase blooms. Put the
    light on the camera's side instead and every ray samples the phase function
    on its back-scatter tail, where it is roughly ten times smaller, and the orb
    goes muddy.
  */
  var L: vec3f = normalize(vec3f(
    cos(animTime * uP_lightSpin) * 0.7,
    0.45,
    sin(animTime * uP_lightSpin) * 0.35 + 0.65
  ));

  var phase: f32 =phaseHG(dot(rd, L), uP_aniso);

  // Start the march at the sphere's front face instead of the camera — every
  // step before that contributes nothing, and at 56 steps they are expensive.
  var toCentre: f32 =uP_camDist;
  var tStart: f32 =max(toCentre - uP_radius, 0.0);
  var span: f32 =2.0 * uP_radius;
  var dt: f32 =span / f32(STEPS);

  var T: f32 =1.0;
  var scattered: vec3f = vec3f(0.0);

  for (var i: i32 =0; i < STEPS; i = i + 1) {
    var t: f32 =tStart + (f32(i) + 0.5) * dt;
    var p: vec3f = ro + rd * t;

    var dn: f32 =density(p, animTime);
    if (dn > 0.001) {
      // short march toward the light for self-shadowing
      var shadow: f32 =1.0;
      var lstep: f32 =uP_radius / f32(LIGHT_STEPS);
      for (var k: i32 =1; k <= LIGHT_STEPS; k = k + 1) {
        var lp: vec3f = p + L * (f32(k) - 0.5) * lstep;
        shadow *= exp(-density(lp, animTime) * lstep * uP_shadowAbsorb);
      }

      /*
        In-scattered light: warm where lit, cool where the volume shadows
        itself.

        The shadow term appears ONCE, inside the mix. Multiplying by it again
        as a factor — the obvious-looking thing to write — scales the shadowed
        end of the mix toward zero, so the cool colour is always multiplied
        away and the cloud comes out monochrome beige however it is tinted.
        uP_shadowLift is how much light still reaches the shadowed side.
      */
      var lit: vec3f = mix(uC_shadow * uP_shadowLift, uC_light, shadow);
      scattered += T * dn * dt * lit * phase * nimbusPower;

      T *= exp(-dn * dt * uP_absorb);
      if (T < 0.01) { break; }
    }
  }

  // a soft ambient body so the unlit side is not pure black
  var body: f32 =1.0 - T;
  scattered += uC_shadow * body * uP_ambient;

  return vec4f(scattered, body);
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  /*
    Agent output turns the light up; user input thickens the cloud. Both are
    AMPLITUDES. Churn is deliberately NOT volume-scaled: it multiplies the
    accumulated clock into a phase (animTime * churn), so scaling it by the
    live volume would turn every volume wobble into a phase jump the size of
    the whole clock — the cloud scrambles chaotically on each state change
    instead of gliding, and gets worse the longer the page is open.
  */
  nimbusPower = uP_power * (0.7 + 0.9 * uOutput);
  nimbusDensity = uP_density * (1.0 + 0.35 * uInput);

  var acc: vec4f = vec4f(0.0);
  acc = nimbusRender(fragCoord);

  var col: vec3f = tanh3(acc.rgb * uP_exposure);
  var a: f32 =clamp(acc.a * uP_alphaGain, 0.0, 1.0);

  // Emitted/scattered light, so rgb is already premultiplied — do NOT multiply
  // by alpha again (see the same note in orb-31).
  return vec4f(col, a);
}
`;

export const orb21Orb: OrbVariant = {
  /*
   * The engine uploads these as uC_<key> vec3 uniforms. Warm light against a
   * cool shadow is what reads as depth — a single-hue cloud looks flat however
   * well it is shadowed.
   */
  colors: [
    { default: "#ffd7a3", key: "light", label: "Light" },
    { default: "#3a4a8c", key: "shadow", label: "Shadow" },
  ],
  frag: NIMBUS_FRAG,
  key: "orb-21",
  label: "ORB-21",
  note: "light diffusing through a cloud",
  params: [
    {
      default: 10,
      integrate: true,
      key: "speed",
      label: "Anim speed",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 4.4,
      key: "camDist",
      label: "Camera distance",
      max: 40,
      min: 0.5,
      step: 0.2,
    },
    { default: 1.8, key: "focal", label: "Lens", max: 15, min: 0.3, step: 0.1 },
    {
      default: 2,
      key: "radius",
      label: "Cloud radius",
      max: 10,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 0.8,
      key: "scale",
      label: "Cloud scale",
      max: 15,
      min: 0.1,
      step: 0.1,
    },
    { default: 0.3, key: "churn", label: "Churn", max: 5, min: 0, step: 0.03 },
    {
      default: 0.075,
      key: "threshold",
      label: "Clumping",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.8,
      key: "edgeSoft",
      label: "Edge softness",
      max: 10,
      min: 0.1,
      step: 0.05,
    },
    {
      default: 3.2,
      key: "density",
      label: "Density",
      max: 20,
      min: 0.03,
      step: 0.1,
    },
    {
      default: 1.4,
      key: "absorb",
      label: "Absorption",
      max: 15,
      min: 0.03,
      step: 0.1,
    },
    {
      default: 2.4,
      key: "shadowAbsorb",
      label: "Shadow depth",
      max: 20,
      min: 0,
      step: 0.1,
    },
    {
      default: 0.55,
      key: "shadowLift",
      label: "Shadow lift",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 0.45,
      key: "aniso",
      label: "Forward scatter",
      max: 0.9,
      min: -0.9,
      step: 0.01,
    },
    {
      default: 0.12,
      key: "lightSpin",
      label: "Light orbit",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 1.9,
      key: "power",
      label: "Light power",
      max: 40,
      min: 0.03,
      step: 0.2,
    },
    {
      default: 0.12,
      key: "ambient",
      label: "Ambient",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 1,
      key: "exposure",
      label: "Exposure",
      max: 10,
      min: 0.03,
      step: 0.05,
    },
    {
      default: 1.5,
      key: "alphaGain",
      label: "Alpha gain",
      max: 10,
      min: 0.05,
      step: 0.05,
    },
  ],
  /*
    The palette carries the rest of the state read: a warm lamp over cool
    shadow at rest, shifting violet while it thinks, and burning hot while
    speaking.
  */
  stateColors: {
    idle: { light: "#ffd7a3", shadow: "#3a4a8c" },
    speaking: { light: "#ffb066", shadow: "#7a2f6e" },
    thinking: { light: "#e6d4ff", shadow: "#3b3f96" },
  },
  statePresets: {
    idle: {
      ambient: 0.12,
      power: 1.9,
      shadowLift: 0.55,
    },
    speaking: {
      ambient: 0.46,
      power: 3.1,
      shadowLift: 0.95,
    },
    thinking: {
      ambient: 0.22,
      power: 2.15,
      shadowLift: 0.65,
    },
  },
};

export type Orb21Props = Omit<ShaderOrbProps, "variant">;

export const Orb21 = ({ size = 280, ...rest }: Orb21Props) => (
  <ShaderOrb variant={orb21Orb} size={size} {...rest} />
);

export default Orb21;

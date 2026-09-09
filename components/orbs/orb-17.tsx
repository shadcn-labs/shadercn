"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const TEMPEST_FRAG = `
const PI: f32 = 3.14159265359;

// Animated white noise, one tap per grain cell per grain frame. The seed
// decorrelates the two taps so field grain and film grain never line up.
fn grainNoise(gpix: vec2f, frame: f32, seed: f32) -> f32 {
  return hash(gpix + vec2f(frame * 13.71 + seed, frame * 7.37 - seed));
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: user input churns the warp harder, agent output
  // brightens the field — the lightning gate opens separately below.
  var warpNow: f32 = uP_warp * (1.0 + 0.55 * uInput);
  var gainNow: f32 = uP_gain * (0.85 + 0.45 * uOutput);

  var rd: f32 = length(uv);
  var R: f32 = uP_radius;
  var mask: f32 = smoothstep(0.012, -0.012, rd - R);

  // The storm below costs five fbm evaluations per fragment — skip all of it
  // outside the silhouette instead of computing weather for transparent sky.
  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  var pl: vec2f = uv / R;
  var r2: f32 =dot(pl, pl);
  var z: f32 =sqrt(max(1.0 - r2, 0.0));
  var n: vec3f = vec3f(pl, z);

  // roll the dome about Y on its own integrated clock
  var cr: f32 =cos(uP_spin);
  var sr: f32 =sin(uP_spin);
  var sp: vec3f = vec3f(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);

  var t: f32 =uP_speed; // integrated clock

  // stereographic wrap: the weather travels around the ball and compresses
  // toward the limb instead of sliding across a flat disc
  var st: vec2f = sp.xy / (1.3 + sp.z) * uP_scale;

  /*
    Jovian band flow: a uniform stream plus a BOUNDED traveling wave of
    shear, so latitude rings appear to slip past each other. The obvious
    construction — t * sin(latitude) — accumulates the differential forever
    and rakes the field into hairline streaks within seconds of the random
    mount phase; the wave form keeps the shear amplitude fixed while its
    phase travels. sp.y is untouched by the Y-roll, so the bands hold
    horizontal while the dome turns underneath them.
  */
  st.x -= t * 0.3;
  st.x += uP_shear * sin(sp.y * uP_bands - t * 0.45);

  // two-level domain warp, the storm-cloud construction: q says where to
  // look, w says where q said to look, the field reads there
  var q: vec2f = vec2f(
    fbm(st + vec2f(0.0, t * 0.35)),
    fbm(st + vec2f(5.2, 1.3) - vec2f(t * 0.28, 0.0))
  );
  var w: vec2f = vec2f(
    fbm(st + warpNow * q + vec2f(1.7, 9.2) + vec2f(t * 0.12, 0.0)),
    fbm(st + warpNow * q + vec2f(8.3, 2.8) - vec2f(0.0, t * 0.1))
  );
  var f: f32 =fbm(st + uP_churn * w);

  /*
    Grain tap 1: speckle folded into the FIELD itself, before the gradient,
    so the colour stops below dither into grain instead of smooth bands.
    Refreshed on the ambient clock — the flicker rate stays constant across
    states on purpose (see the header note).
  */
  var gpix: vec2f = floor(fragCoord / max(uP_grainSize, 1.0));
  var frame: f32 =floor(uTime * 48.0);
  var g1: f32 =grainNoise(gpix, frame, 3.1);
  f += (g1 - 0.5) * uP_grain;

  f = pow(clamp(f * gainNow, 0.0, 1.0), uP_contrast);

  // four-stop palette climbing the storm field
  var col: vec3f = mix(uC_deep, uC_low, smoothstep(0.05, 0.35, f));
  col = mix(col, uC_mid, smoothstep(0.35, 0.62, f));
  col = mix(col, uC_hot, smoothstep(0.62, 0.88, f));

  // iridescent shimmer: a cosine rainbow keyed to the field AND to the warp
  // vector — q varies at storm-cell scale, so the rainbow lands as coherent
  // coloured weather cells instead of hue noise that optically averages to
  // grey — multiplied in so it bends hues without erasing the palette
  var shimmer: vec3f = 0.5 + 0.5 * cos(2.0 * PI * (f * 0.9 + q.x * 1.1 + t * 0.06 + vec3f(0.0, 0.33, 0.67)));
  col = mix(col, col * (0.35 + 1.9 * shimmer), uP_rainbow);

  /*
    Lightning: one hashed gate per flash interval with an exponential decay,
    so most intervals stay dark and some strike. Agent output opens the gate
    — an idle orb flickers occasionally, a speaking one strobes. The strike
    lands hardest on the high-pressure cells of the field.
  */
  var ft: f32 =t * uP_flashRate;
  var gate: f32 =step(1.0 - (0.1 + 0.5 * uOutput), hash(vec2f(floor(ft), 7.7)));
  var flashEnv: f32 =gate * exp(-fract(ft) * 6.0);
  // squared so the strike stays inside the storm cells — a linear weight
  // tints the whole ball and reads as the canvas strobing, not as weather
  var high: f32 =smoothstep(0.55, 0.95, f);
  col += uC_flash * (flashEnv * uP_flash) * (0.06 + 0.94 * high * high);

  // dome shading keeps the ball a ball under the weather
  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.7))), 0.0, 1.0);
  col *= 0.35 + uP_light * lambert;
  var fres: f32 =pow(1.0 - z, 2.5);
  col += uC_flash * uP_rim * fres * (0.4 + 0.35 * flashEnv);

  // grain tap 2: plain film grain over the final colour
  var g2: f32 =grainNoise(gpix, frame, 27.9);
  col *= 1.0 + (g2 - 0.5) * uP_filmGrain;

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(max(col, vec3f(0.0)) * a, a);
}
`;

export const orb17Orb: OrbVariant = {
  /*
   * Five stops: four climbing the storm field plus the lightning colour.
   * The iridescence param multiplies a rainbow over all of them, so the
   * palette here sets the mood and the shimmer supplies the extra hues.
   */
  colors: [
    { default: "#2a0f4e", key: "deep", label: "Deep" },
    { default: "#0fd0c3", key: "low", label: "Low pressure" },
    { default: "#ff5e9d", key: "mid", label: "Mid pressure" },
    { default: "#ffd166", key: "hot", label: "High pressure" },
    { default: "#eaf4ff", key: "flash", label: "Lightning" },
  ],
  frag: TEMPEST_FRAG,
  key: "orb-17",
  label: "ORB-17",
  note: "a grainy many-coloured storm with band shear and lightning",
  params: [
    {
      default: 0.9,
      integrate: true,
      key: "speed",
      label: "Storm speed",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.12,
      integrate: true,
      key: "spin",
      label: "Roll",
      max: 5,
      min: 0,
      step: 0.03,
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
      default: 2.4,
      key: "scale",
      label: "Weather scale",
      max: 12,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 6,
      key: "bands",
      label: "Band count",
      max: 20,
      min: 0,
      step: 0.1,
    },
    {
      default: 1.1,
      key: "shear",
      label: "Band shear",
      max: 5,
      min: 0,
      step: 0.03,
    },
    { default: 2.2, key: "warp", label: "Warp", max: 8, min: 0, step: 0.05 },
    { default: 1.4, key: "churn", label: "Churn", max: 8, min: 0, step: 0.05 },
    {
      default: 1.15,
      key: "gain",
      label: "Brightness",
      max: 5,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1.35,
      key: "contrast",
      label: "Contrast",
      max: 10,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 0.4,
      key: "grain",
      label: "Field grain",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.35,
      key: "filmGrain",
      label: "Film grain",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 2,
      key: "grainSize",
      label: "Grain size",
      max: 8,
      min: 1,
      step: 1,
    },
    {
      default: 0.65,
      key: "rainbow",
      label: "Iridescence",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 1.6,
      key: "flashRate",
      label: "Flash rate",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 1.2,
      key: "flash",
      label: "Flash power",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 0.85,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.5,
      key: "rim",
      label: "Rim light",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  // teal-magenta-amber carnival at rest, cold indigo-cyan while computing,
  // hot magma while answering
  stateColors: {
    idle: {
      deep: "#2a0f4e",
      flash: "#eaf4ff",
      hot: "#ffd166",
      low: "#0fd0c3",
      mid: "#ff5e9d",
    },
    speaking: {
      deep: "#3a0f1e",
      flash: "#fff3e0",
      hot: "#ffd23f",
      low: "#ff6a3d",
      mid: "#ff2e88",
    },
    thinking: {
      deep: "#0d1440",
      flash: "#d5e5ff",
      hot: "#4ce0ff",
      low: "#4c4cf0",
      mid: "#9d4ce0",
    },
  },
  /*
    Staged in the family language. Grain and grain size never move between
    states — grain is a quantizer, and a gliding quantizer pops instead of
    fading (same rule as the dither orb's cell grid).
  */
  statePresets: {
    idle: {
      churn: 1.4,
      contrast: 1.35,
      flash: 0.7,
      gain: 1.15,
      shear: 1.1,
      speed: 0.9,
      warp: 2.2,
    },
    speaking: {
      churn: 1.6,
      contrast: 1.2,
      flash: 2.6,
      gain: 1.45,
      shear: 2.2,
      speed: 1.6,
      warp: 2.6,
    },
    thinking: {
      churn: 2.1,
      contrast: 1.5,
      flash: 0.6,
      gain: 1.05,
      shear: 0.6,
      speed: 2.2,
      warp: 3.4,
    },
  },
};

export type Orb17Props = Omit<ShaderOrbProps, "variant">;

export const Orb17 = ({ size = 280, ...rest }: Orb17Props) => (
  <ShaderOrb variant={orb17Orb} size={size} {...rest} />
);

export default Orb17;

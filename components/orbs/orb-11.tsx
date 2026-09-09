"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const HYDROGEN_FRAG = `
const PI: f32 = 3.14159265359;
fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  var r2d: f32 =length(uv);
  var R: f32 =uP_radius + uP_swell * uInput;
  var mask: f32 =smoothstep(0.012, -0.012, r2d - R);
  var nr: f32 =clamp(r2d / max(R, 0.001), 0.0, 1.0);
  var z: f32 =sqrt(max(1.0 - nr * nr, 0.0));

  // uP_speed and uP_flowSpeed arrive pre-integrated as clocks (see
  // OrbParamDef.integrate), so state transitions stay phase-continuous.
  // The state volumes reshape the orbital itself: the params set the base,
  // input/output excitement bends zoom, radial form, probability and chroma,
  // so each state settles into a different interference pattern.
  var posScale: f32 =uP_posScale * (0.8 + 0.45 * uOutput + 0.2 * uInput);
  var radialPow: f32 =uP_radialPow * (0.7 + 0.8 * uOutput);
  var radialDecay: f32 =uP_radialDecay * (1.25 - 0.5 * uOutput);
  var probPow: f32 =uP_probPow * (1.3 - 0.55 * uOutput);
  var probGain: f32 =uP_probGain * (0.7 + 0.6 * uOutput + 0.5 * uInput);
  var waveFreq: f32 =uP_waveFreq * (0.6 + 1.0 * uOutput);
  var chromaSpread: f32 =uP_chromaSpread * (0.6 + 0.9 * uOutput + 0.5 * uInput);

  // dome point rotated around Y — the fake 3D of the flat disc
  var animTime: f32 =uP_speed; // integrated clock
  var cosT: f32 =cos(animTime * uP_rotSpeed);
  var sinT: f32 =sin(animTime * uP_rotSpeed);
  var sp: vec3f = vec3f(uv / max(R, 0.001), z) * posScale;
  var pos: vec3f = vec3f(sp.x * cosT - sp.z * sinT, sp.y, sp.x * sinT + sp.z * cosT);

  // precession: the rotation axis itself drifts, so the pattern never
  // settles into a repeating spin
  var tilt: f32 =sin(animTime * 0.21 + 1.7) * uP_precess;
  var cx: f32 = cos(tilt);
  var sx: f32 = sin(tilt);
  pos = vec3f(pos.x, pos.y * cx - pos.z * sx, pos.y * sx + pos.z * cx);

  // liquid flow: drifting fbm warps the 3D domain, so the wave function
  // smears and migrates around the sphere instead of wobbling in place.
  // (sampled on pos components — continuous everywhere, no phi seam)
  var flowT: f32 =uP_flowSpeed; // integrated clock
  var fAmp: f32 =uP_flowAmp * (0.7 + 0.6 * uOutput + 0.4 * uInput);
  var w: vec3f;
  w.x = fbm(pos.yz * uP_flowScale + vec2f(flowT * 0.70, -flowT * 0.40));
  w.y = fbm(pos.zx * uP_flowScale + vec2f(-flowT * 0.55, flowT * 0.62) + 3.7);
  w.z = fbm(pos.xy * uP_flowScale + vec2f(flowT * 0.50, flowT * 0.85) + 7.1);
  pos += (w - 0.5) * fAmp;

  var r: f32 =length(pos) + 0.001;
  var theta: f32 =acos(clamp(pos.y / r, -1.0, 1.0));
  var phi: f32 =atan2(pos.z, pos.x);

  var a0: f32 =0.5;
  var rho: f32 =2.0 * r / (5.0 * a0);
  var radial: f32 =pow(rho, radialPow) * exp(-rho / radialDecay);
  var angular: f32 =pow(sin(theta), 3.0) * cos(phi + animTime * 0.2); // single lobe

  var psi: f32 =radial * angular;
  var probability: f32 =psi * psi;

  // travelling spiral wave — the modulation moves across the surface instead
  // of pulsing in place. The azimuthal harmonic count must be a whole number,
  // else sin(phi * f) doesn't line up across the +/-PI wrap and leaves a
  // vertical meridian seam. Snap it to the nearest integer.
  var waveN: f32 =max(1.0, floor(waveFreq + 0.5));
  var wavePhase: f32 =phi * waveN + theta * 2.5 - animTime * 2.0;
  probability *= (0.85 + 0.15 * sin(wavePhase));

  // drifting bright patches, like convection cells wandering the surface
  var patches: f32 =fbm(pos.xy * 1.6 + vec2f(flowT * 0.4, -flowT * 0.3));
  probability *= 0.65 + 0.7 * patches;

  probability = pow(probability, probPow) * probGain;
  probability = clamp(probability, 0.0, 1.0);

  var fresnel: f32 =pow(1.0 - z, 1.5);

  // rainbow chromatic aberration
  var chromaOffset: f32 =phi * 2.0 + theta * 1.5 + animTime * 0.3 + probability * 3.0;
  var rainbow: vec3f;
  rainbow.r = sin(chromaOffset) * 0.5 + 0.5;
  rainbow.g = sin(chromaOffset + chromaSpread) * 0.5 + 0.5;
  rainbow.b = sin(chromaOffset + chromaSpread * 2.0) * 0.5 + 0.5;
  rainbow = normalize(rainbow + 0.01) * length(rainbow);

  var bandFreq: f32 =chromaOffset * 3.0 + fresnel * 2.4;
  var chromaticBands: vec3f;
  chromaticBands.r = sin(bandFreq) * 0.5 + 0.5;
  chromaticBands.g = sin(bandFreq + 2.094) * 0.5 + 0.5;
  chromaticBands.b = sin(bandFreq + 4.189) * 0.5 + 0.5;

  var glowColor: vec3f = mix(rainbow, chromaticBands, 0.12);
  glowColor = pow(glowColor, vec3f(0.8));

  var darkMetal: vec3f = vec3f(uP_metalDark);
  var lightMetal: vec3f = mix(vec3f(0.9, 0.92, 0.95), glowColor, 0.7);

  var metalGradient: f32 =smoothstep(0.0, 1.0, probability * 0.7 + fresnel * 0.3);
  var metalColor: vec3f = mix(darkMetal, lightMetal, metalGradient);

  var orbGlow: f32 =uP_glow + 0.6 * uOutput;
  var totalGlow: f32 =(0.25 + fresnel * 0.6 + probability * 0.8) * orbGlow;
  var glowAmount: f32 =clamp(pow(totalGlow, 0.7), 0.0, 1.0);

  var surfaceColor: vec3f = mix(metalColor, glowColor, glowAmount);

  var normal: vec3f = vec3f(uv / max(R, 0.001), z);
  var specular: f32 =pow(max(dot(normal, normalize(vec3f(1.0, 1.0, 2.0))), 0.0), 32.0);
  surfaceColor += mix(vec3f(1.0), glowColor, 0.6) * specular * 0.4;

  var visibility: f32 =clamp(probability * 1.2 + fresnel * 0.3 + uP_baseVis + uInput * 0.15, 0.0, 1.0);

  var a: f32 =mask * visibility;
  return vec4f(surfaceColor * a, a);
}
`;

export const orb11Orb: OrbVariant = {
  colors: [],
  frag: HYDROGEN_FRAG,
  key: "orb-11",
  label: "ORB-11",
  note: "quantum orbital, rainbow chroma",
  params: [
    {
      default: 0.9,
      integrate: true,
      key: "speed",
      label: "Anim speed",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.5,
      key: "rotSpeed",
      label: "Rotation speed",
      max: 5,
      min: 0,
      step: 0.05,
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
      default: 0.07,
      key: "swell",
      label: "Input swell",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.5,
      key: "posScale",
      label: "Orbital zoom",
      max: 10,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 0.35,
      integrate: true,
      key: "flowSpeed",
      label: "Flow speed",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.45,
      key: "flowAmp",
      label: "Flow amount",
      max: 4,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.3,
      key: "flowScale",
      label: "Flow scale",
      max: 10,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.3,
      key: "precess",
      label: "Precession",
      max: 4,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.5,
      key: "radialPow",
      label: "Radial power",
      max: 15,
      min: 0.5,
      step: 0.1,
    },
    {
      default: 1,
      key: "radialDecay",
      label: "Radial decay",
      max: 30,
      min: 0.3,
      step: 0.15,
    },
    {
      default: 0.4,
      key: "probPow",
      label: "Probability curve",
      max: 3,
      min: 0.1,
      step: 0.015,
    },
    {
      default: 3,
      key: "probGain",
      label: "Probability gain",
      max: 15,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 4,
      key: "waveFreq",
      label: "Wave frequency",
      max: 20,
      min: 0,
      step: 0.5,
    },
    {
      default: 0.18,
      key: "chromaSpread",
      label: "Chroma spread",
      max: 1.5,
      min: 0,
      step: 0.01,
    },
    { default: 0.9, key: "glow", label: "Glow", max: 5, min: 0, step: 0.05 },
    {
      default: 0,
      key: "metalDark",
      label: "Metal darkness",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.12,
      key: "baseVis",
      label: "Base visibility",
      max: 1.5,
      min: 0,
      step: 0.01,
    },
  ],
  statePresets: {
    idle: {
      baseVis: 0.12,
      chromaSpread: 0.18,
      flowAmp: 0.45,
      flowScale: 0.3,
      flowSpeed: 0.35,
      glow: 0.9,
      metalDark: 0,
      posScale: 0.5,
      precess: 0.3,
      probGain: 3,
      probPow: 0.4,
      radialDecay: 1,
      radialPow: 0.5,
      radius: 0.9,
      rotSpeed: 0.5,
      speed: 0.9,
      swell: 0.07,
      waveFreq: 4,
    },
    speaking: {
      baseVis: 0.12,
      chromaSpread: 0.12,
      flowAmp: 0.8,
      flowScale: 2.2,
      flowSpeed: 2.75,
      glow: 0.9,
      metalDark: 0,
      posScale: 1,
      precess: 1.3,
      probGain: 4.3,
      probPow: 0.31,
      radialDecay: 1,
      radialPow: 0.5,
      radius: 0.9,
      rotSpeed: 0.5,
      speed: 2.45,
      swell: 0.07,
      waveFreq: 4,
    },
    thinking: {
      baseVis: 0.12,
      chromaSpread: 0.41,
      flowAmp: 1.1,
      flowScale: 0.3,
      flowSpeed: 0.35,
      glow: 0.9,
      metalDark: 0,
      posScale: 0.65,
      precess: 0,
      probGain: 3,
      probPow: 0.4,
      radialDecay: 1.9,
      radialPow: 0.5,
      radius: 0.9,
      rotSpeed: 0.5,
      speed: 0.9,
      swell: 0.07,
      waveFreq: 4,
    },
  },
};

export type Orb11Props = Omit<ShaderOrbProps, "variant">;

export const Orb11 = ({ size = 280, ...rest }: Orb11Props) => (
  <ShaderOrb variant={orb11Orb} size={size} {...rest} />
);

export default Orb11;

import { orb17Shader } from "@/components/orbs/orb-17/gpu";
import type { OrbVariant } from "@/components/orbs/orbkit-core-wgpu";

export const meta = {
  description: "a grainy many-coloured storm with band shear and lightning",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-17",
  title: "ORB-17",
} as const;

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
  key: meta.slug,
  label: meta.title,
  note: meta.description,
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
  shader: orb17Shader,
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

import type { OrbVariant } from "@/components/orbs/canvas";
import { orb02Shader } from "@/components/orbs/orb-02/gpu";

export const meta = {
  description: "ornate scrollwork on a rolling dome",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-02",
  title: "ORB-02",
} as const;

export const orb02Orb: OrbVariant = {
  colors: [],
  key: meta.slug,
  label: meta.title,
  note: meta.description,
  params: [
    {
      default: 0.5,
      integrate: true,
      key: "speed",
      label: "Anim speed",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.06,
      key: "swirl",
      label: "Swirl",
      max: 3,
      min: 0,
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
      default: 0.06,
      key: "swell",
      label: "Input swell",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 4.4,
      key: "zoom",
      label: "Pattern zoom",
      max: 40,
      min: 0.15,
      step: 0.2,
    },
    {
      default: 0.35,
      key: "bulge",
      label: "Sphere bulge",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 1.5,
      key: "warpFreq",
      label: "Warp frequency",
      max: 10,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 0,
      key: "hueShift",
      label: "Hue shift",
      max: 6.283,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.12,
      key: "coreClamp",
      label: "Flare size",
      max: 3,
      min: 0.003,
      step: 0.015,
    },
    {
      default: 1,
      key: "falloff",
      label: "Fill",
      max: 4,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 0.55,
      key: "gain",
      label: "Exposure",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.12,
      key: "rim",
      label: "Rim light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 2.2,
      key: "rimPow",
      label: "Rim tightness",
      max: 15,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 2.4,
      key: "alphaGain",
      label: "Alpha gain",
      max: 15,
      min: 0.05,
      step: 0.1,
    },
    {
      default: 0.08,
      key: "baseVis",
      label: "Base visibility",
      max: 1.5,
      min: 0,
      step: 0.01,
    },
  ],
  /*
   * No dome rotation in any state — see the projection note in the shader. The
   * states differ by how fast the scrollwork evolves and how dense it is.
   *
   * `swirl` is deliberately absent from every preset: the rotation angle is
   * animTime * swirl, so a per-state swirl value makes a state change sweep
   * the angle by (accumulated clock) x (delta) — the whole dome visibly spins
   * while the preset glides. Held constant, the angle stays continuous and a
   * state change only retimes the scrollwork.
   */
  shader: orb02Shader,
  statePresets: {
    idle: {
      alphaGain: 2.4,
      coreClamp: 0.12,
      falloff: 1,
      gain: 0.55,
      rim: 0.12,
      speed: 0.5,
      warpFreq: 1.5,
      zoom: 4.4,
    },
    speaking: {
      alphaGain: 3,
      coreClamp: 0.07,
      falloff: 1.1,
      gain: 0.85,
      rim: 0.2,
      speed: 3,
      warpFreq: 1.2,
      zoom: 4.4,
    },
    thinking: {
      alphaGain: 2.5,
      coreClamp: 0.11,
      falloff: 0.96,
      gain: 0.6,
      rim: 0.13,
      speed: 0.65,
      warpFreq: 1.6,
      zoom: 4.6,
    },
  },
};

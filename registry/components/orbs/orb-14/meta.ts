import type { OrbVariant } from "@/components/orbs/canvas";
import { orb14Params, orb14Shader } from "@/components/orbs/orb-14/gpu";

export const meta = {
  description: "a lit plasma dome quantized to chunky two-tone pixels",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-14",
  title: "ORB-14",
} as const;

export const orb14Orb: OrbVariant = {
  colors: [
    { default: "#101426", key: "ink", label: "Ink" },
    { default: "#cfe6ff", key: "paper", label: "Paper" },
  ],
  key: meta.slug,
  label: meta.title,
  note: meta.description,
  params: [
    {
      default: 0.5,
      integrate: true,
      key: "speed",
      label: "Wave speed",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.15,
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
      default: 140,
      key: "cells",
      label: "Grid cells",
      max: 320,
      min: 32,
      step: 2,
    },
    { default: 3, key: "levels", label: "Tone steps", max: 8, min: 2, step: 1 },
    {
      default: 1.5,
      key: "scale",
      label: "Wave scale",
      max: 12,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.9,
      key: "plasma",
      label: "Wave amount",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.9,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.35,
      key: "rim",
      label: "Rim light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 1,
      key: "gain",
      label: "Brightness",
      max: 5,
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
  ],
  // ink/paper carry the at-a-glance read: cool print at rest, violet-blue
  // while computing, warm amber while answering
  shader: orb14Shader,
  stateColors: {
    idle: { ink: "#101426", paper: "#cfe6ff" },
    speaking: { ink: "#2a1410", paper: "#ffd9a4" },
    thinking: { ink: "#140f38", paper: "#a9b9ff" },
  },
  /*
    Staged in the family language: thinking churns the plasma in place while
    the light freezes, speaking sweeps the light fast and brightens the
    ladder. `pixel` and `levels` never move between states — both quantize,
    and a gliding quantizer pops instead of fading.
  */
  statePresets: {
    idle: {
      contrast: 1.1,
      gain: 1,
      plasma: 0.9,
      speed: 0.5,
      spin: 0.15,
    },
    speaking: {
      contrast: 1.05,
      gain: 1.3,
      plasma: 1,
      speed: 1.3,
      spin: 0.8,
    },
    thinking: {
      contrast: 1.15,
      gain: 0.95,
      plasma: 1.15,
      speed: 1.6,
      spin: 0.05,
    },
  },
  uniforms: orb14Params,
};

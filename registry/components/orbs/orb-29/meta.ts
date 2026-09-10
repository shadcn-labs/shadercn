import type { OrbVariant } from "@/components/orbs/canvas";
import { orb29Shader } from "@/components/orbs/orb-29/gpu";

export const meta = {
  description:
    "an LED tile wall lighting up in flowing blobs, wrapped on the ball",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-29",
  title: "ORB-29",
} as const;

export const orb29Orb: OrbVariant = {
  colors: [
    { default: "#fff2dd", key: "lit", label: "Lit tile" },
    { default: "#161616", key: "wall", label: "Wall" },
  ],
  key: meta.slug,
  label: meta.title,
  note: meta.description,
  params: [
    {
      default: 0.45,
      integrate: true,
      key: "drift",
      label: "Drift",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.5,
      integrate: true,
      key: "churn",
      label: "Churn",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 1.2,
      key: "swirl",
      label: "Fluidity",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.6,
      integrate: true,
      key: "shuffle",
      label: "Shuffle",
      max: 20,
      min: 0,
      step: 0.1,
    },
    {
      default: 0,
      key: "pulse",
      label: "Pulse depth",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.1,
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
      default: 48,
      key: "cells",
      label: "Tile grid",
      max: 160,
      min: 16,
      step: 2,
    },
    {
      default: 1.3,
      key: "scale",
      label: "Blob scale",
      max: 10,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.52,
      key: "coverage",
      label: "Coverage",
      max: 1.2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.22,
      key: "confetti",
      label: "Confetti",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.6,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 1,
      key: "gain",
      label: "Panel gain",
      max: 5,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1,
      key: "contrast",
      label: "Contrast",
      max: 10,
      min: 0.15,
      step: 0.05,
    },
  ],
  /*
    Each state animates DIFFERENTLY — its own motion, same palette and
    composition throughout (no stateColors on purpose).
  */
  /*
    Coverage is staged DOWN in the active states on purpose: the synthesized
    volumes push it up, and without the counterweight thinking and speaking
    flood the wall with light — the composition lives on its big dark
    voids, so every state keeps them.
  */
  shader: orb29Shader,
  statePresets: {
    idle: {
      churn: 0.5,
      coverage: 0.52,
      drift: 0.45,
      gain: 1,
      pulse: 0,
      shuffle: 0.6,
      spin: 0.1,
    },
    speaking: {
      churn: 0.9,
      coverage: 0.44,
      drift: 0.5,
      gain: 1.15,
      pulse: 0.55,
      shuffle: 1.2,
      spin: 0.45,
    },
    thinking: {
      churn: 1.9,
      coverage: 0.42,
      drift: 0.1,
      gain: 0.95,
      pulse: 0,
      shuffle: 5,
      spin: 0.03,
    },
  },
};

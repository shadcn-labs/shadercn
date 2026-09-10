import type { OrbVariant } from "@/components/orbs/canvas";
import { orb24Params, orb24Shader } from "@/components/orbs/orb-24/gpu";

export const meta = {
  description:
    "a Minecraft Earth — a perfect voxel sphere whose seasons cycle it through lush, cherry-grove, ice, mesa and desert worlds",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-24",
  title: "ORB-24",
} as const;

export const orb24Orb: OrbVariant = {
  colors: [
    { default: "#6abe30", key: "grass", label: "Grass" },
    { default: "#6f4a2f", key: "dirt", label: "Mud" },
    { default: "#8a8a90", key: "stone", label: "Stone" },
    { default: "#dbcf9c", key: "sand", label: "Sand" },
    { default: "#2f66d0", key: "water", label: "Water" },
    { default: "#3e8f27", key: "leaf", label: "Leaves" },
    { default: "#4de3ff", key: "ore", label: "Ore" },
    { default: "#ff7b26", key: "lava", label: "Lava" },
  ],
  key: meta.slug,
  label: meta.title,
  note: meta.description,
  params: [
    {
      default: 0.22,
      integrate: true,
      key: "spin",
      label: "Spin",
      max: 5,
      min: 0,
      step: 0.03,
    },
    { default: 0.45, key: "tilt", label: "Tilt", max: 4, min: 0, step: 0.02 },
    {
      default: 0.12,
      integrate: true,
      key: "drift",
      label: "Terrain drift",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.3,
      integrate: true,
      key: "season",
      label: "Season rate",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.8,
      integrate: true,
      key: "shuffle",
      label: "Ember rate",
      max: 20,
      min: 0,
      step: 0.1,
    },
    {
      default: 1.15,
      key: "radius",
      label: "Radius",
      max: 3,
      min: 0.15,
      step: 0.015,
    },
    { default: 64, key: "blocks", label: "Blocks", max: 96, min: 16, step: 1 },
    {
      default: 0.45,
      key: "rough",
      label: "Mountains",
      max: 0.8,
      min: 0,
      step: 0.01,
    },
    {
      default: 2.4,
      key: "scale",
      label: "Terrain scale",
      max: 8,
      min: 0.5,
      step: 0.05,
    },
    {
      default: 0.5,
      key: "sea",
      label: "Sea level",
      max: 1,
      min: 0,
      step: 0.01,
    },
    { default: 0.75, key: "trees", label: "Trees", max: 1, min: 0, step: 0.01 },
    { default: 0.4, key: "cave", label: "Caves", max: 1, min: 0, step: 0.01 },
    {
      default: 0.12,
      key: "ore",
      label: "Ore density",
      max: 0.6,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.9,
      key: "glow",
      label: "Ore glow",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 0.5,
      key: "core",
      label: "Molten core",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.6,
      key: "texture",
      label: "Texture grain",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 1,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    { default: 1, key: "gain", label: "Gain", max: 5, min: 0.05, step: 0.05 },
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
    Each state animates DIFFERENTLY on the integrated clocks — same palette
    and biomes throughout (no stateColors on purpose):

      idle DRIFTS      lazy spin, terrain barely morphing, embers twinkling
      thinking LOADS   the spin all but stops while the terrain field
                       streams — continents morph and blocks pop in and out
                       like chunks loading — and the ore twinkle races
      speaking ERUPTS  the planet turns fast to answer, the molten core
                       blazes through the caves, ore glow flares
  */
  shader: orb24Shader,
  statePresets: {
    idle: {
      core: 0.5,
      drift: 0.12,
      gain: 1,
      glow: 0.9,
      light: 1,
      season: 0.3,
      shuffle: 0.8,
      spin: 0.22,
    },
    speaking: {
      core: 1,
      drift: 0.35,
      gain: 1.1,
      glow: 1.6,
      light: 1.15,
      season: 0.6,
      shuffle: 1.6,
      spin: 0.85,
    },
    thinking: {
      core: 0.35,
      drift: 1.7,
      gain: 0.95,
      glow: 1.3,
      light: 0.9,
      season: 1.8,
      shuffle: 4.5,
      spin: 0.04,
    },
  },
  uniforms: orb24Params,
};

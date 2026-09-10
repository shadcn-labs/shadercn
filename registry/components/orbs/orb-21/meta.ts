import type { OrbVariant } from "@/components/orbs/canvas";
import { orb21Shader } from "@/components/orbs/orb-21/gpu";

export const meta = {
  description: "light diffusing through a cloud",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-21",
  title: "ORB-21",
} as const;

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
  key: meta.slug,
  label: meta.title,
  note: meta.description,
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
  shader: orb21Shader,
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

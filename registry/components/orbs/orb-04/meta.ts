import type { OrbVariant } from "@/components/orbs/canvas";
import { orb04Shader } from "@/components/orbs/orb-04/gpu";

export const meta = {
  description: "a hollow shell of light, faceted by a voxel lattice",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-04",
  title: "ORB-04",
} as const;

export const orb04Orb: OrbVariant = {
  colors: [{ default: "#ffffff", key: "tint", label: "Tint" }],
  key: meta.slug,
  label: meta.title,
  note: meta.description,
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
      default: 9,
      key: "camDist",
      label: "Camera distance",
      max: 60,
      min: 1,
      step: 0.3,
    },
    {
      default: 1.35,
      key: "focal",
      label: "Lens",
      max: 15,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 5,
      key: "shellR",
      label: "Shell radius",
      max: 20,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.3,
      key: "pitch",
      label: "Facet size",
      max: 1.5,
      min: 0.005,
      step: 0.005,
    },
    {
      default: 0.45,
      key: "turb",
      label: "Displacement",
      max: 5,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.1,
      key: "slack",
      label: "Trace slack",
      max: 0.9,
      min: 0.01,
      step: 0.005,
    },
    {
      default: 0.003,
      key: "width",
      label: "Surface width",
      max: 0.3,
      min: 0.0005,
      step: 0.0005,
    },
    {
      default: 1,
      key: "hueGain",
      label: "Position hue",
      max: 6,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.8,
      key: "floorLevel",
      label: "White floor",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 1.16,
      key: "envScale",
      label: "Silhouette margin",
      max: 2,
      min: 1,
      step: 0.01,
    },
    {
      default: 3000,
      key: "exposure",
      label: "Exposure",
      max: 40_000,
      min: 20,
      step: 20,
    },
    {
      default: 1.3,
      key: "contrast",
      label: "Contrast",
      max: 15,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 1.3,
      key: "saturation",
      label: "Saturation",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 2,
      key: "alphaGain",
      label: "Alpha gain",
      max: 15,
      min: 0.05,
      step: 0.1,
    },
    {
      default: 1,
      key: "edge",
      label: "Edge sharpness",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.98,
      key: "edgeFade",
      label: "Halo falloff",
      max: 3,
      min: 0.1,
      step: 0.015,
    },
  ],
  // the position ramp supplies the colour, so the tint only shifts its
  // temperature: neutral at rest and cool for both of the busy states —
  // blue while searching, a brighter cyan while answering
  shader: orb04Shader,
  stateColors: {
    idle: { tint: "#ffffff" },
    speaking: { tint: "#94f3ff" },
    thinking: { tint: "#9db8ff" },
  },
  /*
    Staged on displacement — how far the lattice pushes the shell out of
    round — and on surface width, which is the only material control this
    shader has.

    FACET SIZE was held still across all three for a reason: it is a
    quantizer, and a gliding quantizer pops instead of fading (the same rule
    as orb-14's cell grid and orb-17's grain). Answering now moves it, 0.3
    to 0.22, so the lattice re-snaps through the half second either side of
    that state rather than cross-fading. Deliberate — see the note there.
  */
  statePresets: {
    idle: {
      contrast: 1.3,
      exposure: 3000,
      hueGain: 1,
      slack: 0.1,
      speed: 0.6,
      turb: 0.45,
      width: 0.003,
    },
    speaking: {
      contrast: 0.92,
      envScale: 1.67,
      exposure: 1220,
      floorLevel: 0.82,
      hueGain: 0.5,
      pitch: 0.22,
      saturation: 1.66,
      slack: 0.165,
      speed: 2,
      turb: 0.8,
      width: 0.032,
    },
    thinking: {
      contrast: 1.75,
      exposure: 4800,
      hueGain: 1.7,
      slack: 0.07,
      speed: 1.8,
      turb: 0.85,
      width: 0.0012,
    },
  },
};

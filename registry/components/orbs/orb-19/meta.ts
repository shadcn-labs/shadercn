import { orb19Shader } from "@/components/orbs/orb-19/gpu";
import type { OrbVariant } from "@/components/orbs/orbkit-core-wgpu";

export const meta = {
  description:
    "beads swelling and shrinking in their cells, packed over the ball",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-19",
  title: "ORB-19",
} as const;

export const orb19Orb: OrbVariant = {
  /*
   * Four stops: the two ends of the per-bead hash, the body the packing
   * sits on, and the glass.
   */
  colors: [
    { default: "#ffffff", key: "low", label: "Dot" },
    { default: "#eef5ff", key: "high", label: "Dot accent" },
    { default: "#05070c", key: "body", label: "Body" },
    { default: "#9dbfe4", key: "sheen", label: "Sheen" },
  ],
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
      default: 0.05,
      integrate: true,
      key: "swirl",
      label: "Swirl",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.1,
      integrate: true,
      key: "slide",
      label: "Drift",
      max: 4,
      min: 0,
      step: 0.02,
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
      default: 10,
      key: "scale",
      label: "Packing scale",
      max: 30,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.3,
      key: "bulge",
      label: "Dome bulge",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.185,
      key: "grow",
      label: "Dot size",
      max: 1.2,
      min: -0.2,
      step: 0.005,
    },
    {
      default: 0.13,
      key: "vary",
      label: "Size variation",
      max: 0.4,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.62,
      key: "skew",
      label: "Generator detune",
      max: 3,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.1,
      key: "jitter",
      label: "Dot wander",
      max: 1.5,
      min: 0,
      step: 0.01,
    },
    {
      default: 50,
      key: "edge",
      label: "Rim hardness",
      max: 200,
      min: 1,
      step: 1,
    },
    {
      default: 0,
      key: "bead",
      label: "Bead shading",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 1,
      key: "gain",
      label: "Brightness",
      max: 4,
      min: 0.05,
      step: 0.02,
    },
    {
      default: 1,
      key: "contrast",
      label: "Contrast",
      max: 6,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 1.1,
      key: "saturation",
      label: "Saturation",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.06,
      key: "floorLevel",
      label: "Body fill",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.3,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.35,
      key: "rim",
      label: "Rim sheen",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  // cool glass at rest, then pure white on black for both working states —
  // the answering one keeps the faintly warm body
  shader: orb19Shader,
  stateColors: {
    idle: {
      body: "#05070c",
      high: "#eef5ff",
      low: "#ffffff",
      sheen: "#9dbfe4",
    },
    speaking: {
      body: "#140a06",
      high: "#ffffff",
      low: "#ffffff",
      sheen: "#ffffff",
    },
    thinking: {
      body: "#000000",
      high: "#ffffff",
      low: "#dae6ff",
      sheen: "#ffffff",
    },
  },
  /*
    Staged on BEAD SIZE, which decides whether the ball is a scatter of
    separate beads or a packed foam, and on wander, which decides how far
    each one strays from its cell. Packing scale never moves between
    states — it sets the bead count, and a gliding count reads as the ball
    inflating rather than as a change of mood.
  */
  statePresets: {
    idle: {
      bulge: 0.08,
      contrast: 2.6,
      edge: 51,
      gain: 2.28,
      grow: 0.12,
      jitter: 0.74,
      rim: 0.345,
      skew: 0.63,
      slide: 0.1,
      speed: 0.52,
      swirl: 0.045,
      vary: 0.19,
    },
    speaking: {
      bulge: 0.28,
      contrast: 3.2,
      edge: 141,
      floorLevel: 0,
      gain: 1.35,
      grow: 0.22,
      jitter: 0.17,
      saturation: 2.04,
      skew: 0,
      slide: 0.55,
      speed: 2.85,
      swirl: 0.585,
      vary: 0.365,
    },
    thinking: {
      bulge: 0.14,
      contrast: 0.55,
      gain: 1.04,
      grow: 0.19,
      jitter: 0.37,
      light: 0.585,
      rim: 0.24,
      skew: 1.13,
      slide: 0.84,
      speed: 2.55,
      swirl: 0.57,
      vary: 0.165,
    },
  },
};

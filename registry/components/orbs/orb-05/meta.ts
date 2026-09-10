import type { OrbVariant } from "@/components/orbs/canvas";
import { orb05Shader } from "@/components/orbs/orb-05/gpu";

export const meta = {
  description: "rainbow rings travelling through a lattice of lenses",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-05",
  title: "ORB-05",
} as const;

export const orb05Orb: OrbVariant = {
  colors: [
    { default: "#ffffff", key: "tint", label: "Tint" },
    { default: "#141a30", key: "body", label: "Body" },
    { default: "#bcd8ff", key: "sheen", label: "Sheen" },
  ],
  key: meta.slug,
  label: meta.title,
  note: meta.description,
  params: [
    {
      default: 0.9,
      integrate: true,
      key: "ring",
      label: "Ring speed",
      max: 8,
      min: 0,
      step: 0.03,
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
      default: 0.12,
      integrate: true,
      key: "slide",
      label: "Lattice slide",
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
      default: 5,
      key: "scale",
      label: "Lattice scale",
      max: 20,
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
      default: 1,
      key: "lens",
      label: "Lens strength",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.02,
      key: "poleSoft",
      label: "Wall softness",
      max: 0.5,
      min: 0.0008,
      step: 0.0008,
    },
    {
      default: 1,
      key: "freq",
      label: "Ring frequency",
      max: 8,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1,
      key: "spread",
      label: "Colour split",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 1.1,
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
      default: 1.15,
      key: "saturation",
      label: "Saturation",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.12,
      key: "floorLevel",
      label: "Body fill",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.4,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.45,
      key: "rim",
      label: "Rim sheen",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  // the ring phases supply the colour, so the tint only shifts temperature
  // and the body carries the mood: neutral at rest, cold while searching,
  // warm while answering
  shader: orb05Shader,
  stateColors: {
    idle: { body: "#141a30", sheen: "#bcd8ff", tint: "#ffffff" },
    speaking: { body: "#2e1408", sheen: "#ffb277", tint: "#ffc492" },
    thinking: { body: "#080c26", sheen: "#7ea9ff", tint: "#a6c0ff" },
  },
  /*
    Staged on WALL SOFTNESS, which decides how tightly the rings are
    allowed to crowd before a cell wall stops them, and on ring frequency,
    which decides how many bands are on the ball at all. Lattice scale
    never moves between states — it sets the cell count, and a gliding cell
    count reads as the ball inflating rather than as a change of mood.

    Dome bulge and lens strength are staged too, so the SHAPE moves with the
    mood as well as the lattice: resting flattens both, and the two busy
    states drive them up — answering hardest, which puts bulge at 0 through
    0.36 to 0.96 across the three. They are continuous geometry rather than
    a quantizer, so gliding them is safe.
  */
  statePresets: {
    idle: {
      bulge: 0,
      contrast: 1,
      freq: 1.05,
      gain: 1.1,
      lens: 0.38,
      light: 0.66,
      poleSoft: 0.012,
      ring: 0.9,
      saturation: 1.14,
      slide: 0.26,
      spread: 0.7,
      swirl: 0.195,
    },
    speaking: {
      bulge: 0.96,
      contrast: 0.75,
      freq: 4.8,
      gain: 1.6,
      lens: 1.2,
      poleSoft: 0.064,
      ring: 1.4,
      slide: 1,
      spread: 0.68,
      swirl: 0.6,
    },
    thinking: {
      bulge: 0.36,
      contrast: 3.2,
      floorLevel: 0.4,
      freq: 1.3,
      gain: 0.88,
      lens: 1.28,
      poleSoft: 0.042,
      rim: 0,
      ring: 3,
      saturation: 2.36,
      slide: 0.88,
      spread: 1.82,
      swirl: 0.57,
    },
  },
};

import type { OrbVariant } from "@/components/orbs/canvas";
import { orb16Shader } from "@/components/orbs/orb-16/gpu";

export const meta = {
  description:
    "sunlight through water — a caustic net crawling over the ball, fringing into colour where it moves",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-16",
  title: "ORB-16",
} as const;

export const orb16Orb: OrbVariant = {
  // the pool floor, the light thrown on it, and the wet gloss at the limb
  colors: [
    { default: "#0b2f6e", key: "deep", label: "Water" },
    { default: "#7ff6ff", key: "sun", label: "Caustic light" },
    { default: "#bfe8ff", key: "sheen", label: "Sheen" },
  ],
  key: meta.slug,
  label: meta.title,
  note: meta.description,
  params: [
    {
      default: 0.9,
      integrate: true,
      key: "flow",
      label: "Water flow",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.08,
      integrate: true,
      key: "spin",
      label: "Turn",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 0.6,
      integrate: true,
      key: "swellRate",
      label: "Surge rate",
      max: 8,
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
      default: 9,
      key: "scale",
      label: "Net scale",
      max: 30,
      min: 3,
      step: 0.1,
    },
    {
      default: 0.8,
      key: "warp",
      label: "Ripple depth",
      max: 3,
      min: 0,
      step: 0.02,
    },
    {
      default: 2.2,
      key: "edge",
      label: "Line sharpness",
      max: 10,
      min: 0.5,
      step: 0.05,
    },
    {
      default: 0.6,
      key: "split",
      label: "Colour fringe",
      max: 3,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.15,
      key: "swell",
      label: "Surge depth",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 1.6,
      key: "gain",
      label: "Sun power",
      max: 6,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1.1,
      key: "contrast",
      label: "Tone knee",
      max: 6,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 0.9,
      key: "light",
      label: "Floor light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.6,
      key: "rim",
      label: "Rim sheen",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  // aqua light on dark red water at rest, pure white on a darker red while
  // searching, gold on brick-red water while answering
  shader: orb16Shader,
  stateColors: {
    idle: { deep: "#6f0b0b", sheen: "#bfe8ff", sun: "#7ff6ff" },
    speaking: { deep: "#8d2525", sheen: "#ffb3c6", sun: "#ffb914" },
    thinking: { deep: "#3a0808", sheen: "#ffffff", sun: "#ffffff" },
  },
  /*
    Staged on the three integrated clocks and on amplitudes only — nothing
    a state touches is a spatial frequency, so every transition cross-fades
    with nothing racing across the surface. NET SCALE is the one frequency
    in the orb and it is never staged: it multiplies the surface direction
    before the fold, so gliding it would sweep the whole net through every
    spacing in between. Line sharpness is a power exponent on a base in
    [0, 1], an amplitude, and safe at any span.

    The read is in the water:

      idle     a slow pool, lit HARD. Gentle ripple, moderate lines, the
               faintest surge, the ball barely turning — but the sun at
               full power on a firmer knee, so the caustics burn white
               over dark red water.
      thinking NERVOUS water. The flow runs at three and a half times
               resting on a ripple nearly double rest's, and the lines
               go broad under it — a coarse, fast, restless net. The
               surge is shallow but quick, a flicker rather than a heave,
               and the ball all but freezes so the motion is in the
               light. The sun is dropped to half rest's power with the
               key light and rim pulled down: white on a darker red,
               dimmer than rest.
      speaking the water HEAVES, fast. Full surge depth on a rate five
               times rest's, so the light pumps in quick breaths, on the
               deepest ripple and the broadest lines — sheets of light
               rather than threads — with the colour split wide so every
               edge fringes, and the ball plainly turning beneath it. The
               rim is all but cut so the light is the sun alone. Warm:
               gold on brick red.
  */
  statePresets: {
    idle: {
      contrast: 1.3,
      edge: 3,
      flow: 0.92,
      gain: 6,
      light: 0.9,
      rim: 0.6,
      spin: 0.09,
      split: 0.6,
      swell: 0.15,
      swellRate: 0.6,
      warp: 0.8,
    },
    speaking: {
      contrast: 0.85,
      edge: 1.7,
      flow: 1.8,
      gain: 3.6,
      light: 0.96,
      rim: 0.18,
      spin: 0.7,
      split: 1.1,
      swell: 1,
      swellRate: 5.4,
      warp: 1.7,
    },
    thinking: {
      contrast: 1.15,
      edge: 2.8,
      flow: 3.22,
      gain: 3.35,
      light: 0.525,
      rim: 0.21,
      spin: 0.03,
      split: 0.36,
      swell: 0.26,
      swellRate: 2.4,
      warp: 1.52,
    },
  },
};

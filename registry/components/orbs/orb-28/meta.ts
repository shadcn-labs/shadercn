import type { OrbVariant } from "@/components/orbs/canvas";
import { orb28Shader } from "@/components/orbs/orb-28/gpu";

export const meta = {
  description: "nested binary grids shuttering on a tumbling bit-sphere",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-28",
  title: "ORB-28",
} as const;

export const orb28Orb: OrbVariant = {
  colors: [
    { default: "#ff5a4d", key: "lineA", label: "X lines" },
    { default: "#59d8ff", key: "lineB", label: "Y lines" },
    { default: "#101528", key: "base", label: "Body" },
    { default: "#bcd8ff", key: "rim", label: "Rim" },
  ],
  key: meta.slug,
  label: meta.title,
  note: meta.description,
  params: [
    {
      default: 0.5,
      integrate: true,
      key: "speed",
      label: "Shutter drift",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.15,
      integrate: true,
      key: "spin",
      label: "Tumble rate",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 0.5,
      key: "tilt",
      label: "Tumble tilt",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.9,
      key: "radius",
      label: "Radius",
      max: 3,
      min: 0.1,
      step: 0.015,
    },
    {
      default: 2,
      key: "gridScale",
      label: "Grid scale",
      max: 20,
      min: 0.5,
      step: 0.1,
    },
    // 12 levels / wider lines: past ~12 the deep grids alias into solid white
    // planes that swallow the line palette — the state staging below depends
    // on the coarse lines and body actually carrying their colours
    {
      default: 12,
      key: "levels",
      label: "Bit depth",
      max: 20,
      min: 4,
      step: 1,
    },
    {
      default: 2,
      key: "lineW",
      label: "Line width",
      max: 15,
      min: 0.5,
      step: 0.1,
    },
    {
      default: 1,
      key: "shutter",
      label: "Shutter",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 1,
      key: "gain",
      label: "Line gain",
      max: 10,
      min: 0.05,
      step: 0.05,
    },
    { default: 1, key: "body", label: "Body glow", max: 5, min: 0, step: 0.03 },
    {
      default: 0.6,
      key: "rim",
      label: "Rim light",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 3,
      key: "rimPow",
      label: "Rim tightness",
      max: 20,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 1,
      key: "contrast",
      label: "Contrast",
      max: 10,
      min: 0.15,
      step: 0.05,
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
  /*
    Four stageable colours, and one palette across all three states: red
    and white circuitry on pure black. The states are told apart by the
    tumble, the grid and the line weight, not the colour.
  */
  shader: orb28Shader,
  stateColors: {
    idle: {
      base: "#000000",
      lineA: "#ff1100",
      lineB: "#ffffff",
      rim: "#000000",
    },
    speaking: {
      base: "#000000",
      lineA: "#ff0000",
      lineB: "#ffffff",
      rim: "#000000",
    },
    thinking: {
      base: "#000000",
      lineA: "#ff0000",
      lineB: "#ffffff",
      rim: "#000000",
    },
  },
  /*
    The states are staged on the two integrated clocks: thinking runs the
    shutter cascade hot AND sets the sphere tumbling — the bits computing
    furiously while the orb turns them over — and speaking tumbles harder
    still while the flicker stays moderate: the orb turning to answer. Both
    clocks integrate, so every rate change glides without a phase jump.
  */
  statePresets: {
    idle: {
      body: 0.9,
      contrast: 1.2,
      gain: 1,
      levels: 10,
      lineW: 2.5,
      rim: 0.6,
      rimPow: 5.2,
      shutter: 1.02,
      speed: 1,
      spin: 0.1,
    },
    speaking: {
      body: 0.27,
      contrast: 1.45,
      gain: 0.95,
      gridScale: 10.3,
      levels: 17,
      rim: 1.53,
      rimPow: 10,
      shutter: 1.2,
      speed: 3,
      spin: 1.1,
    },
    thinking: {
      body: 0.85,
      gain: 1.2,
      lineW: 2.9,
      rim: 0.7,
      shutter: 0.94,
      speed: 2.4,
      spin: 0.81,
    },
  },
};

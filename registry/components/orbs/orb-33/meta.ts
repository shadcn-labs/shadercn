import { orb33Shader } from "@/components/orbs/orb-33/gpu";
import type { OrbVariant } from "@/components/orbs/orbkit-core-wgpu";

export const meta = {
  description: "a thermal image, risograph-printed on the ball",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-33",
  title: "ORB-33",
} as const;

const HEAT_REST = {
  banding: 0.85,
  contrast: 1,
  gain: 1,
  grain: 0.35,
  hi: 0.74,
  jitter: 0.015,
  lo: 0.42,
  speed: 0.5,
  spin: 0.05,
  warp: 0.6,
};

const HEAT_PALETTE = {
  cold: "#0b0a1e",
  cool: "#3b2a9a",
  core: "#fff1e6",
  hot: "#f6b53a",
  warm: "#f05a28",
};

export const orb33Orb: OrbVariant = {
  /*
   * Six stops: five up the thermal ramp, and the paper the screens are
   * printed on.
   */
  colors: [
    { default: "#0b0a1e", key: "cold", label: "Cold" },
    { default: "#3b2a9a", key: "cool", label: "Cool" },
    { default: "#f05a28", key: "warm", label: "Warm" },
    { default: "#f6b53a", key: "hot", label: "Hot" },
    { default: "#fff1e6", key: "core", label: "Core" },
    { default: "#f4ecdf", key: "paper", label: "Paper" },
  ],
  key: meta.slug,
  label: meta.title,
  note: meta.description,
  params: [
    {
      default: 0.5,
      integrate: true,
      key: "speed",
      label: "Drift",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.05,
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
    { default: 3, key: "scale", label: "Zoom", max: 8, min: 0.3, step: 0.05 },
    {
      default: 1.4,
      key: "freq",
      label: "Pool scale",
      max: 6,
      min: 0.2,
      step: 0.05,
    },
    { default: 0.6, key: "warp", label: "Warp", max: 3, min: 0, step: 0.02 },
    {
      default: 0.42,
      key: "lo",
      label: "Cold threshold",
      max: 1,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.74,
      key: "hi",
      label: "Hot threshold",
      max: 1,
      min: 0,
      step: 0.005,
    },
    {
      default: 1,
      key: "gain",
      label: "Heat gain",
      max: 6,
      min: 0.1,
      step: 0.02,
    },
    {
      default: 0.015,
      key: "jitter",
      label: "Heat jitter",
      max: 0.5,
      min: 0,
      step: 0.005,
    },
    {
      default: 7,
      key: "bands",
      label: "Contour bands",
      max: 24,
      min: 2,
      step: 1,
    },
    {
      default: 0.85,
      key: "banding",
      label: "Contour strength",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 1,
      key: "contrast",
      label: "Contrast",
      max: 3,
      min: 0.3,
      step: 0.02,
    },
    {
      default: 0.05,
      key: "dither",
      label: "Dither",
      max: 0.6,
      min: 0,
      step: 0.005,
    },
    {
      default: 46,
      key: "dots",
      label: "Screen pitch",
      max: 120,
      min: 4,
      step: 1,
    },
    {
      default: 1,
      key: "dotGain",
      label: "Dot gain",
      max: 2,
      min: 0.2,
      step: 0.01,
    },
    {
      default: 0.12,
      key: "dotSoft",
      label: "Dot softness",
      max: 0.3,
      min: 0.01,
      step: 0.005,
    },
    {
      default: 0.5,
      key: "misregister",
      label: "Misregistration",
      max: 3,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.92,
      key: "ink",
      label: "Ink density",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.28,
      key: "printMix",
      label: "Print mix",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.35,
      key: "grain",
      label: "Paper grain",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 2,
      key: "grainSize",
      label: "Grain size",
      max: 8,
      min: 1,
      step: 1,
    },
    {
      default: 0.25,
      key: "light",
      label: "Key light",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.25,
      key: "rim",
      label: "Rim light",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  shader: orb33Shader,
  stateColors: {
    idle: HEAT_PALETTE,
    speaking: HEAT_PALETTE,
    thinking: HEAT_PALETTE,
  },
  /*
    All three states share the rest palette; idle is the rest preset.
    Speaking is the rest look set RACING in place — the drift at eighteen
    times rest on a roll forty times as fast, the pools slightly finer and
    the warp more than doubled, with the window dropped so more of it
    reads as hot — without the rescale thinking makes. Thinking is the
    rest look zoomed out and set racing: the plane at four times the
    zoom with the pools three times finer and the warp tripled, the drift
    at twenty times rest on a roll ten times as fast, the window dropped
    so more of it reads as hot, on fewer, softer bands and a finer screen.
    Note the zoom, the pool scale, the band count and the screen pitch all
    multiply a coordinate, so the transition into and out of thinking
    glides through a rescale — chosen deliberately.
  */
  statePresets: {
    idle: HEAT_REST,
    speaking: {
      ...HEAT_REST,
      freq: 1.3,
      hi: 0.72,
      jitter: 0,
      lo: 0.345,
      speed: 8.8,
      spin: 2.01,
      warp: 1.42,
    },
    thinking: {
      ...HEAT_REST,
      banding: 0.75,
      bands: 6,
      dots: 42,
      freq: 3.1,
      hi: 0.66,
      jitter: 0,
      lo: 0.3,
      scale: 4.6,
      speed: 10,
      spin: 0.51,
      warp: 1.82,
    },
  },
};

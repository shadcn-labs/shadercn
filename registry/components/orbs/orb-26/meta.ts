import type { OrbVariant } from "@/components/orbs/canvas";
import { orb26Shader } from "@/components/orbs/orb-26/gpu";

export const meta = {
  description: "a crazed web of coloured threads knotted to a cell grid",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "orb-26",
  title: "ORB-26",
} as const;

const KNOT_REST = {
  bulge: 3.28,
  contrast: 1.35,
  core: 2.235,
  drift: 0.18,
  floor: 0.26,
  gain: 1,
  light: 0.705,
  pole: 0.13,
  poleSoft: 0.001,
  pulse: 0.35,
  sharp: 4.5,
  speed: 0.42,
  split: 0.045,
  swirl: 0.075,
  warp: 2,
};

const KNOT_PALETTE = {
  deep: "#111a2e",
  hot: "#fff4d6",
  line: "#3fd2ff",
  sheen: "#a9d8ff",
};

export const orb26Orb: OrbVariant = {
  /*
   * Four stops: the glaze the web is crazed into, the two ends of the thread
   * ramp, and the fresnel sheen. The chromatic split runs the threads apart
   * into three filaments on its own, so the palette only has to set the mood.
   */
  colors: [
    { default: "#111a2e", key: "deep", label: "Glaze" },
    { default: "#3fd2ff", key: "line", label: "Thread" },
    { default: "#fff4d6", key: "hot", label: "Hot thread" },
    { default: "#a9d8ff", key: "sheen", label: "Sheen" },
  ],
  key: meta.slug,
  label: meta.title,
  note: meta.description,
  params: [
    {
      default: 0.4,
      integrate: true,
      key: "speed",
      label: "Boil",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.07,
      integrate: true,
      key: "swirl",
      label: "Swirl",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.18,
      integrate: true,
      key: "drift",
      label: "Crazing drift",
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
      default: 9,
      key: "scale",
      label: "Cell scale",
      max: 20,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.25,
      key: "bulge",
      label: "Dome bulge",
      max: 4,
      min: 0,
      step: 0.02,
    },
    { default: 0.85, key: "warp", label: "Warp", max: 3, min: 0, step: 0.02 },
    {
      default: 0.25,
      key: "pole",
      label: "Knot strength",
      max: 2,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.012,
      key: "poleSoft",
      label: "Knot size",
      max: 1,
      min: 0.001,
      step: 0.001,
    },
    {
      default: 0.35,
      key: "pulse",
      label: "Cell breathing",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 4.5,
      key: "sharp",
      label: "Thread width",
      max: 20,
      min: 0.3,
      step: 0.05,
    },
    {
      default: 0.045,
      key: "split",
      label: "Chromatic split",
      max: 1,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.45,
      key: "core",
      label: "Hot core",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.9,
      key: "floor",
      label: "Body fill",
      max: 3,
      min: 0,
      step: 0.01,
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
      default: 1.35,
      key: "contrast",
      label: "Contrast",
      max: 10,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 0.7,
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
  // one palette, cold cyan porcelain, across all three states — unlike the
  // sibling orbs, this one tells its states apart by the knots and the
  // tempo alone, not by colour
  shader: orb26Shader,
  stateColors: {
    idle: KNOT_PALETTE,
    speaking: KNOT_PALETTE,
    thinking: KNOT_PALETTE,
  },
  /*
    Staged on the pole, which is this orb's loudest control: knot strength
    decides whether the field flows past the lattice or tears itself around
    it. Thread width is the second lever, and the two integrated clocks —
    boil and roll — carry the tempo.
  */
  statePresets: {
    /*
      at rest: slow boil, threads fine — on a dome bulged nearly all the
      way and the warp pushed to more than double, so the field wraps hard
      around the ball. The knots are halved in strength and pinched to the
      smallest size, the hot core is run up five times and the body fill
      cut to a third: a dark ball with a fierce centre.
    */
    idle: KNOT_REST,
    /*
      answering: the web goes FAST and FLOODS. The boil runs at six times
      thinking and the drift more than three, the knots breathe at their
      deepest, and the threads spread to their softest, so the ridges bloom
      into broad light. The dome is flattened back toward the default and
      the warp relaxed to a third of rest, with the cell scale nudged up;
      the core is halved from rest, but the fill, gain and contrast all
      come up — the brightest, busiest state.
    */
    speaking: {
      bulge: 0.78,
      contrast: 1.95,
      core: 1.08,
      drift: 1.74,
      floor: 0.48,
      gain: 1.3,
      pole: 0.195,
      poleSoft: 0.001,
      pulse: 1.39,
      scale: 11,
      sharp: 2.1,
      speed: 6.45,
      split: 0.045,
      swirl: 0.555,
      warp: 0.76,
    },
    /*
      searching: the rest look, set MOVING. The boil runs at nearly two and
      a half times idle, the swirl four times and the drift three, so the
      web migrates over the glaze instead of sitting on it. The knots come
      up a third but breathe less, the threads soften a touch on a tighter
      split, and the contrast is pushed — busier, but no brighter.
    */
    thinking: {
      ...KNOT_REST,
      contrast: 1.6,
      drift: 0.51,
      floor: 0.28,
      pole: 0.18,
      pulse: 0.22,
      sharp: 3.6,
      speed: 1,
      split: 0.03,
      swirl: 0.3,
    },
  },
};

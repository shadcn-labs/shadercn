import type { BackgroundVariant } from "@/components/backgrounds/canvas";
import { waterParams, waterShader } from "@/components/backgrounds/water/gpu";

export const meta = {
  description:
    "Water-like surface distortion with natural dual-layer caustic realism and simplex wave refraction",
  files: ["index.tsx", "meta.ts", "gpu.ts"],
  slug: "water",
  title: "Water",
} as const;

export const waterBackground: BackgroundVariant = {
  colors: [
    { default: "#032b43", key: "colorBack", label: "Deep water" },
    { default: "#0ea5e9", key: "colorMid", label: "Mid water" },
    { default: "#e0f2fe", key: "colorHighlight", label: "Caustic highlight" },
  ],
  key: meta.slug,
  label: meta.title,
  note: meta.description,
  params: [
    {
      default: 0.65,
      integrate: true,
      key: "speed",
      label: "Speed",
      max: 4,
      min: 0,
      step: 0.05,
    },
    {
      default: 1.8,
      key: "size",
      label: "Pattern size",
      max: 7,
      min: 0.1,
      step: 0.05,
    },
    {
      default: 0.75,
      key: "highlights",
      label: "Highlights",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.55,
      key: "layering",
      label: "Caustic layering",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.8,
      key: "edges",
      label: "Edge power",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.65,
      key: "caustic",
      label: "Caustic refraction",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.45,
      key: "waves",
      label: "Simplex waves",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 1,
      key: "scale",
      label: "Zoom scale",
      max: 4,
      min: 0.1,
      step: 0.05,
    },
  ],
  presets: {
    abyssal: {
      colors: {
        colorBack: "#020617",
        colorHighlight: "#38bdf8",
        colorMid: "#0f172a",
      },
      params: {
        caustic: 0.5,
        edges: 0.9,
        highlights: 0.6,
        layering: 0.75,
        size: 2.4,
        speed: 0.45,
        waves: 0.6,
      },
    },
    lagoon: {
      colors: {
        colorBack: "#064e3b",
        colorHighlight: "#ccfbf1",
        colorMid: "#14b8a6",
      },
      params: {
        caustic: 0.7,
        edges: 0.85,
        highlights: 0.85,
        layering: 0.6,
        size: 1.5,
        speed: 0.7,
        waves: 0.4,
      },
    },
    pool: {
      colors: {
        colorBack: "#0369a1",
        colorHighlight: "#ffffff",
        colorMid: "#38bdf8",
      },
      params: {
        caustic: 0.8,
        edges: 1,
        highlights: 0.9,
        layering: 0.5,
        size: 1.6,
        speed: 0.75,
        waves: 0.35,
      },
    },
  },
  shader: waterShader,
  uniforms: waterParams,
};

// Deterministic orb generation for the Worker (mirrors
// lib/claims/orb-generation.ts math; schemas are vendored in orb-schemas.ts).

import { ORB_SCHEMAS, ORB_SLUGS } from "./orb-schemas";

export const ORB_GENERATOR_VERSION = 1;

export interface ClaimedOrbConfig {
  version: number;
  slug: string;
  seed: number;
  params: Record<string, number>;
  colors: Record<string, string>;
}

/** Polynomial rolling hash over Unicode code points. No bitwise ops. */
export const hashUsernameToSeed = (canonical: string): number => {
  let hash = 0;
  for (const char of canonical) {
    const code = char.codePointAt(0) ?? 0;
    hash = (hash * 31 + code) % 4_294_967_296;
  }
  return hash;
};

/** Deterministic LCG. Same seed -> same sequence in every runtime. */
export const createSeededRandom = (seed: number): (() => number) => {
  let state = seed % 4_294_967_296;
  return () => {
    state = (1_664_525 * state + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const quantize = (value: number, min: number, step: number): number => {
  if (!Number.isFinite(step) || step <= 0) {
    return value;
  }
  return min + Math.round((value - min) / step) * step;
};

const roundTo = (value: number, decimals = 6): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const hslToHex = (
  hue: number,
  saturation: number,
  lightness: number
): string => {
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(clamp(x, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
};

export const schemaForSlug = (slug: string) => {
  const schema = ORB_SCHEMAS[slug];
  if (!schema) {
    throw new Error(`Unknown orb variant: ${slug}`);
  }
  return schema;
};

/** Finalize + persist-ready config for a canonical username (v1). */
export const generateOrbForUsername = (canonical: string): ClaimedOrbConfig => {
  const seed = hashUsernameToSeed(canonical);
  const slug = ORB_SLUGS[seed % ORB_SLUGS.length];
  const schema = schemaForSlug(slug);
  const random = createSeededRandom(seed);
  const params: Record<string, number> = {};
  for (const param of schema.params) {
    const raw = param.min + random() * (param.max - param.min);
    params[param.key] = roundTo(
      clamp(quantize(raw, param.min, param.step), param.min, param.max)
    );
  }
  const colors: Record<string, string> = {};
  const baseHue = Math.floor(random() * 360);
  for (const [index, key] of schema.colors.entries()) {
    const hue = (baseHue + index * 47 + Math.floor(random() * 24)) % 360;
    colors[key] = hslToHex(
      hue,
      62 + Math.floor(random() * 28),
      55 + Math.floor(random() * 15)
    );
  }
  return { colors, params, seed, slug, version: ORB_GENERATOR_VERSION };
};

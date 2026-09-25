/**
 * Deterministic one-of-one orb generation (generator v1).
 *
 * Pure functions shared by the Worker (verify-time finalization) and Next.js
 * (public-page rendering checks). The Worker persists the finalized config so
 * the public orb never changes when new variants ship or logic evolves.
 *
 * Design:
 * - Rolling hash of the canonical username -> seed (stable across runtimes)
 * - variant = ORB_SLUGS[seed % count] (count snapshotted per generation)
 * - seeded LCG drives bounded param + palette derivation
 * - params are quantized to each param's step and clamped to [min, max]
 * - colors are derived as varied HSL -> hex values (always valid CSS)
 */

import { ORB_SLUGS } from "@/lib/orb-slugs";

export const ORB_GENERATOR_VERSION = 1;

export interface OrbParamSchema {
  key: string;
  min: number;
  max: number;
  step: number;
}

export interface OrbVariantSchema {
  slug: string;
  params: OrbParamSchema[];
  colors: string[];
}

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
  const steps = Math.round((value - min) / step);
  return min + steps * step;
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

export const pickVariantSlug = (
  seed: number,
  slugs: readonly string[] = ORB_SLUGS
): string => {
  if (slugs.length === 0) {
    throw new Error("No orb variants available");
  }
  return slugs[seed % slugs.length];
};

/**
 * Derive a bounded, valid config for a variant schema from a seed.
 * Unknown keys are never emitted; every value respects its schema.
 */
export const deriveOrbConfig = (
  seed: number,
  schema: OrbVariantSchema,
  version: number = ORB_GENERATOR_VERSION
): ClaimedOrbConfig => {
  const random = createSeededRandom(seed);
  const params: Record<string, number> = {};
  for (const param of schema.params) {
    const t = random();
    const raw = param.min + t * (param.max - param.min);
    const stepped = quantize(raw, param.min, param.step);
    params[param.key] = roundTo(clamp(stepped, param.min, param.max));
  }

  const colors: Record<string, string> = {};
  const baseHue = Math.floor(random() * 360);
  // Saturation spans 62–89%, lightness 55–69%.
  // Hues spread across multi-color orbs so results look meaningfully varied.
  for (const [index, key] of schema.colors.entries()) {
    const hue = (baseHue + index * 47 + Math.floor(random() * 24)) % 360;
    const saturation = 62 + Math.floor(random() * 28);
    const lightness = 55 + Math.floor(random() * 15);
    colors[key] = hslToHex(hue, saturation, lightness);
  }

  return { colors, params, seed, slug: schema.slug, version };
};

/** Convenience: full v1 generation from a canonical username + schema lookup. */
export const generateOrbForUsername = (
  canonical: string,
  resolveSchema: (slug: string) => OrbVariantSchema,
  slugs: readonly string[] = ORB_SLUGS
): ClaimedOrbConfig => {
  const seed = hashUsernameToSeed(canonical);
  const slug = pickVariantSlug(seed, slugs);
  return deriveOrbConfig(seed, resolveSchema(slug));
};

/** Validate a persisted config is well-formed before rendering. */
export const isValidClaimedConfig = (
  value: unknown
): value is ClaimedOrbConfig => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.version === ORB_GENERATOR_VERSION &&
    typeof record.slug === "string" &&
    typeof record.seed === "number" &&
    typeof record.params === "object" &&
    record.params !== null &&
    typeof record.colors === "object" &&
    record.colors !== null
  );
};

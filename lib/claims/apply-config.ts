"use client";

/**
 * Apply a persisted claim config to a live orb variant.
 *
 * Unknown params/colors are dropped; numeric values are clamped to the
 * variant's [min, max] and quantized to its step so older configs stay valid
 * if a variant's schema evolves. Rendering always goes through ShaderOrb.
 */

import type { OrbVariant } from "@/components/orbs/canvas";
import { isValidClaimedConfig } from "@/lib/claims/orb-generation";
import type { ClaimedOrbConfig } from "@/lib/claims/orb-generation";

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export interface AppliedOrb {
  params: Record<string, number>;
  colors: Record<string, string>;
}

export const applyClaimedConfig = (
  variant: OrbVariant,
  config: ClaimedOrbConfig
): AppliedOrb => {
  const params: Record<string, number> = {};
  for (const def of variant.params) {
    const raw = config.params[def.key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      continue;
    }
    const clamped = Math.min(def.max, Math.max(def.min, raw));
    const steps = Math.round((clamped - def.min) / def.step);
    const value = def.min + steps * def.step;
    params[def.key] = Math.round(value * 1_000_000) / 1_000_000;
  }
  const colors: Record<string, string> = {};
  for (const def of variant.colors) {
    const raw = config.colors[def.key];
    if (typeof raw === "string" && HEX_PATTERN.test(raw)) {
      colors[def.key] = raw;
    }
  }
  return { colors, params };
};

export const parseClaimedConfig = (value: unknown): ClaimedOrbConfig | null =>
  isValidClaimedConfig(value) ? value : null;

"use client";

import { useState } from "react";

import type { OrbState } from "@/components/orbs/canvas";
import { applyClaimedConfig } from "@/lib/claims/apply-config";
import type { ClaimedOrbConfig } from "@/lib/claims/orb-generation";
import { ORBS } from "@/lib/orbs";

export const ClaimedOrb = ({
  config,
  size = 420,
}: {
  config: ClaimedOrbConfig;
  size?: number;
}) => {
  const [state] = useState<OrbState>("idle");
  const entry = ORBS[config.slug];
  if (!entry) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
        Unknown orb variant: {config.slug}
      </div>
    );
  }
  const applied = applyClaimedConfig(entry.variant, config);
  const { Component } = entry;
  return (
    <Component
      ariaLabel={`@${config.slug} claimed orb`}
      colors={applied.colors}
      params={applied.params}
      size={size}
      state={state}
    />
  );
};

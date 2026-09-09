"use client";

import Link from "next/link";
import { useState } from "react";

import type { OrbState } from "@/components/orbs/orbkit-core-wgpu";
import { ORB_STATES } from "@/components/orbs/orbkit-core-wgpu";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORBS } from "@/lib/orbs";
import { cn } from "@/lib/utils";

const STATE_LABELS: Record<OrbState, string> = {
  idle: "Idle",
  speaking: "Speaking",
  thinking: "Thinking",
};

export const OrbPreview = ({
  slug,
  size = 280,
  className,
}: {
  slug: string;
  size?: number;
  className?: string;
}) => {
  const [state, setState] = useState<OrbState>("idle");
  const entry = ORBS[slug];

  if (!entry) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
        Unknown orb: {slug}
      </div>
    );
  }

  const { Component } = entry;

  return (
    <div
      className={cn(
        "relative flex min-h-[26rem] items-center justify-center overflow-hidden rounded-xl border border-border bg-background p-6",
        className
      )}
      data-slot="orb-preview"
    >
      <Component
        ariaLabel={`${slug} orb, ${state}`}
        size={size}
        state={state}
      />

      <div className="absolute bottom-4 left-4">
        <Select
          onValueChange={(next) => setState(next as OrbState)}
          value={state}
        >
          <SelectTrigger
            aria-label="Orb state"
            className="w-[8.5rem]"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORB_STATES.map((value) => (
              <SelectItem key={value} value={value}>
                {STATE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        asChild
        className="absolute right-4 bottom-4"
        size="sm"
        sound="click"
      >
        <Link href={`/playground?orb=${slug}&state=${state}`}>
          <span className="sm:hidden">Playground</span>
          <span className="hidden sm:inline">Open in playground</span>
        </Link>
      </Button>
    </div>
  );
};

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
import { ROUTES } from "@/constants/routes";
import { ORB_SLUGS } from "@/lib/orb-slugs";
import { ORBS } from "@/lib/orbs";
import { cn } from "@/lib/utils";

const STATE_LABELS: Record<OrbState, string> = {
  idle: "Idle",
  speaking: "Speaking",
  thinking: "Thinking",
};

export const HomeOrbShowcase = ({ className }: { className?: string }) => {
  const [slug, setSlug] = useState(ORB_SLUGS[0] as string);
  const [state, setState] = useState<OrbState>("idle");

  const { Component, variant } = ORBS[slug] ?? ORBS[ORB_SLUGS[0]];
  const docsHref = `${ROUTES.DOCS_COMPONENTS}/orbs/${slug}`;

  return (
    <div className={cn("flex w-full flex-col gap-4 text-left", className)}>
      <div className="relative flex min-h-[24rem] items-center justify-center overflow-hidden rounded-xl border border-border bg-background p-6 sm:min-h-[28rem]">
        <Component
          ariaLabel={`${variant.label} orb, ${state}`}
          size={300}
          state={state}
        />

        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <Select onValueChange={setSlug} value={slug}>
            <SelectTrigger aria-label="Orb" className="w-[7.5rem]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORB_SLUGS.map((value) => (
                <SelectItem key={value} value={value}>
                  {ORBS[value].variant.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(next) => setState(next as OrbState)}
            value={state}
          >
            <SelectTrigger
              aria-label="Orb state"
              className="w-[8rem]"
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

        <div className="absolute right-4 bottom-4 flex items-center gap-2">
          <Button asChild size="sm" sound="click" variant="outline">
            <Link href={docsHref}>
              <span className="sm:hidden">Docs</span>
              <span className="hidden sm:inline">{variant.label} docs</span>
            </Link>
          </Button>
          <Button asChild size="sm" sound="click">
            <Link href={`${ROUTES.PLAYGROUND}?orb=${slug}&state=${state}`}>
              <span className="sm:hidden">Playground</span>
              <span className="hidden sm:inline">Open in playground</span>
            </Link>
          </Button>
        </div>
      </div>

      {/*
        Every orb links straight to its own docs page; hover or keyboard focus
        loads it into the stage above, so browsing the set never leaves the page.
      */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {ORB_SLUGS.map((value) => (
          <Button
            asChild
            className="h-7 px-2 font-normal text-xs data-[current=true]:bg-accent data-[current=true]:text-accent-foreground"
            data-current={value === slug}
            key={value}
            size="sm"
            variant="ghost"
          >
            <Link
              href={`${ROUTES.DOCS_COMPONENTS}/orbs/${value}`}
              onFocus={() => setSlug(value)}
              onPointerEnter={() => setSlug(value)}
            >
              {ORBS[value].variant.label}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
};

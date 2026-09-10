"use client";

import {
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import type { OrbState, OrbVariant } from "@/components/orbs/canvas";
import { ORB_STATES } from "@/components/orbs/canvas";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { ORB_SLUGS } from "@/lib/orb-slugs";
import { ORBS } from "@/lib/orbs";
import { cn } from "@/lib/utils";

const STATE_LABELS: Record<OrbState, string> = {
  idle: "Idle",
  speaking: "Speaking",
  thinking: "Thinking",
};

/** Where each state's drive sits when auto synthesis is switched off. */
const DRIVE_SEED: Record<OrbState, [number, number]> = {
  idle: [0, 0.3],
  speaking: [0.7, 0.8],
  thinking: [0.4, 0.5],
};

interface StateDraft {
  autoDrive: boolean;
  colors: Record<string, string>;
  input: number;
  output: number;
  params: Record<string, number>;
}

type Drafts = Record<OrbState, StateDraft>;

/** A state's starting point: the orb's own preset for it, then its defaults. */
const draftFromPreset = (variant: OrbVariant, state: OrbState): StateDraft => {
  const params: Record<string, number> = {};
  for (const p of variant.params) {
    params[p.key] = variant.statePresets?.[state]?.[p.key] ?? p.default;
  }

  const colors: Record<string, string> = {};
  for (const c of variant.colors) {
    colors[c.key] = variant.stateColors?.[state]?.[c.key] ?? c.default;
  }

  const [input, output] = DRIVE_SEED[state];
  return { autoDrive: true, colors, input, output, params };
};

const draftsFromPreset = (variant: OrbVariant): Drafts => ({
  idle: draftFromPreset(variant, "idle"),
  speaking: draftFromPreset(variant, "speaking"),
  thinking: draftFromPreset(variant, "thinking"),
});

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));

/** The JSX a user can paste back into their app for the state on screen. */
const buildSnippet = ({
  slug,
  state,
  size,
  draft,
  variant,
}: {
  draft: StateDraft;
  size: number;
  slug: string;
  state: OrbState;
  variant: OrbVariant;
}): string => {
  const component = `Orb${slug.slice(-2)}`;
  const params = variant.params
    .filter(
      (p) =>
        draft.params[p.key] !==
        (variant.statePresets?.[state]?.[p.key] ?? p.default)
    )
    .map((p) => `    ${p.key}: ${formatNumber(draft.params[p.key])},`);
  const colors = variant.colors
    .filter(
      (c) =>
        draft.colors[c.key] !==
        (variant.stateColors?.[state]?.[c.key] ?? c.default)
    )
    .map((c) => `    ${c.key}: "${draft.colors[c.key]}",`);

  const lines = [
    `<${component}`,
    `  size={${size}}`,
    `  state="${state}"`,
    ...(params.length > 0 ? ["  params={{", ...params, "  }}"] : []),
    ...(colors.length > 0 ? ["  colors={{", ...colors, "  }}"] : []),
    ...(draft.autoDrive
      ? []
      : [
          `  volumes={{ input: ${formatNumber(draft.input)}, output: ${formatNumber(draft.output)} }}`,
        ]),
    "/>",
  ];

  return `import { ${component} } from "@/components/orbs/${slug}";\n\n${lines.join("\n")}`;
};

interface ConfigPanelProps {
  draft: StateDraft;
  headerClassName?: string;
  onReset: () => void;
  patchDraft: (patch: Partial<StateDraft>) => void;
  setSize: (next: number) => void;
  size: number;
  variant: OrbVariant;
}

/** Shared by the desktop aside and the mobile sheet. */
const ConfigPanel = ({
  draft,
  headerClassName,
  onReset,
  patchDraft,
  setSize,
  size,
  variant,
}: ConfigPanelProps) => (
  <>
    <div
      className={cn(
        "bg-card flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3",
        headerClassName
      )}
    >
      <span className="text-sm font-medium">{variant.label}</span>
      <Button onClick={onReset} size="sm" sound="click" variant="ghost">
        <RotateCcwIcon />
        Reset
      </Button>
    </div>
    <div className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto">
      <div className="flex flex-col gap-2 p-4 text-xs">
        <span className="flex items-center justify-between">
          <span className="text-muted-foreground">Size</span>
          <span className="tabular-nums">{size}px</span>
        </span>
        <Slider
          max={720}
          min={120}
          onValueChange={([next]) => setSize(next)}
          step={10}
          value={[size]}
        />
      </div>

      {variant.colors.length > 0 && (
        <div className="flex flex-col gap-3 p-4">
          <span className="text-muted-foreground text-xs">Colors</span>
          {variant.colors.map((c) => (
            <label
              className="flex items-center justify-between gap-3 text-xs"
              key={c.key}
            >
              <span>{c.label}</span>
              <input
                className="size-7 cursor-pointer rounded border bg-transparent"
                onChange={(event) =>
                  patchDraft({
                    colors: {
                      ...draft.colors,
                      [c.key]: event.target.value,
                    },
                  })
                }
                type="color"
                value={draft.colors[c.key]}
              />
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 p-4">
        <span className="text-muted-foreground text-xs">Drive</span>
        <Button
          onClick={() => patchDraft({ autoDrive: !draft.autoDrive })}
          size="sm"
          sound="click"
          variant={draft.autoDrive ? "secondary" : "outline"}
        >
          {draft.autoDrive ? "Auto volumes" : "Manual volumes"}
        </Button>
        {!draft.autoDrive && (
          <>
            <div className="flex flex-col gap-2 text-xs">
              <span className="flex items-center justify-between">
                <span>Input</span>
                <span className="tabular-nums">
                  {formatNumber(draft.input)}
                </span>
              </span>
              <Slider
                max={1}
                min={0}
                onValueChange={([next]) => patchDraft({ input: next })}
                step={0.01}
                value={[draft.input]}
              />
            </div>
            <div className="flex flex-col gap-2 text-xs">
              <span className="flex items-center justify-between">
                <span>Output</span>
                <span className="tabular-nums">
                  {formatNumber(draft.output)}
                </span>
              </span>
              <Slider
                max={1}
                min={0}
                onValueChange={([next]) => patchDraft({ output: next })}
                step={0.01}
                value={[draft.output]}
              />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <span className="text-muted-foreground text-xs">Params</span>
        {variant.params.map((p) => (
          <div className="flex flex-col gap-2 text-xs" key={p.key}>
            <span className="flex items-center justify-between">
              <span>{p.label}</span>
              <span className="tabular-nums">
                {formatNumber(draft.params[p.key])}
              </span>
            </span>
            <Slider
              max={p.max}
              min={p.min}
              onValueChange={([next]) =>
                patchDraft({
                  params: { ...draft.params, [p.key]: next },
                })
              }
              step={p.step}
              value={[draft.params[p.key]]}
            />
          </div>
        ))}
      </div>
    </div>
  </>
);

export const OrbPlayground = ({
  initialSlug,
  initialState,
}: {
  initialSlug: string;
  initialState: OrbState;
}) => {
  const router = useRouter();
  const [slug, setSlug] = useState(initialSlug);
  const [state, setState] = useState<OrbState>(initialState);
  const [size, setSize] = useState(420);
  const [paused, setPaused] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  /* 420px overflows a phone, so the first client paint fits it to the screen. */
  useEffect(() => {
    setSize((prev) => Math.max(120, Math.min(prev, window.innerWidth - 96)));
  }, []);

  const entry = ORBS[slug] ?? ORBS[ORB_SLUGS[0]];
  const { Component, variant } = entry;
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFromPreset(variant));
  const draft = drafts[state];

  /*
    Drafts are only meaningful against the schema that built them, so switching
    orbs rebuilds all three from that orb's presets rather than carrying values
    across param sets that do not line up.
  */
  const selectOrb = useCallback(
    (next: string) => {
      const nextVariant = ORBS[next]?.variant;
      if (!nextVariant) {
        return;
      }

      setSlug(next);
      setDrafts(draftsFromPreset(nextVariant));
      router.replace(`/playground?orb=${next}&state=${state}`, {
        scroll: false,
      });
    },
    [router, state]
  );

  const selectState = useCallback(
    (next: OrbState) => {
      setState(next);
      router.replace(`/playground?orb=${slug}&state=${next}`, {
        scroll: false,
      });
    },
    [router, slug]
  );

  const patchDraft = useCallback(
    (patch: Partial<StateDraft>) => {
      setDrafts((prev) => ({ ...prev, [state]: { ...prev[state], ...patch } }));
    },
    [state]
  );

  const snippet = useMemo(
    () => buildSnippet({ draft, size, slug, state, variant }),
    [draft, size, slug, state, variant]
  );

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="border-border bg-background relative flex h-full min-h-0 items-center justify-center overflow-hidden rounded-xl border">
        <Component
          ariaLabel={`${slug} orb, ${state}`}
          colors={draft.colors}
          params={draft.params}
          paused={paused}
          size={size}
          state={state}
          volumes={
            draft.autoDrive
              ? undefined
              : { input: draft.input, output: draft.output }
          }
        />

        <Sheet onOpenChange={setPanelOpen} open={panelOpen}>
          <SheetTrigger asChild>
            <Button
              className="absolute top-3 right-3 shadow-sm lg:hidden"
              size="sm"
              sound="click"
              variant="outline"
            >
              <SlidersHorizontalIcon />
              Customize
            </Button>
          </SheetTrigger>
          <SheetContent
            className="flex w-screen max-w-none flex-col gap-0 p-0"
            closeClassName="top-3 right-4 flex size-8 items-center justify-center rounded-md opacity-100 hover:bg-accent"
            side="right"
          >
            <SheetTitle className="sr-only">
              {variant.label} controls
            </SheetTitle>
            <ConfigPanel
              draft={draft}
              headerClassName="pr-14"
              onReset={() => setDrafts(draftsFromPreset(variant))}
              patchDraft={patchDraft}
              setSize={setSize}
              size={size}
              variant={variant}
            />
          </SheetContent>
        </Sheet>

        <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 lg:inset-x-4 lg:bottom-4">
          <Select onValueChange={selectOrb} value={slug}>
            <SelectTrigger aria-label="Orb" className="w-26 lg:w-30" size="sm">
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
            onValueChange={(next) => selectState(next as OrbState)}
            value={state}
          >
            <SelectTrigger
              aria-label="Orb state"
              className="w-26 lg:w-34"
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

          <div className="ml-auto flex items-center gap-2">
            <Button
              aria-label={paused ? "Play" : "Pause"}
              className="max-sm:w-8"
              onClick={() => setPaused((prev) => !prev)}
              size="sm"
              sound="click"
              variant="outline"
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
              <span className="hidden sm:inline">
                {paused ? "Play" : "Pause"}
              </span>
            </Button>
            <CopyButton
              className="max-sm:w-8"
              size="sm"
              value={snippet}
              variant="default"
            >
              <span className="hidden sm:inline">Copy JSX</span>
            </CopyButton>
          </div>
        </div>
      </div>

      <aside className="hidden h-full min-h-0 flex-col overflow-hidden rounded-xl border lg:flex">
        <ConfigPanel
          draft={draft}
          onReset={() => setDrafts(draftsFromPreset(variant))}
          patchDraft={patchDraft}
          setSize={setSize}
          size={size}
          variant={variant}
        />
      </aside>
    </div>
  );
};

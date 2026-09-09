"use client";

import { PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import type { OrbState, OrbVariant } from "@/components/orbs/orbkit-core-wgpu";
import { ORB_STATES } from "@/components/orbs/orbkit-core-wgpu";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ORB_SLUGS } from "@/lib/orb-slugs";
import { ORBS } from "@/lib/orbs";

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-4">
        <div className="relative flex min-h-[32rem] items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-white p-6">
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

          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <Select onValueChange={selectOrb} value={slug}>
              <SelectTrigger
                aria-label="Orb"
                className="w-[7.5rem] border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50 dark:bg-white dark:hover:bg-neutral-50"
                size="sm"
              >
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
                className="w-[8.5rem] border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50 dark:bg-white dark:hover:bg-neutral-50"
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
            <Button
              className="border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50 dark:bg-white dark:hover:bg-neutral-50"
              onClick={() => setPaused((prev) => !prev)}
              size="sm"
              sound="click"
              variant="outline"
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
              {paused ? "Play" : "Pause"}
            </Button>
            <CopyButton size="sm" value={snippet} variant="default">
              Copy JSX
            </CopyButton>
          </div>
        </div>

        <p className="text-muted-foreground text-sm">{variant.note}</p>
      </div>

      <aside className="flex max-h-[42rem] flex-col gap-5 overflow-y-auto rounded-xl border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{variant.label}</h2>
          <Button
            onClick={() => setDrafts(draftsFromPreset(variant))}
            size="sm"
            sound="click"
            variant="ghost"
          >
            <RotateCcwIcon />
            Reset
          </Button>
        </div>

        <div className="flex flex-col gap-2 text-xs">
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
          <div className="flex flex-col gap-3">
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

        <div className="flex flex-col gap-3">
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

        <div className="flex flex-col gap-3">
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
      </aside>
    </div>
  );
};

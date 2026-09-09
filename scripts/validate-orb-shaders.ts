/**
 * Headless orb shader validation (Dawn via `vgpu/node`).
 *
 * For every `registry/components/orbs/orb-*` variant: assemble the WGSL module the
 * browser runtime would compile, render one frame into an offscreen target, and
 * report compile errors plus whether the frame produced any non-transparent
 * pixels. Run with `bun scripts/validate-orb-shaders.ts [orb-01 orb-07 ...]`.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { effect, frame, init, target } from "vgpu/node";

import type { OrbVariant } from "../registry/components/orbs/orbkit-renderer";
import {
  buildOrbShaderSource,
  orbInitialUniforms,
} from "../registry/components/orbs/orbkit-renderer";

const ORBS_DIR = join(
  import.meta.dirname,
  "..",
  "registry",
  "components",
  "orbs"
);
const SIZE = 192;

const filter = process.argv.slice(2);
const entries = readdirSync(ORBS_DIR, { withFileTypes: true });
const files = entries
  .flatMap((entry) => {
    if (entry.isFile() && /^orb-\d+\.tsx$/.test(entry.name)) {
      return [entry.name];
    }
    if (entry.isDirectory() && /^orb-\d+$/.test(entry.name)) {
      return [join(entry.name, "index.tsx")];
    }
    return [];
  })
  .filter((name) => filter.length === 0 || filter.some((f) => name.includes(f)))
  .toSorted();

const variants: OrbVariant[] = [];
for (const file of files) {
  // Runtime-selected specifier: variant modules are discovered by directory scan.
  const mod: Record<string, unknown> = await import(join(ORBS_DIR, file));
  const variant = Object.values(mod).find(
    (value): value is OrbVariant =>
      typeof value === "object" &&
      value !== null &&
      (typeof (value as OrbVariant).frag === "string" ||
        typeof (value as OrbVariant).shader === "string")
  );
  if (!variant) {
    console.error(`${file}: no OrbVariant export`);
    process.exitCode = 1;
    continue;
  }
  variants.push(variant);
}

const gpu = await init();
const canvas = target(gpu, { size: [SIZE, SIZE] });
const failures: string[] = [];

for (const variant of variants) {
  const source = buildOrbShaderSource(variant);
  try {
    const fx = effect(gpu, source, {
      label: variant.key,
      set: { params: orbInitialUniforms(variant, [SIZE, SIZE]) },
    });
    await fx.compile(canvas);
    frame(gpu, (f) => f.pass(canvas, fx));
    await gpu.gpu.queue.onSubmittedWorkDone();
    const pixels = await canvas.read();
    // Emitted light only: the target clears to opaque black, so a shader that
    // writes nothing leaves every color channel at zero.
    let lit = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 8 || pixels[i + 1] > 8 || pixels[i + 2] > 8) {
        lit += 1;
      }
    }
    const coverage = lit / (SIZE * SIZE);
    if (coverage < 0.01) {
      failures.push(`${variant.key}: compiled but blank frame`);
      console.error(`FAIL ${variant.key}: blank frame`);
    } else {
      console.log(
        `ok   ${variant.key} (coverage ${(coverage * 100).toFixed(1)}%)`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${variant.key}: ${message}`);
    console.error(`FAIL ${variant.key}\n${message}\n`);
  }
}

gpu.dispose();

if (failures.length > 0) {
  console.error(`\n${failures.length}/${variants.length} orb shaders failed`);
  process.exitCode = 1;
} else {
  console.log(`\nall ${variants.length} orb shaders render`);
}

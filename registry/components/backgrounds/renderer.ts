import { d } from "typegpu";
import type { Effect, Gpu } from "vgpu";
import { clock, effect, frameLoop, init, surface, Uniform } from "vgpu";

/* ---------------------------------- schema --------------------------------- */

export interface BackgroundBaseUniforms {
  time: d.F32;
  anim: d.F32;
  res: d.Vec2f;
}

export type BackgroundUniformStruct = d.WgslStruct<
  BackgroundBaseUniforms & Record<string, d.AnyWgslData>
>;

export interface BackgroundParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  integrate?: boolean;
}

export interface BackgroundColorDef {
  key: string;
  label: string;
  default: string;
}

export interface BackgroundVariant {
  key: string;
  label: string;
  note: string;
  shader: string;
  uniforms: BackgroundUniformStruct;
  params: BackgroundParamDef[];
  colors: BackgroundColorDef[];
  presets?: Record<
    string,
    {
      params?: Record<string, number>;
      colors?: Record<string, string>;
    }
  >;
}

export type BackgroundParamValues = Partial<Record<string, number>>;
export type BackgroundColorValues = Partial<Record<string, string>>;

export interface BackgroundDrive {
  preset?: string;
  params?: BackgroundParamValues;
  colors?: BackgroundColorValues;
  paused?: boolean;
}

export const defaultBackgroundValuesFor = (
  variant: BackgroundVariant
): {
  params: Record<string, number>;
  colors: Record<string, string>;
} => {
  const params: Record<string, number> = {};
  for (const p of variant.params) {
    params[p.key] = p.default;
  }

  const colors: Record<string, string> = {};
  for (const c of variant.colors) {
    colors[c.key] = c.default;
  }

  return { colors, params };
};

const writeHex = (hex: string, out: Float32Array, at: number) => {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const n = Number.parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) {
    out[at] = 1;
    out[at + 1] = 1;
    out[at + 2] = 1;
    return;
  }

  out[at] = Math.floor(n / 0x1_00_00) / 255;
  out[at + 1] = (Math.floor(n / 0x1_00) % 256) / 255;
  out[at + 2] = (n % 256) / 255;
};

const colorTarget = new Float32Array(3);

export const hexToRgb = (hex: string): [number, number, number] => {
  writeHex(hex, colorTarget, 0);

  return [colorTarget[0], colorTarget[1], colorTarget[2]];
};

/* -------------------------------- uniforms -------------------------------- */

const F32_BYTES = 4;
const UNIFORM_ALIGN = 16;
const PARAM_EASE = 4;
const MAX_STEP = 0.05;

const floatSlot = (
  schema: BackgroundUniformStruct,
  field: string,
  expected: "f32" | "vec3f",
  label: string
): number => {
  const declared = schema.propTypes[field];
  if (declared?.type !== expected) {
    throw new Error(
      `${label}: uniform struct needs '${field}: ${expected}', found ${declared?.type ?? "nothing"}`
    );
  }

  return d.memoryLayoutOf(schema, (fields) => fields[field]).offset / F32_BYTES;
};

const springOut = { v: 0, x: 0 };
const springStep = (x: number, v: number, target: number, dt: number) => {
  const f = 1 + 2 * dt * PARAM_EASE;
  const hoo = dt * PARAM_EASE * PARAM_EASE;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  springOut.x = (f * x + dt * v + hhoo * target) * detInv;
  springOut.v = (v + hoo * (target - x)) * detInv;
};

/* ---------------------------------- scene ---------------------------------- */

export interface BackgroundScene {
  readonly shader: Effect;
  advance(dt: number, drive: BackgroundDrive): void;
  resize(res: readonly [number, number]): void;
  dispose(): void;
}

export const createBackgroundScene = (
  gpu: Gpu,
  variant: BackgroundVariant,
  res: readonly [number, number]
): BackgroundScene => {
  const schema = variant.uniforms;
  const words = new Float32Array(
    (Math.ceil(d.sizeOf(schema) / UNIFORM_ALIGN) * UNIFORM_ALIGN) / F32_BYTES
  );
  const uniform = new Uniform(gpu.device, {
    label: variant.key,
    size: words.byteLength,
  });
  const shader = effect(gpu, variant.shader, {
    label: variant.key,
    set: { params: uniform },
  });

  const baseSlot = (field: keyof BackgroundBaseUniforms) =>
    d.memoryLayoutOf(schema, (fields) => fields[field]).offset / F32_BYTES;
  const timeSlot = baseSlot("time");
  const animSlot = baseSlot("anim");
  const resSlot = baseSlot("res");

  const paramSlots = new Int32Array(
    variant.params.map((p) =>
      floatSlot(schema, `p_${p.key}`, "f32", variant.key)
    )
  );
  const colorSlots = new Int32Array(
    variant.colors.map((c) =>
      floatSlot(schema, `c_${c.key}`, "vec3f", variant.key)
    )
  );

  const paramCur = new Float32Array(variant.params.length);
  const paramVel = new Float32Array(variant.params.length);
  const paramClock = new Float32Array(variant.params.length);
  const colorVel = new Float32Array(variant.colors.length * 3);

  for (let i = 0; i < variant.params.length; i += 1) {
    const def = variant.params[i];
    paramCur[i] = def.default;
    if (def.integrate) {
      paramClock[i] = 0;
      words[paramSlots[i]] = paramClock[i];
    } else {
      words[paramSlots[i]] = def.default;
    }
  }
  for (let i = 0; i < variant.colors.length; i += 1) {
    writeHex(variant.colors[i].default, words, colorSlots[i]);
  }

  let seconds = 0;
  let anim = 0;
  const [initialWidth, initialHeight] = res;
  words[resSlot] = initialWidth;
  words[resSlot + 1] = initialHeight;
  uniform.write(words);

  const stepParams = (dt: number, live: BackgroundDrive) => {
    const activePreset = live.preset
      ? variant.presets?.[live.preset]
      : undefined;

    for (let i = 0; i < variant.params.length; i += 1) {
      const def = variant.params[i];
      const explicit = live.params?.[def.key];
      const target = Math.min(
        def.max,
        Math.max(
          def.min,
          typeof explicit === "number"
            ? explicit
            : (activePreset?.params?.[def.key] ?? def.default)
        )
      );

      springStep(paramCur[i], paramVel[i], target, dt);
      paramCur[i] = springOut.x;
      paramVel[i] = springOut.v;

      if (def.integrate) {
        paramClock[i] += dt * springOut.x;
        words[paramSlots[i]] = paramClock[i];
      } else {
        words[paramSlots[i]] = springOut.x;
      }
    }
  };

  const stepColors = (dt: number, live: BackgroundDrive) => {
    const activePreset = live.preset
      ? variant.presets?.[live.preset]
      : undefined;

    for (let i = 0; i < variant.colors.length; i += 1) {
      const def = variant.colors[i];
      const at = colorSlots[i];
      writeHex(
        live.colors?.[def.key] ??
          activePreset?.colors?.[def.key] ??
          def.default,
        colorTarget,
        0
      );
      for (let channel = 0; channel < 3; channel += 1) {
        const velAt = i * 3 + channel;
        springStep(
          words[at + channel],
          colorVel[velAt],
          colorTarget[channel],
          dt
        );
        words[at + channel] = springOut.x;
        colorVel[velAt] = springOut.v;
      }
    }
  };

  return {
    advance(dt, live) {
      seconds += dt;
      anim += dt;
      words[timeSlot] = seconds;
      words[animSlot] = anim;
      stepParams(dt, live);
      stepColors(dt, live);
      uniform.write(words);
    },
    dispose() {
      uniform.destroy();
    },
    resize(next) {
      const [width, height] = next;
      words[resSlot] = width;
      words[resSlot + 1] = height;
      uniform.write(words);
    },
    shader,
  };
};

/* --------------------------------- renderer -------------------------------- */

export interface BackgroundRendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly variant: BackgroundVariant;
  readonly drive: () => BackgroundDrive;
  readonly maxDpr?: number;
  readonly pauseOffscreen?: boolean;
  readonly onFirstFrame?: () => void;
}

export const createBackgroundRenderer = ({
  canvas,
  variant,
  drive,
  maxDpr = 2,
  pauseOffscreen = true,
  onFirstFrame,
}: BackgroundRendererOptions) => {
  let disposed = false;
  let gpu: Gpu | undefined;
  let loop: { stop(): void } | undefined;
  let unsubscribeResize: (() => void) | undefined;
  let observer: IntersectionObserver | undefined;
  let visible = true;

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    observer?.disconnect();
    unsubscribeResize?.();
    loop?.stop();
    gpu?.dispose();
  };

  const ready = (async () => {
    const nextGpu = await init();
    if (disposed) {
      nextGpu.dispose();
      return;
    }

    gpu = nextGpu;
    try {
      const output = surface(gpu, canvas, { dpr: [1, maxDpr] });
      const timeline = clock(gpu);
      const scene = createBackgroundScene(gpu, variant, output.size);
      unsubscribeResize = output.onResize(() => scene.resize(output.size));

      if (pauseOffscreen && typeof IntersectionObserver !== "undefined") {
        observer = new IntersectionObserver((entries) => {
          visible = entries.some((entry) => entry.isIntersecting);
        });
        observer.observe(canvas);
      }

      let painted = false;
      loop = frameLoop(gpu, (frame) => {
        const live = drive();
        if (painted && (live.paused || !visible)) {
          return;
        }

        scene.advance(
          painted ? Math.min(timeline.deltaTime, MAX_STEP) : 0,
          live
        );
        frame.pass(output, scene.shader);

        if (!painted) {
          painted = true;
          onFirstFrame?.();
        }
      });
    } catch (error) {
      dispose();
      throw error;
    }
  })();

  return { dispose, ready };
};

import { d } from "typegpu";
import type { Effect, Gpu } from "vgpu";
import { clock, effect, frameLoop, init, surface, Uniform } from "vgpu";

/* ---------------------------------- schema --------------------------------- */

export type OrbState = "idle" | "thinking" | "speaking";

export const ORB_STATES = ["idle", "thinking", "speaking"] as const;

/**
 * Fields every orb struct declares, and the types the scene writes them as. A
 * variant that omits one — or types it differently — fails to typecheck against
 * {@link OrbUniformStruct}.
 */
export interface OrbBaseUniforms {
  time: d.F32;
  anim: d.F32;
  inputVol: d.F32;
  outputVol: d.F32;
  res: d.Vec2f;
  mouse: d.Vec2f;
}

/**
 * The TypeGPU struct a variant binds at `@group(0) @binding(0)` as `params`:
 * {@link OrbBaseUniforms} plus one `p_<param>: f32` and `c_<colour>: vec3f` per
 * entry of the variant's `params` / `colors`. Both sides of the wire read it —
 * the shader through its bind group layout, the scene through
 * {@link d.memoryLayoutOf} to place each field's bytes.
 */
export type OrbUniformStruct = d.WgslStruct<
  OrbBaseUniforms & Record<string, d.AnyWgslData>
>;

export interface OrbParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Integrated as a clock instead of eased, for shaders that read a phase. */
  integrate?: boolean;
}

export interface OrbColorDef {
  key: string;
  label: string;
  default: string;
}

export interface OrbVariant {
  key: string;
  label: string;
  note: string;
  /** Fully resolved WGSL from TypeGPU (`tgpu.resolve`). */
  shader: string;
  /**
   * The variant's uniform struct. Param `foo` lives in `p_foo: f32`, colour
   * `bar` in `c_bar: vec3f`, alongside {@link OrbBaseUniforms}.
   */
  uniforms: OrbUniformStruct;
  params: OrbParamDef[];
  colors: OrbColorDef[];
  statePresets?: Partial<Record<OrbState, Record<string, number>>>;
  stateColors?: Partial<Record<OrbState, Record<string, string>>>;
}

export type OrbParamValues = Partial<Record<string, number>>;
export type OrbColorValues = Partial<Record<string, string>>;

/** Everything the loop reads each frame — the caller owns it and may mutate it. */
export interface OrbDrive {
  state: OrbState;
  params?: OrbParamValues;
  colors?: OrbColorValues;
  statePresets?: Partial<Record<OrbState, Record<string, number>>>;
  stateColors?: Partial<Record<OrbState, Record<string, string>>>;
  stateVolumes?: Partial<Record<OrbState, { input?: number; output?: number }>>;
  volumes?: { input?: number; output?: number };
  paused?: boolean;
}

export const defaultValuesFor = (
  variant: OrbVariant
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

/** Writes `hex` as three 0..1 floats at `out[at]`, falling back to white. */
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

/** Shared decode cell: colour targets are read once per colour per frame. */
const colorTarget = new Float32Array(3);

export const hexToRgb = (hex: string): [number, number, number] => {
  writeHex(hex, colorTarget, 0);

  return [colorTarget[0], colorTarget[1], colorTarget[2]];
};

/* -------------------------------- uniforms -------------------------------- */

const F32_BYTES = 4;

/**
 * WGSL rounds a struct in the uniform address space up to a 16-byte multiple, so
 * the buffer must be that large even when the fields stop earlier — a
 * `d.sizeOf()`-sized buffer trips the pipeline's `minBindingSize`.
 */
const UNIFORM_ALIGN = 16;

/** Bytes to allocate for `schema` bound as a uniform. */
const uniformBytes = (schema: OrbUniformStruct) =>
  Math.ceil(d.sizeOf(schema) / UNIFORM_ALIGN) * UNIFORM_ALIGN;

/**
 * Index of a variant-declared field's first float in the struct's byte image.
 * The `p_`/`c_` fields are named after runtime data, so they are the one part of
 * the layout the compiler cannot check: assert presence and type here instead.
 */
const floatSlot = (
  schema: OrbUniformStruct,
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

/* ---------------------------------- drive ---------------------------------- */

const PARAM_EASE = 4;
const VOLUME_EASE = 12;
const MAX_STEP = 0.05;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Where a state's synthesized [input, output] volumes sit at `t` seconds. */
const targetVolumes = (state: OrbState, t: number): [number, number] => {
  if (state === "speaking") {
    return [
      clamp01(0.65 + Math.sin(t * 4.8) * 0.22),
      clamp01(0.75 + Math.sin(t * 3.6) * 0.22),
    ];
  }

  if (state === "thinking") {
    const base = 0.38 + 0.07 * Math.sin(t * 0.7);
    const wander = 0.05 * Math.sin(t * 2.1) * Math.sin(t * 0.37 + 1.2);
    return [
      clamp01(base + wander),
      clamp01(0.48 + 0.12 * Math.sin(t * 1.05 + 0.6)),
    ];
  }

  return [0, 0.3];
};

/**
 * Semi-implicit spring step. Both outputs land in this shared cell rather than a
 * fresh object: it runs once per param per frame.
 */
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

export interface OrbScene {
  readonly shader: Effect;
  /** Eases one step toward `drive` and writes the frame's uniforms. */
  advance(dt: number, drive: OrbDrive): void;
  resize(res: readonly [number, number]): void;
  dispose(): void;
}

/**
 * One orb: its compiled effect plus the eased snapshot of every param and colour.
 * Swapping states retargets the springs, so transitions are continuous.
 *
 * The variant's TypeGPU struct is the single source of truth for the uniform
 * bytes: field offsets are resolved once, then every frame writes floats into one
 * reused image and uploads it with a single `writeBuffer`.
 */
export const createOrbScene = (
  gpu: Gpu,
  variant: OrbVariant,
  res: readonly [number, number],
  drive: OrbDrive
): OrbScene => {
  const schema = variant.uniforms;
  const words = new Float32Array(uniformBytes(schema) / F32_BYTES);
  const uniform = new Uniform(gpu.device, {
    label: variant.key,
    size: words.byteLength,
  });
  const shader = effect(gpu, variant.shader, {
    label: variant.key,
    set: { params: uniform },
  });

  // Base fields are part of OrbUniformStruct, so the compiler resolves them.
  const baseSlot = (field: keyof OrbBaseUniforms) =>
    d.memoryLayoutOf(schema, (fields) => fields[field]).offset / F32_BYTES;
  const timeSlot = baseSlot("time");
  const animSlot = baseSlot("anim");
  const inputSlot = baseSlot("inputVol");
  const outputSlot = baseSlot("outputVol");
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

  // Colour state lives in `words` itself; only the springs' velocities are aside.
  const paramCur = new Float32Array(variant.params.length);
  const paramVel = new Float32Array(variant.params.length);
  // Integrated params carry their own phase, seeded apart so instances desync.
  const paramClock = new Float32Array(variant.params.length);
  const colorVel = new Float32Array(variant.colors.length * 3);

  for (let i = 0; i < variant.params.length; i += 1) {
    const def = variant.params[i];
    paramCur[i] = def.default;
    if (def.integrate) {
      paramClock[i] = Math.random() * 100;
      words[paramSlots[i]] = paramClock[i];
    } else {
      words[paramSlots[i]] = def.default;
    }
  }
  for (let i = 0; i < variant.colors.length; i += 1) {
    writeHex(variant.colors[i].default, words, colorSlots[i]);
  }

  const [restingIn, restingOut] = targetVolumes(drive.state, 0);
  const volume = { in: restingIn, out: restingOut };
  let seconds = 0;
  let anim = Math.random() * 100;
  let speed = 0.1;
  let speedVel = 0;

  words[inputSlot] = volume.in;
  words[outputSlot] = volume.out;
  words[animSlot] = anim;
  const [initialWidth, initialHeight] = res;
  words[resSlot] = initialWidth;
  words[resSlot + 1] = initialHeight;
  uniform.write(words);

  /** Volumes and the shared flow clock: the two signals every shader reads. */
  const stepDrive = (dt: number, live: OrbDrive) => {
    const [synthIn, synthOut] = targetVolumes(live.state, seconds);
    const stateVolume = live.stateVolumes?.[live.state];
    const targetIn = live.volumes?.input ?? stateVolume?.input ?? synthIn;
    const targetOut = live.volumes?.output ?? stateVolume?.output ?? synthOut;
    const kVol = 1 - Math.exp(-dt * VOLUME_EASE);
    volume.in += (targetIn - volume.in) * kVol;
    volume.out += (targetOut - volume.out) * kVol;

    // Loud output runs the flow clock faster.
    springStep(speed, speedVel, 0.1 + (1 - (volume.out - 1) ** 2) * 0.9, dt);
    speed = springOut.x;
    speedVel = springOut.v;
    anim += dt * speed;

    words[timeSlot] = seconds * 0.5;
    words[animSlot] = anim;
    words[inputSlot] = volume.in;
    words[outputSlot] = volume.out;
  };

  const stepParams = (dt: number, live: OrbDrive) => {
    const preset =
      live.statePresets?.[live.state] ?? variant.statePresets?.[live.state];

    for (let i = 0; i < variant.params.length; i += 1) {
      const def = variant.params[i];
      const explicit = live.params?.[def.key];
      const target =
        typeof explicit === "number"
          ? explicit
          : (preset?.[def.key] ?? def.default);

      springStep(paramCur[i], paramVel[i], target, dt);
      paramCur[i] = springOut.x;
      paramVel[i] = springOut.v;

      if (def.integrate) {
        paramClock[i] += dt * speed * springOut.x;
        words[paramSlots[i]] = paramClock[i];
      } else {
        words[paramSlots[i]] = springOut.x;
      }
    }
  };

  const stepColors = (dt: number, live: OrbDrive) => {
    const stateColor =
      live.stateColors?.[live.state] ?? variant.stateColors?.[live.state];

    for (let i = 0; i < variant.colors.length; i += 1) {
      const def = variant.colors[i];
      const at = colorSlots[i];
      writeHex(
        live.colors?.[def.key] ?? stateColor?.[def.key] ?? def.default,
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
      stepDrive(dt, live);
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

export interface OrbRendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly variant: OrbVariant;
  /** Read once per frame, so the caller can mutate its drive in place. */
  readonly drive: () => OrbDrive;
  readonly maxDpr?: number;
  /** Skip frames while the canvas is scrolled out of view. */
  readonly pauseOffscreen?: boolean;
  readonly onFirstFrame?: () => void;
}

/**
 * Owns one WebGPU device for one canvas: surface, scene, and frame loop. `ready`
 * rejects when initialization fails; `dispose` is idempotent and safe mid-init.
 */
export const createOrbRenderer = ({
  canvas,
  variant,
  drive,
  maxDpr = 2,
  pauseOffscreen = true,
  onFirstFrame,
}: OrbRendererOptions) => {
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
      const scene = createOrbScene(gpu, variant, output.size, drive());
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
        if (live.paused || !visible) {
          return;
        }

        scene.advance(Math.min(timeline.deltaTime, MAX_STEP), live);
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

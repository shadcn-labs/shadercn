import type { Effect, Gpu, Surface } from "vgpu";
import { clock, effect, frameLoop, init, surface } from "vgpu";

/* ---------------------------------- schema --------------------------------- */

export type OrbState = "idle" | "thinking" | "speaking";

export const ORB_STATES = ["idle", "thinking", "speaking"] as const;

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
  /** Module-scope WGSL defining `orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f`. */
  frag: string;
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

export function defaultValuesFor(variant: OrbVariant): {
  params: Record<string, number>;
  colors: Record<string, string>;
} {
  const params: Record<string, number> = {};
  for (const p of variant.params) {
    params[p.key] = p.default;
  }

  const colors: Record<string, string> = {};
  for (const c of variant.colors) {
    colors[c.key] = c.default;
  }

  return { colors, params };
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const n = Number.parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) {
    return [1, 1, 1];
  }

  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* -------------------------------- WGSL module ------------------------------- */

/** Noise, fbm, tanh, and screen-space helpers prepended to every orb shader. */
export const ORB_WGSL_HELPERS = /* wgsl */ `
fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let ff = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), ff.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), ff.x),
    ff.y
  );
}

fn fbm(p_in: vec2f) -> f32 {
  var p = p_in;
  var v = 0.0;
  var a = 0.5;
  for (var i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(11.7, 7.3);
    a *= 0.5;
  }
  return v;
}

fn tanh3(x: vec3f) -> vec3f {
  let clamped = clamp(x, vec3f(-10.0), vec3f(10.0));
  let e = exp(2.0 * clamped);
  return (e - 1.0) / (e + 1.0);
}

fn tanh1(x_in: f32) -> f32 {
  let x = clamp(x_in, -10.0, 10.0);
  let e = exp(2.0 * x);
  return (e - 1.0) / (e + 1.0);
}

/** Fragment position in device pixels, published by fs_main before orbMain runs. */
var<private> gFragCoord: vec2f;

fn orbUV() -> vec2f {
  let res = params.res;
  return (2.0 * gFragCoord - res) / min(res.x, res.y);
}
`;

/**
 * Uniform accessors the orb bodies are written against, mapped onto the generated
 * `Params` fields. WGSL has no value aliases, so every `uX` / `uP_*` / `uC_*`
 * identifier is rewritten to a `params.<field>` member reference.
 */
const FIXED_UNIFORM_FIELDS: Record<string, string> = {
  uAnim: "anim",
  uInput: "inputVol",
  uMouse: "mouse",
  uOutput: "outputVol",
  uRes: "res",
  uTime: "time",
};

const BASE_STRUCT_FIELDS = [
  "time: f32",
  "anim: f32",
  "inputVol: f32",
  "outputVol: f32",
  "res: vec2f",
  "mouse: vec2f",
];

/**
 * Assembles a variant into one WGSL module: the `Params` uniform block, the shared
 * helpers, the variant body, and the fragment entry point. `effect()` generates the
 * fullscreen vertex stage.
 */
export function buildOrbShaderSource(variant: OrbVariant): string {
  // Param and color keys share one variant namespace but not the struct's:
  // `p_`/`c_` prefixes keep a param and a color of the same name apart.
  const fields: Record<string, string> = { ...FIXED_UNIFORM_FIELDS };
  for (const p of variant.params) {
    fields[`uP_${p.key}`] = `p_${p.key}`;
  }
  for (const c of variant.colors) {
    fields[`uC_${c.key}`] = `c_${c.key}`;
  }

  // Unknown `uX` identifiers are left alone so the WGSL compiler names them.
  const bindUniforms = (wgsl: string) =>
    wgsl.replaceAll(/\bu[A-Z][A-Za-z0-9_]*\b/g, (name) => {
      const field = fields[name];
      return field ? `params.${field}` : name;
    });

  const structFields = [
    ...BASE_STRUCT_FIELDS,
    ...variant.params.map((p) => `p_${p.key}: f32`),
    ...variant.colors.map((c) => `c_${c.key}: vec3f`),
  ];

  return `struct Params {
  ${structFields.join(",\n  ")}
}

@group(0) @binding(0) var<uniform> params: Params;
${ORB_WGSL_HELPERS}
${bindUniforms(variant.frag)}

@fragment
fn fs_main(@location(0) screenUV: vec2f) -> @location(0) vec4f {
  gFragCoord = screenUV * params.res;
  return orbMain(gFragCoord, orbUV());
}
`;
}

/** Initial uniform values for a variant: defaults, resting volumes, and target size. */
export function orbInitialUniforms(
  variant: OrbVariant,
  res: readonly [number, number]
): Record<string, unknown> {
  const values: Record<string, unknown> = {
    anim: 0,
    inputVol: 0,
    mouse: [0, 0],
    outputVol: 0.3,
    res,
    time: 0,
  };
  for (const p of variant.params) {
    values[`p_${p.key}`] = p.default;
  }
  for (const c of variant.colors) {
    values[`c_${c.key}`] = hexToRgb(c.default);
  }

  return values;
}

/* ---------------------------------- drive ---------------------------------- */

const PARAM_EASE = 4;
const VOLUME_EASE = 12;
const MAX_STEP = 0.05;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Where a state's synthesized [input, output] volumes sit at `t` seconds. */
function targetVolumes(state: OrbState, t: number): [number, number] {
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
}

/**
 * Semi-implicit spring step. Both outputs land in this shared cell rather than a
 * fresh object: it runs once per param per frame.
 */
const springOut = { v: 0, x: 0 };
function springStep(x: number, v: number, target: number, dt: number) {
  const f = 1 + 2 * dt * PARAM_EASE;
  const hoo = dt * PARAM_EASE * PARAM_EASE;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  springOut.x = (f * x + dt * v + hhoo * target) * detInv;
  springOut.v = (v + hoo * (target - x)) * detInv;
}

/* ---------------------------------- scene ---------------------------------- */

export interface OrbScene {
  readonly shader: Effect;
  /** Eases one step toward `drive` and writes the frame's uniforms. */
  advance(dt: number, drive: OrbDrive): void;
  resize(res: readonly [number, number]): void;
}

/**
 * One orb: its compiled effect plus the eased snapshot of every param and colour.
 * Swapping states retargets the springs, so transitions are continuous.
 */
export function createOrbScene(
  gpu: Gpu,
  variant: OrbVariant,
  output: Surface,
  drive: OrbDrive
): OrbScene {
  const shader = effect(gpu, buildOrbShaderSource(variant), {
    label: variant.key,
    set: { params: orbInitialUniforms(variant, output.size) },
  });

  const paramCur: Record<string, number> = {};
  const paramVel: Record<string, number> = {};
  // Integrated params carry their own phase, seeded apart so instances desync.
  const paramClocks: Record<string, number> = {};
  const colorCur: Record<string, [number, number, number]> = {};
  const colorVel: Record<string, [number, number, number]> = {};

  for (const p of variant.params) {
    paramCur[p.key] = p.default;
    paramVel[p.key] = 0;
    if (p.integrate) {
      paramClocks[p.key] = Math.random() * 100;
    }
  }
  for (const c of variant.colors) {
    colorCur[c.key] = hexToRgb(c.default);
    colorVel[c.key] = [0, 0, 0];
  }

  const [restingIn, restingOut] = targetVolumes(drive.state, 0);
  const volume = { in: restingIn, out: restingOut };
  let seconds = 0;
  let anim = Math.random() * 100;
  let speed = 0.1;
  let speedVel = 0;

  // Reused across frames: `set()` reads it synchronously.
  const uniforms: Record<string, unknown> = {};

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

    uniforms.time = seconds * 0.5;
    uniforms.anim = anim;
    uniforms.inputVol = volume.in;
    uniforms.outputVol = volume.out;
  };

  const stepParams = (dt: number, live: OrbDrive) => {
    const preset =
      live.statePresets?.[live.state] ?? variant.statePresets?.[live.state];

    for (const def of variant.params) {
      const explicit = live.params?.[def.key];
      const target =
        typeof explicit === "number"
          ? explicit
          : (preset?.[def.key] ?? def.default);

      springStep(paramCur[def.key], paramVel[def.key], target, dt);
      paramCur[def.key] = springOut.x;
      paramVel[def.key] = springOut.v;

      if (def.integrate) {
        paramClocks[def.key] += dt * speed * springOut.x;
        uniforms[`p_${def.key}`] = paramClocks[def.key];
      } else {
        uniforms[`p_${def.key}`] = springOut.x;
      }
    }
  };

  const stepColors = (dt: number, live: OrbDrive) => {
    const stateColor =
      live.stateColors?.[live.state] ?? variant.stateColors?.[live.state];

    for (const def of variant.colors) {
      const target = hexToRgb(
        live.colors?.[def.key] ?? stateColor?.[def.key] ?? def.default
      );
      const cur = colorCur[def.key];
      const vel = colorVel[def.key];
      for (let i = 0; i < 3; i += 1) {
        springStep(cur[i], vel[i], target[i], dt);
        cur[i] = springOut.x;
        vel[i] = springOut.v;
      }
      uniforms[`c_${def.key}`] = cur;
    }
  };

  return {
    advance(dt, live) {
      seconds += dt;
      stepDrive(dt, live);
      stepParams(dt, live);
      stepColors(dt, live);
      shader.set({ params: uniforms });
    },
    resize(res) {
      shader.set({ params: { res } });
    },
    shader,
  };
}

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
export function createOrbRenderer({
  canvas,
  variant,
  drive,
  maxDpr = 2,
  pauseOffscreen = true,
  onFirstFrame,
}: OrbRendererOptions) {
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
      const scene = createOrbScene(gpu, variant, output, drive());
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
}

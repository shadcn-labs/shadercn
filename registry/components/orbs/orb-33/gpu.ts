import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

const Params = d.struct({
  anim: d.f32,
  c_cold: d.vec3f,
  c_cool: d.vec3f,
  c_core: d.vec3f,
  c_hot: d.vec3f,
  c_paper: d.vec3f,
  c_warm: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_banding: d.f32,
  p_bands: d.f32,
  p_contrast: d.f32,
  p_dither: d.f32,
  p_dotGain: d.f32,
  p_dotSoft: d.f32,
  p_dots: d.f32,
  p_freq: d.f32,
  p_gain: d.f32,
  p_grain: d.f32,
  p_grainSize: d.f32,
  p_hi: d.f32,
  p_ink: d.f32,
  p_jitter: d.f32,
  p_light: d.f32,
  p_lo: d.f32,
  p_misregister: d.f32,
  p_printMix: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_scale: d.f32,
  p_speed: d.f32,
  p_spin: d.f32,
  p_warp: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: Params },
  })
  .$idx(0);

const hash = tgpu.fn(
  [d.vec2f],
  d.f32
)((p) =>
  std.fract(std.sin(std.dot(p, d.vec2f(127.1, 311.7))) * 43_758.545_312_3)
);

const noise = tgpu.fn(
  [d.vec2f],
  d.f32
)((p) => {
  "use gpu";
  const i = std.floor(p);
  const f = std.fract(p);
  const ff = f.mul(f).mul(d.vec2f(3).sub(f.mul(2)));
  return std.mix(
    std.mix(hash(i), hash(i.add(d.vec2f(1, 0))), ff.x),
    std.mix(hash(i.add(d.vec2f(0, 1))), hash(i.add(d.vec2f(1, 1))), ff.x),
    ff.y
  );
});

const grainNoise = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.f32
)((gpix, frame, seed) =>
  hash(gpix.add(d.vec2f(frame * 13.71 + seed, frame * 7.37 - seed)))
);

const rot2 = tgpu.fn(
  [d.f32],
  d.mat2x2f
)((angle) => {
  "use gpu";
  const c = std.cos(angle);
  const s = std.sin(angle);
  return d.mat2x2f(d.vec2f(c, -s), d.vec2f(s, c));
});

/*
 * One ink screen. Square dots on a grid at angle a, offset o (the
 * misregistration), sized by the coverage: coverage 0 is paper, coverage 1
 * is a solid. Returns how much of this pixel the ink covers.
 *
 * The grid is laid in SCREEN space, not on the wrapped plane: a print is
 * flat, and it is the picture that curves round the ball. A screen on the
 * wrapped coordinates changes pitch toward the limb and beats against the
 * other two into moire rings.
 */
const screen = tgpu.fn(
  [d.vec2f, d.f32, d.vec2f, d.f32, d.f32],
  d.f32
)((uv, a, o, coverage, soft) => {
  "use gpu";
  const u = layout.$.params;
  const cell = std.mul(rot2(a), uv).mul(u.p_dots).add(o);
  const f = std.fract(cell).sub(0.5);
  // a round dot: reads as tone, not as a grid
  const dist = std.length(f);
  // dot half-size from coverage; sqrt so mid-tones read as mid-tones the
  // way a real screen's area does
  const size = 0.5 * std.sqrt(std.clamp(coverage * u.p_dotGain, 0, 1));
  return 1 - std.smoothstep(size - soft, size + soft, dist);
});

const orb33Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    const heatGainNow = u.p_gain * (1 + 0.6 * u.outputVol);
    const heatJitterNow = u.p_jitter * (1 + 1.5 * u.inputVol);

    const rd = std.length(orbUv);
    const R = u.p_radius;
    const mask = std.smoothstep(0.012, -0.012, rd - R);

    if (mask <= 0) {
      return d.vec4f();
    }

    const pl = orbUv.div(R);
    const r2 = std.dot(pl, pl);
    const z = std.sqrt(std.max(1 - r2, 0));
    const n = d.vec3f(pl, z);

    // roll the dome about Y on its own integrated clock
    const cr = std.cos(u.p_spin);
    const sr = std.sin(u.p_spin);
    const sp = d.vec3f(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);

    // integrated clock: the sources drift
    const t = u.p_speed;

    // stereographic wrap of the plane onto the ball
    const st = sp.xy.div(1.3 + sp.z).mul(u.p_scale);

    /*
     * The heat: a drifting, domain-warped noise field with a threshold window
     * cut out of it. Two drifts at different rates so the pools travel and
     * change shape rather than slide as one sheet; the input jitter is a fast
     * wobble on top.
     */
    let p = st.mul(u.p_freq).add(d.vec2f(t * 0.11, -t * 0.07));
    const wp = st.mul(u.p_freq * 0.55).add(d.vec2f(-t * 0.05, t * 0.08));
    const warp = d.vec2f(noise(wp.add(3.1)), noise(wp.add(9.4))).sub(0.5);
    p = p.add(warp.mul(u.p_warp));
    p = p.add(d.vec2f(std.sin(t * 3.7), std.cos(t * 4.3)).mul(heatJitterNow));
    const field =
      noise(p) * 0.62 +
      noise(p.mul(2.1).add(5.3)) * 0.26 +
      noise(p.mul(4.2).add(1.7)) * 0.12;
    let heat = std.clamp(
      ((field - u.p_lo) * heatGainNow) / std.max(u.p_hi - u.p_lo, 0.01),
      0,
      1
    );

    // grain tap 1: dither the field before it is banded, so the contour
    // edges break up into speckle instead of clean steps
    const gpix = std.floor(fragCoord.div(std.max(u.p_grainSize, 1)));
    const frame = std.floor(u.time * 48);
    heat += (grainNoise(gpix, frame, 3.1) - 0.5) * u.p_dither;

    // the contours: quantize into bands, blend back with the smooth field
    const banded = std.floor(heat * u.p_bands + 0.5) / u.p_bands;
    heat = std.clamp(std.mix(heat, banded, u.p_banding), 0, 1);
    heat = std.pow(heat, u.p_contrast);

    // the thermal ramp
    let base = std.mix(u.c_cold, u.c_cool, std.smoothstep(0, 0.3, heat));
    base = std.mix(base, u.c_warm, std.smoothstep(0.3, 0.55, heat));
    base = std.mix(base, u.c_hot, std.smoothstep(0.55, 0.78, heat));
    base = std.mix(base, u.c_core, std.smoothstep(0.78, 0.97, heat));

    /*
     * The print. Separate the palette into CMY coverage and lay each ink down
     * as its own screen; the paper shows through the gaps. The angles are the
     * classic offsets, scaled by the misregistration, plus a per-ink shift.
     */
    const soft = u.p_dotSoft;
    const mis = u.p_misregister;
    const cC = screen(
      orbUv,
      0.035 * mis,
      d.vec2f(0.22, 0.12).mul(mis),
      1 - base.x,
      soft
    );
    const cM = screen(
      orbUv,
      -0.03 * mis,
      d.vec2f(-0.14, 0.2).mul(mis),
      1 - base.y,
      soft
    );
    const cY = screen(orbUv, 0, d.vec2f(), 1 - base.z, soft);

    let print = d.vec3f(u.c_paper);
    print = print.mul(
      std.mix(d.vec3f(1), d.vec3f(0.05, 0.62, 0.92), cC * u.p_ink)
    );
    print = print.mul(
      std.mix(d.vec3f(1), d.vec3f(0.92, 0.08, 0.48), cM * u.p_ink)
    );
    print = print.mul(
      std.mix(d.vec3f(1), d.vec3f(0.98, 0.86, 0.02), cY * u.p_ink)
    );

    // the unprinted palette is mixed back a little so the blacks stay black
    // and the screens never wash the whole ball to paper
    let col = std.mix(base, print, u.p_printMix);

    // grain tap 2: paper
    col = col.mul(1 + (grainNoise(gpix, frame, 27.9) - 0.5) * u.p_grain);

    // dome shading keeps the ball a ball under the print
    const lambert = std.clamp(
      std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.7))),
      0,
      1
    );
    col = col.mul(1 - u.p_light * (1 - lambert));
    const fres = std.pow(1 - z, 2.5);
    col = col.add(u.c_paper.mul(u.p_rim * fres * 0.5));

    // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
    // opposite convention from the emissive orbs (see orb-31).
    const a = mask;
    return d.vec4f(std.max(col, d.vec3f()).mul(a), a);
  })
  .$name("orb33Fragment");

export const orb33Shader = tgpu.resolve([orb33Fragment]);

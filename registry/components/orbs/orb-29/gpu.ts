import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

export const orb29Params = d.struct({
  anim: d.f32,
  c_lit: d.vec3f,
  c_wall: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_cells: d.f32,
  p_churn: d.f32,
  p_confetti: d.f32,
  p_contrast: d.f32,
  p_coverage: d.f32,
  p_drift: d.f32,
  p_gain: d.f32,
  p_light: d.f32,
  p_pulse: d.f32,
  p_radius: d.f32,
  p_scale: d.f32,
  p_shuffle: d.f32,
  p_spin: d.f32,
  p_swirl: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: orb29Params },
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

const fbm = tgpu.fn(
  [d.vec2f],
  d.f32
)((pIn) => {
  "use gpu";
  let p = d.vec2f(pIn);
  let v = d.f32();
  let a = d.f32(0.5);
  for (const _i of std.range(5)) {
    v += a * noise(p);
    p = p.mul(2.03).add(d.vec2f(11.7, 7.3));
    a *= 0.5;
  }
  return v;
});

const orb29Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);

    // Volume coupling: user input widens the lit coverage, agent output turns
    // the panel brightness up.
    const coverNow = u.p_coverage + 0.07 * u.inputVol;
    const gainNow = u.p_gain * (0.85 + 0.5 * u.outputVol);

    // resolution-relative tile grid — same wall at every size
    const cellPx = std.max(
      std.min(u.res.x, u.res.y) / std.max(u.p_cells, 8),
      4
    );
    const cellIdx = std.floor(fragCoord.div(cellPx));
    const cellCentre = cellIdx.add(0.5).mul(cellPx);
    // 0..1 inside the tile
    const g = std.fract(fragCoord.div(cellPx));

    const suv = cellCentre.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
    const duv = suv.div(u.p_radius);
    const r2 = std.dot(duv, duv);

    // blocky silhouette, cut on the tile grid like the wall itself
    const mask = 1 - std.step(1, r2);

    const z = std.sqrt(std.max(1 - r2, 0));
    const n = d.vec3f(duv, z);

    // rotating dome, stereographic projection — the blobs roll around the
    // ball as the dome turns
    // integrated clock
    const rot = u.p_spin;
    const cr = std.cos(rot);
    const sr = std.sin(rot);
    const sp = d.vec3f(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);
    const p2 = sp.xy.div(std.abs(sp.z) + 1.2).mul(u.p_scale * 3);

    /*
     * Per-state motion, each on its own integrated clock:
     *   DRIFT    the blob field streams across the wall     (idle flows)
     *   CHURN    the fluid warp evolves in place            (thinking boils)
     *   SHUFFLE  the confetti promotion cycles              (thinking races it)
     *   PULSE    rings radiate from the centre              (speaking)
     * Rates glide; a rate at zero freezes that motion with its phase intact.
     * The pulse depth is an amplitude, so idle carries no static rings.
     */
    // integrated clock: blob stream
    const driftT = u.p_drift;
    // integrated clock: warp evolution
    const churnT = u.p_churn;
    // integrated clock: confetti reshuffle
    const shuffleT = u.p_shuffle;
    const f1 = d.vec2f(driftT * 0.5, -driftT * 0.35);
    const f2 = d.vec2f(-churnT * 0.4, churnT * 0.6);

    /*
     * FLUID domain warp: two decorrelated fbm channels displace the sample
     * point before the blob field reads it, and the displacement itself
     * evolves on the churn clock. The blobs curl, stretch and merge like
     * liquid instead of sliding across the wall as one rigid sheet.
     */
    const warp = d
      .vec2f(fbm(p2.mul(0.9).add(f2)), fbm(p2.mul(0.9).add(f2.yx).add(13.7)))
      .sub(0.5);
    const field = fbm(p2.add(f1).add(warp.mul(u.p_swirl * 2.4)));

    const lambert = std.clamp(
      std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.7))),
      0,
      1
    );
    let lum = std.smoothstep(
      1 - coverNow,
      1.14 - coverNow,
      field +
        0.25 * u.p_light * lambert +
        u.p_pulse * 0.3 * std.sin(std.length(duv) * 5 - driftT * 3.2)
    );
    lum *= gainNow;

    /*
     * The tile: a bevelled square face inside a frame. The face is the lit
     * part; the frame stays dark; an unlit tile keeps a faint presence so the
     * wall reads as hardware even where nothing is lit.
     */
    const d2 = std.abs(g.sub(0.5));
    const md = std.max(d2.x, d2.y);
    const face = 1 - std.smoothstep(0.26, 0.36, md);
    const tile = 1 - std.smoothstep(0.42, 0.48, md);
    // a soft centre hot-spot on the face, like an LED under a diffuser
    const hot = 1 - std.smoothstep(0, 0.34, std.length(d2));

    /*
     * Confetti: a per-tile hash cycles against the shuffle clock, and the top
     * params.p_confetti slice of the cycle is promoted from warm white to a fully
     * saturated hue drawn from a second hash. Which tiles are coloured
     * therefore reshuffles continuously — slowly at rest, fast in thought.
     */
    const h1 = hash(cellIdx.mul(1.618).add(7.3));
    const h2 = hash(cellIdx.mul(2.113).add(41.7));
    const cyc = std.fract(h1 + shuffleT * 0.06);
    const promoted = std.step(1 - u.p_confetti, cyc);
    let confetti = d.vec3f(0.5).add(
      std
        .cos(
          d
            .vec3f(h2)
            .add(d.vec3f(0, 0.33, 0.67))
            .mul(6.2831)
        )
        .mul(0.5)
    );
    confetti = std.normalize(confetti.add(0.05)).mul(1.2);
    const litCol = std.mix(u.c_lit, confetti, promoted);

    // lit face over the dark wall; frames and off-tiles stay faintly present
    const offCol = u.c_wall.mul(tile);
    const onCol = litCol.mul(face * 1.05 + hot * 0.5).mul(lum);
    let col = offCol.add(onCol);

    col = std.pow(std.max(col, d.vec3f()), d.vec3f(u.p_contrast));

    // Surface-lit orb bounded by a mask: alpha IS coverage, so premultiply —
    // the opposite convention from the emissive orbs (see orb-31).
    const a = mask;
    return d.vec4f(col.mul(a), a);
  })
  .$name("orb29Fragment");

export const orb29Shader = tgpu.resolve([orb29Fragment]);

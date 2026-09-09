import { d, std, tgpu } from "typegpu";

/*
 * Ported from orbkit SHDR-23 (GLSL) to TypeGPU: a phosphor matrix on a dome.
 * Original: https://github.com/zzzzshawn/orbkit
 */

const Params = d.struct({
  anim: d.f32,
  c_deep: d.vec3f,
  c_glow: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_cells: d.f32,
  p_contrast: d.f32,
  p_density: d.f32,
  p_drift: d.f32,
  p_dropout: d.f32,
  p_gain: d.f32,
  p_light: d.f32,
  p_pulse: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_scale: d.f32,
  p_scroll: d.f32,
  p_speed: d.f32,
  p_spin: d.f32,
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

const orb23Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);

    // Volume coupling: user input densifies the glyphs, agent output turns
    // the phosphor up — the matrix visibly burns brighter while it speaks.
    const densBias = u.p_density + 0.2 * u.inputVol;
    const gainNow = u.p_gain * (0.85 + 0.5 * u.outputVol);

    // resolution-relative glyph grid — same character count at every size
    const cellPx = std.max(
      std.min(u.res.x, u.res.y) / std.max(u.p_cells, 8),
      4
    );
    const cellIdx = std.floor(fragCoord.div(cellPx));
    const cellCentre = cellIdx.add(0.5).mul(cellPx);
    const g = std.fract(fragCoord.div(cellPx));

    const suv = cellCentre.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
    const nuv = suv.div(u.p_radius);
    const r2 = std.dot(nuv, nuv);

    // blocky silhouette, cut on the cell grid like the rest of the matrix
    const mask = 1 - std.step(1, r2);

    const z = std.sqrt(std.max(1 - r2, 0));
    const n = d.vec3f(nuv.x, nuv.y, z);

    // rotating dome, stereographic projection — the weave compresses toward
    // the rim and rolls around the ball as the dome turns
    const rot = u.p_spin;
    const cr = std.cos(rot);
    const sr = std.sin(rot);
    const sp = d.vec3f(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);
    const p2 = sp.xy.div(std.abs(sp.z) + 1.2).mul(u.p_scale * 3);

    /*
     * Three motions, one per state, each on its OWN integrated clock so a
     * state change morphs the movement instead of jumping it:
     *
     *   DRIFT   diagonal lava-flow streaming        (idle)
     *   SCROLL  vertical paging, terminal-style     (thinking)
     *   PULSE   radial waves radiating from centre  (speaking)
     *
     * The clocks are rates in the presets — a rate gliding to zero freezes
     * that motion in place, phase intact. The pulse's amplitude is a separate
     * non-integrated param, so idle carries no static rings.
     */
    const driftT = u.p_drift;
    const scrollT = u.p_scroll;
    const t = u.p_speed;
    const flow = d.vec2f(driftT * 0.6, -driftT * 0.45 - scrollT);

    const field = fbm(p2.add(flow));
    const lambert = std.clamp(
      std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.7))),
      0,
      1
    );
    const dens = std.clamp(
      (field - 0.5) * 1.8 +
        densBias +
        0.4 * u.p_light * lambert +
        u.p_pulse * 0.35 * std.sin(std.length(nuv) * 5.5 - t * 2.4),
      0,
      1
    );

    /*
     * The glyph: four dash rows split by three stripe gaps. Rows light from
     * the bottom as density rises — the step() against the row index IS the
     * ASCII quantizer, so a cell is always a whole character.
     */
    const rowI = std.floor(g.y * 4);
    const bar =
      std.step(0.22, std.fract(g.y * 4)) * std.step(std.fract(g.y * 4), 0.9);
    const stripe = std.step(0.18, std.fract(g.x * 3));
    const lit = std.step(rowI + 0.5, dens * 4 * gainNow);
    let glyph = bar * stripe * lit;

    /*
     * Blocky dropouts: the same field, resampled on a 2x2 super-grid and
     * thresholded. Because whole super-cells fail together, the dark zones
     * become hard rectangular holes instead of dim characters.
     */
    const superCentre = std.floor(cellIdx.div(2)).mul(2).add(1).mul(cellPx);
    const sSuv = superCentre.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
    const sUv2 = sSuv.div(u.p_radius);
    const sz = std.sqrt(std.max(1 - std.dot(sUv2, sUv2), 0));
    const ssp = d.vec3f(sUv2.x * cr - sz * sr, sUv2.y, sUv2.x * sr + sz * cr);
    const superField = fbm(
      ssp.xy
        .div(std.abs(ssp.z) + 1.2)
        .mul(u.p_scale * 3)
        .add(flow)
    );
    const keep = std.step(u.p_dropout, superField + 0.15 * u.outputVol);
    glyph *= keep;

    // phosphor ramp: deep green floor to hot glow, whitening at the top end
    let glyphCol = std.mix(u.c_deep, u.c_glow, dens);
    glyphCol = glyphCol.add(d.vec3f(0.7, 1, 0.9).mul(std.pow(dens, 3) * 0.35));

    // a dark body under the matrix plus a glow-coloured fresnel rim
    const fres = std.pow(1 - z, 2.2);
    let col = u.c_deep
      .mul(0.22)
      .add(glyphCol.mul(glyph))
      .add(u.c_glow.mul(fres * u.p_rim));

    col = std.pow(std.max(col, d.vec3f()), d.vec3f(u.p_contrast));

    // Surface-lit orb bounded by a mask: alpha IS coverage, so premultiply
    const a = mask;
    return d.vec4f(col.mul(a), a);
  })
  .$name("orb23Fragment");

export const orb23Shader = tgpu.resolve([orb23Fragment]);

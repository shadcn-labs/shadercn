import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

const Params = d.struct({
  anim: d.f32,
  c_deep: d.vec3f,
  c_sheen: d.vec3f,
  c_sun: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_contrast: d.f32,
  p_edge: d.f32,
  p_flow: d.f32,
  p_gain: d.f32,
  p_light: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_scale: d.f32,
  p_spin: d.f32,
  p_split: d.f32,
  p_swell: d.f32,
  p_swellRate: d.f32,
  p_warp: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: Params },
  })
  .$idx(0);

const tanh3 = tgpu.fn(
  [d.vec3f],
  d.vec3f
)((x) => {
  "use gpu";
  const clamped = std.clamp(x, d.vec3f(-10), d.vec3f(10));
  const e = std.exp(clamped.mul(2));
  return e.sub(1).div(e.add(1));
});

/*
 * The water. The plane is folded on its own sines three times, each octave
 * at a literal frequency, so the ripples refract the net rather than scroll it.
 */
const fold = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.vec2f
)((p, t, warp) => {
  "use gpu";
  let q = d.vec2f(p);
  q = q.add(std.sin(q.yx.mul(1.31).add(d.vec2f(t * 0.9, -t * 0.7))).mul(warp));
  q = q.add(
    std.sin(q.yx.mul(2.17).add(d.vec2f(-t * 1.3, t * 1.1))).mul(warp * 0.6)
  );
  q = q.add(
    std.sin(q.yx.mul(3.73).add(d.vec2f(t * 1.9, t * 1.6))).mul(warp * 0.35)
  );
  return q;
});

/*
 * The light. Two crossed families of crest lines, sharpened by the edge
 * exponent. Their product is added back so crossings burn hotter.
 */
const net = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.f32
)((p, t, warp) => {
  "use gpu";
  const u = layout.$.params;
  const q = fold(p, t, warp);
  const s = d.vec2f(1).sub(std.abs(std.sin(q)));
  const l = std.pow(s, d.vec2f(u.p_edge));
  // Normalised to [0, 1]: the sum peaks at four on a crossing; bounded so
  // the sun colour survives the knee at the foci.
  return (l.x + l.y + 2 * l.x * l.y) * 0.25;
});

/*
 * Triplanar: the plane field read on the three axis planes of the surface
 * direction and blended by the fourth power of each component. No pole, no seam.
 */
const netOn = tgpu.fn(
  [d.vec3f, d.f32, d.f32],
  d.f32
)((sp, t, warp) => {
  "use gpu";
  const u = layout.$.params;
  let w = sp.mul(sp);
  w = w.mul(w);
  w = w.div(w.x + w.y + w.z);
  const k = u.p_scale;
  return (
    w.x * net(sp.yz.mul(k), t, warp) +
    w.y * net(sp.zx.mul(k), t, warp) +
    w.z * net(sp.xy.mul(k), t, warp)
  );
});

const orb16Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    const rd = std.length(uv);
    const R = u.p_radius;
    const mask = std.smoothstep(0.012, -0.012, rd - R);
    if (mask <= 0) {
      return d.vec4f();
    }

    const pl = uv.div(R);
    const z = std.sqrt(std.max(1 - std.dot(pl, pl), 0));
    const n = d.vec3f(pl.x, pl.y, z);

    const cr = std.cos(u.p_spin);
    const sr = std.sin(u.p_spin);
    const sp = d.vec3f(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);

    const t = u.p_flow;

    /*
     * The surge: a round trip on an integrated clock through cos, so it eases
     * through both ends and never wraps. It lifts the gain and deepens the
     * ripple together. Agent voice brightens the light; user input deepens water.
     */
    const surge = 0.5 - 0.5 * std.cos(u.p_swellRate);
    const gainNow =
      u.p_gain *
      std.mix(1, 0.55 + 0.9 * surge, u.p_swell) *
      (0.8 + 0.5 * u.outputVol);
    const causticWarp =
      u.p_warp *
      std.mix(1, 0.8 + 0.4 * surge, u.p_swell) *
      (1 + 0.35 * u.inputVol);

    /*
     * Three moments of the fold, one per channel. The LIGHT is the net's
     * luminance under the sun colour; per-channel disagreement is split off
     * as a zero-mean residual scaled by p_split — rainbow as a fringe.
     */
    const ds = d.f32(0.09);
    const c = d.vec3f(
      netOn(sp, t + ds, causticWarp),
      netOn(sp, t, causticWarp),
      netOn(sp, t - ds, causticWarp)
    );
    const cLum = std.dot(c, d.vec3f(1 / 3));
    const fringe = c.sub(cLum).mul(u.p_split);

    const lambert = std.clamp(
      std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.7))),
      0,
      1
    );
    const fres = std.pow(1 - z, 2.5);

    let col = u.c_deep.mul(0.35 + 0.65 * u.p_light * lambert);
    col = col.add(
      u.c_sun
        .mul(cLum)
        .add(fringe)
        .mul(gainNow * (0.55 + 0.45 * lambert))
    );
    col = col.add(u.c_sheen.mul(u.p_rim * fres));

    col = std.pow(std.max(col, d.vec3f()), d.vec3f(u.p_contrast));
    col = tanh3(col);

    const alpha = mask;
    return d.vec4f(std.max(col, d.vec3f()).mul(alpha), alpha);
  })
  .$name("orb16Fragment");

export const orb16Shader = tgpu.resolve([orb16Fragment]);

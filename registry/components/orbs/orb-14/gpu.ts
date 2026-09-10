import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

export const orb14Params = d.struct({
  anim: d.f32,
  c_ink: d.vec3f,
  c_paper: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_cells: d.f32,
  p_contrast: d.f32,
  p_gain: d.f32,
  p_levels: d.f32,
  p_light: d.f32,
  p_plasma: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_scale: d.f32,
  p_speed: d.f32,
  p_spin: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: orb14Params },
  })
  .$idx(0);

// 2x2 Bayer base: (0,0)=0, (1,0)=.5, (0,1)=.75, (1,1)=.25
const bayer2 = tgpu.fn(
  [d.vec2f],
  d.f32
)((a) => {
  "use gpu";
  const f = std.floor(a);
  return std.fract(f.x / 2 + f.y * f.y * 0.75);
});

// 8x8 by recursion: M8 = M2(a/4)/16 + M2(a/2)/4 + M2(a)
const bayer8 = tgpu.fn(
  [d.vec2f],
  d.f32
)((a) => bayer2(a.mul(0.25)) * 0.0625 + bayer2(a.mul(0.5)) * 0.25 + bayer2(a));

const orb14Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);

    // User input deepens the waves, agent output brightens the tone ladder.
    const plasmaAmt = u.p_plasma * (1 + 0.4 * u.inputVol);
    const gainNow = u.p_gain * (0.85 + 0.5 * u.outputVol);

    /*
     * Chunky pixel grid, RESOLUTION-RELATIVE: p_cells is how many cells span
     * the canvas, so a gallery card and a playground orb show the same
     * composition. Content samples at the cell centre so every dot is one
     * flat square.
     */
    const cellPx = std.max(
      std.min(u.res.x, u.res.y) / std.max(u.p_cells, 8),
      1
    );
    const pix = std.floor(fragCoord.div(cellPx));
    const cellCentre = pix.add(0.5).mul(cellPx);

    const suv = cellCentre.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
    const puv = suv.div(u.p_radius);
    const r2 = std.dot(puv, puv);

    // blocky silhouette — cut on the cell grid, deliberately not smoothed
    const mask = 1 - std.step(1, r2);

    const z = std.sqrt(std.max(1 - r2, 0));
    const n = d.vec3f(puv.x, puv.y, z);

    /*
     * Plasma in a ROTATING frame: the dome point spins about Y so wavefronts
     * roll around the ball. Light stays screen-fixed.
     */
    const rot = u.p_spin;
    const cr = std.cos(rot);
    const sr = std.sin(rot);
    const sp = d.vec3f(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);

    const t = u.p_speed;

    // classic demoscene plasma: three interfering sine waves
    const f = u.p_scale;
    let v =
      std.sin(sp.x * f * 3.1 + t) +
      std.sin((sp.y * 0.85 + sp.z * 0.4) * f * 3.6 - t * 1.3) +
      std.sin((sp.x + sp.y + sp.z) * f * 2.2 + t * 0.7);

    // a ripple source orbiting the dome — expanding rings through the interference
    const src = d.vec2f(std.cos(t * 0.5), std.sin(t * 0.5)).mul(0.55);
    v += std.sin(std.length(puv.sub(src)) * f * 5 - t * 2.2);
    v *= 0.25;

    const lambert = std.clamp(
      std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.7))),
      0,
      1
    );
    const fres = std.pow(1 - z, 2);

    let lum =
      (0.5 + 0.5 * v * plasmaAmt) * (0.3 + u.p_light * lambert) +
      u.p_rim * fres;
    lum = std.pow(std.clamp(lum * gainNow, 0, 1), u.p_contrast);

    const steps = std.max(u.p_levels - 1, 1);
    const q = std.clamp(std.floor(lum * steps + bayer8(pix)) / steps, 0, 1);

    const col = std.mix(u.c_ink, u.c_paper, q);

    const alpha = mask;
    return d.vec4f(col.mul(alpha), alpha);
  })
  .$name("orb14Fragment");

export const orb14Shader = tgpu.resolve([orb14Fragment]);

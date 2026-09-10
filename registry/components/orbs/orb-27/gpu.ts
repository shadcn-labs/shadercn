import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

const VORTICES = 6;
const FBM3_OCT = 4;

export const orb27Params = d.struct({
  anim: d.f32,
  c_c0: d.vec3f,
  c_c1: d.vec3f,
  c_c2: d.vec3f,
  c_c3: d.vec3f,
  c_c4: d.vec3f,
  c_c5: d.vec3f,
  c_c6: d.vec3f,
  c_paper: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_cells: d.f32,
  p_curve: d.f32,
  p_density: d.f32,
  p_dither: d.f32,
  p_dot: d.f32,
  p_freq: d.f32,
  p_grain: d.f32,
  p_hi: d.f32,
  p_light: d.f32,
  p_lo: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_scale: d.f32,
  p_sparse: d.f32,
  p_speed: d.f32,
  p_spin: d.f32,
  p_swirl: d.f32,
  p_twinkle: d.f32,
  p_vortex: d.f32,
  p_warp: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: orb27Params },
  })
  .$idx(0);

const hash = tgpu.fn(
  [d.vec2f],
  d.f32
)((p) =>
  std.fract(std.sin(std.dot(p, d.vec2f(127.1, 311.7))) * 43_758.545_312_3)
);

/*
 * 3D value noise. The prelude's noise is 2D, and a 2D field wrapped onto
 * the ball has to be projected — and every projection either distorts
 * somewhere or seams somewhere, which is exactly what the roll dragged
 * into view. Evaluating the field ON the sphere's own points needs
 * nothing projected: the roll is just a rotation of the sample point.
 */
const hash3 = tgpu.fn(
  [d.vec3f],
  d.f32
)((p) =>
  std.fract(std.sin(std.dot(p, d.vec3f(127.1, 311.7, 74.7))) * 43_758.545_312_3)
);

const noise3 = tgpu.fn(
  [d.vec3f],
  d.f32
)((p) => {
  "use gpu";
  const i = std.floor(p);
  let f = std.fract(p);
  f = f.mul(f).mul(d.vec3f(3).sub(f.mul(2)));
  const n000 = hash3(i);
  const n100 = hash3(i.add(d.vec3f(1, 0, 0)));
  const n010 = hash3(i.add(d.vec3f(0, 1, 0)));
  const n110 = hash3(i.add(d.vec3f(1, 1, 0)));
  const n001 = hash3(i.add(d.vec3f(0, 0, 1)));
  const n101 = hash3(i.add(d.vec3f(1, 0, 1)));
  const n011 = hash3(i.add(d.vec3f(0, 1, 1)));
  const n111 = hash3(i.add(d.vec3f(1, 1, 1)));
  return std.mix(
    std.mix(std.mix(n000, n100, f.x), std.mix(n010, n110, f.x), f.y),
    std.mix(std.mix(n001, n101, f.x), std.mix(n011, n111, f.x), f.y),
    f.z
  );
});

const fbm3 = tgpu.fn(
  [d.vec3f],
  d.f32
)((p) => {
  "use gpu";
  let q = d.vec3f(p);
  let v = d.f32();
  let a = d.f32(0.5);
  for (const _i of std.range(FBM3_OCT)) {
    v += a * noise3(q);
    q = q.mul(2.03).add(d.vec3f(11.7, 7.3, 3.1));
    a *= 0.5;
  }
  return v;
});

// rotate v about the unit axis k by angle a (Rodrigues)
const rotateAbout = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32],
  d.vec3f
)((v, k, a) => {
  "use gpu";
  const c = std.cos(a);
  const s = std.sin(a);
  return v
    .mul(c)
    .add(std.cross(k, v).mul(s))
    .add(k.mul(std.dot(k, v) * (1 - c)));
});

// the precipitation intensity, 0..1, at a point of the unit sphere
const intensity = tgpu.fn(
  [d.vec3f, d.f32, d.f32],
  d.f32
)((sp, t, radarLoNow) => {
  "use gpu";
  const u = layout.$.params;
  let q = d.vec3f(sp);
  /*
   * The vortices: hashed points on the sphere, each twisting the space
   * around itself — a rotation about the axis through it, by an angle
   * that falls off with the angular distance, alternating in sense. The
   * centres wander slowly so no spiral sits still.
   */
  for (const k of std.range(VORTICES)) {
    const fk = d.f32(k);
    let c = std.normalize(
      d.vec3f(
        hash(d.vec2f(fk * 3.7, 1.1)) - 0.5,
        hash(d.vec2f(fk * 5.9, 2.3)) - 0.5,
        hash(d.vec2f(fk * 7.1, 4.9)) - 0.5
      )
    );
    c = rotateAbout(c, d.vec3f(0, 1, 0), std.sin(t * 0.09 + fk * 1.7) * 0.25);
    const ang = std.acos(std.clamp(std.dot(q, c), -1, 1));
    const fall = std.exp((-ang * ang) / (u.p_vortex * u.p_vortex));
    const a = u.p_swirl * fall * std.select(-1, 1, std.mod(fk, 2) < 0.5);
    q = rotateAbout(q, c, a);
  }

  // bend, then drift the noise through the twisted space
  const w = d
    .vec3f(
      noise3(q.mul(1.3).add(2.1)),
      noise3(q.mul(1.3).add(7.3)),
      noise3(q.mul(1.3).add(4.4))
    )
    .sub(0.5);
  q = q.add(w.mul(u.p_warp));
  const pq = q.mul(u.p_freq).add(d.vec3f(t * 0.22, -t * 0.13, t * 0.07));

  /*
   * Two scales multiplied, not added: a broad mask decides WHERE the storms
   * are, a finer field gives each one a core and ragged edges. Adding them
   * fills the whole sphere with mid-tones; multiplying leaves the calm
   * between systems genuinely empty and puts the peaks inside the cells,
   * which is what draws the concentric class rings.
   */
  const big = std.clamp((fbm3(pq) - 0.5) * 3 + 0.5, 0, 1);
  const fine = std.clamp((fbm3(pq.mul(2.6).add(4.7)) - 0.5) * 2.4 + 0.5, 0, 1);
  let f = big * (0.55 + 0.45 * fine);

  f = std.clamp((f - radarLoNow) / std.max(u.p_hi - radarLoNow, 0.01), 0, 1);
  // a response curve: the top classes are the rare peaks of a real map
  return std.pow(f, u.p_curve);
});

const orb27Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // input lowers the window (more of the field reads as weather), output
    // fills the dots in
    const radarLoNow = u.p_lo - 0.08 * u.inputVol;
    const radarDensityNow = u.p_density * (1 + 0.5 * u.outputVol);

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

    // integrated clock: the weather drifts
    const t = u.p_speed;

    /*
     * The pixel grid lives on the UNROLLED dome: a stereographic wrap of the
     * front hemisphere as it faces the viewer, which compresses gently toward
     * the limb and never changes. The picture rolls underneath it — the
     * pixels are the screen, the weather is what is on it. Laying the grid on
     * the rolled dome instead put the projection's blow-up (the far side of
     * the ball) wherever the roll had turned it, and the cells smeared into
     * streaks there.
     */
    const st = n.xy.div(1.3 + n.z).mul(u.p_scale);
    const g = st.mul(u.p_cells);
    const cell = std.floor(g);
    const fr = std.fract(g).sub(0.5);

    // the cell centre, back on the dome: invert the wrap, then roll it and
    // read the field there — once per cell, so every dot is one flat colour
    const v = cell.add(0.5).div(u.p_cells).div(u.p_scale);
    const vv = std.dot(v, v);
    const A = vv + 1;
    const B = 2.6 * vv;
    const C = 1.69 * vv - 1;
    const zc = (-B + std.sqrt(std.max(B * B - 4 * A * C, 0))) / (2 * A);
    const nc = d.vec3f(v.mul(1.3 + zc), zc);
    const cr = std.cos(u.p_spin);
    const sr = std.sin(u.p_spin);
    const spc = d.vec3f(nc.x * cr - nc.z * sr, nc.y, nc.x * sr + nc.z * cr);

    const f = intensity(spc, t, radarLoNow);

    // dither the class boundaries with a per-cell hash, then quantize into
    // the legend's seven classes. The bands are NOT even: red is broad and
    // green thin, as on the reference, and magenta is the rare peak.
    const h = hash(cell.add(11.7));
    const fd = std.clamp(f + (h - 0.5) * u.p_dither, 0, 1);
    let cls = d.f32();
    cls += std.step(0.1, fd);
    cls += std.step(0.26, fd);
    cls += std.step(0.38, fd);
    cls += std.step(0.46, fd);
    cls += std.step(0.78, fd);
    cls += std.step(0.94, fd);

    // dropout: density rises with the intensity; the hash re-rolls slowly
    const frame = std.floor(u.time * u.p_twinkle);
    const roll = hash(cell.add(d.vec2f(frame * 3.7, -frame * 1.3)));
    const density =
      std.mix(u.p_sparse, 1, std.smoothstep(0, 0.6, f)) * radarDensityNow;
    const keep = std.step(roll, density);

    // the dot: a square inset in its cell
    const dsq = std.max(std.abs(fr.x), std.abs(fr.y));
    const dotMask = 1 - std.smoothstep(u.p_dot - 0.06, u.p_dot + 0.06, dsq);

    // the class palette
    let ink = d.vec3f(u.c_c0);
    ink = std.select(ink, u.c_c1, cls > 0.5 && cls < 1.5);
    ink = std.select(ink, u.c_c2, cls > 1.5 && cls < 2.5);
    ink = std.select(ink, u.c_c3, cls > 2.5 && cls < 3.5);
    ink = std.select(ink, u.c_c4, cls > 3.5 && cls < 4.5);
    ink = std.select(ink, u.c_c5, cls > 4.5 && cls < 5.5);
    ink = std.select(ink, u.c_c6, cls > 5.5);

    let col = std.mix(u.c_paper, ink, dotMask * keep);

    // paper grain, so the flats are not dead
    col = col.mul(
      1 + (hash(std.floor(fragCoord.div(2)).add(frame)) - 0.5) * u.p_grain
    );

    // dome shading keeps the ball a ball under the mosaic
    const lambert = std.clamp(
      std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.7))),
      0,
      1
    );
    col = col.mul(1 - u.p_light * (1 - lambert));
    const fres = std.pow(1 - z, 3);
    col = std.mix(col, u.c_c0, fres * u.p_rim);

    // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
    // opposite convention from the emissive orbs (see orb-31).
    const a = mask;
    return d.vec4f(std.max(col, d.vec3f()).mul(a), a);
  })
  .$name("orb27Fragment");

export const orb27Shader = tgpu.resolve([orb27Fragment]);

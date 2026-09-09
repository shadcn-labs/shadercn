import { d, std, tgpu } from "typegpu";

const LEVELS = 20;

const Params = d.struct({
  anim: d.f32,
  c_base: d.vec3f,
  c_lineA: d.vec3f,
  c_lineB: d.vec3f,
  c_rim: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_body: d.f32,
  p_contrast: d.f32,
  p_edge: d.f32,
  p_edgeFade: d.f32,
  p_gain: d.f32,
  p_gridScale: d.f32,
  p_levels: d.f32,
  p_lineW: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_rimPow: d.f32,
  p_shutter: d.f32,
  p_speed: d.f32,
  p_spin: d.f32,
  p_tilt: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: Params },
  })
  .$idx(0);

const rot2 = tgpu.fn(
  [d.f32],
  d.mat2x2f
)((angle) => {
  "use gpu";
  const c = std.cos(angle);
  const s = std.sin(angle);
  return d.mat2x2f(d.vec2f(c, -s), d.vec2f(s, c));
});

const orb28Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    const bitdumbGain = u.p_gain * (1 + 0.6 * u.inputVol);
    const bitdumbBody = u.p_body * (1 + 0.8 * u.outputVol);

    const duv = orbUv.div(u.p_radius);
    const r2 = std.dot(duv, duv);

    // analytic disc silhouette — this orb is parameterised on the dome, so
    // the exact edge is just the unit circle, with the same tunable band as
    // the raymarched orbs
    const band = std.mix(0.35, 0.012, std.clamp(u.p_edge, 0, 1));
    const mask = 1 - std.smoothstep(1 - band, 1.005, std.length(duv));

    // front dome point and its normal (view space)
    const zc = std.sqrt(std.max(1 - r2, 0));
    const n = d.vec3f(duv, zc);

    // tumble the sphere point with real rotations, then project. abs() on z
    // mirror-wraps the hemisphere the tumble turns away, avoiding the
    // stereographic pole blow-up.
    let sp = d.vec3f(n);
    const tilted = std.mul(rot2(u.p_tilt), d.vec2f(sp.y, sp.z));
    sp = d.vec3f(sp.x, tilted.x, tilted.y);
    // integrated clock
    const spun = std.mul(rot2(u.p_spin), d.vec2f(sp.x, sp.z));
    sp = d.vec3f(spun.x, sp.y, spun.y);
    let p = sp.xy.div(std.abs(sp.z) + 1).mul(u.p_gridScale);

    /*
     * Analytic pixel footprint in grid space, in place of fwidth(): one
     * screen pixel in uv units, through the radius scale, the dome stretch
     * (grids compress toward the rim, so a pixel covers more of them there),
     * and the grid scale. Doubled alongside p every level.
     */
    let px =
      (2 / std.min(u.res.x, u.res.y) / u.p_radius / std.max(zc, 0.2)) *
      u.p_gridScale;

    let acc = d.vec4f();
    // integrated clock, additive phase
    const phase = u.p_speed * 0.2;

    for (const i of std.range(LEVELS)) {
      const fi = d.f32(i) + 1;
      if (fi > u.p_levels) {
        break;
      }

      // the listing's engine, kept verbatim: binary zoom
      p = p.add(p);
      px += px;

      const v = std.ceil(p);
      const f = std.fract(p);

      // distance to the nearest cell line, against this level's footprint —
      // the extension-free fwidth. Deep levels saturate to solid planes,
      // exactly like the original's aliasing.
      const e2 = d
        .vec2f(1)
        .sub(
          std.smoothstep(
            d.vec2f(),
            d.vec2f(px * u.p_lineW),
            std.min(f, d.vec2f(1).sub(f))
          )
        );

      // x-lines and y-lines separately tintable — the original's .xyy
      const edgeCol = u.c_lineA.mul(e2.x).add(u.c_lineB.mul(e2.y));

      // the per-cell shutter value, and the under-compositing that makes
      // level i occlude level i+1 — both straight from the listing
      const aBit = std.fract(std.length(v) / fi - phase) * u.p_shutter;
      acc = acc.add(d.vec4f(edgeCol, aBit).mul(1 - acc.w));

      if (acc.w > 0.996) {
        break;
      }
    }

    let col = acc.xyz.mul(bitdumbGain);

    // the ball body: a lambert-shaded base under the lattice, so the orb
    // reads as a solid object rather than lines floating on nothing
    const L = std.normalize(d.vec3f(-0.4, 0.5, 0.75));
    const shade = 0.25 + 0.75 * std.clamp(std.dot(n, L), 0, 1);
    col = col.add(u.c_base.mul(shade * bitdumbBody));

    // fresnel rim to sell the sphere
    col = col.add(u.c_rim.mul(std.pow(1 - zc, u.p_rimPow) * u.p_rim));

    col = std.pow(std.max(col, d.vec3f()), d.vec3f(u.p_contrast));

    // coverage alpha; safety taper fades colour AND alpha, as always
    const fade = 1 - std.smoothstep(u.p_edgeFade, 1, std.length(orbUv));
    const a = mask * fade;

    // Surface-lit orb bounded by a mask: alpha IS coverage, so premultiply —
    // the opposite of the emissive orbs (see the note in orb-31).
    return d.vec4f(col.mul(a), a);
  })
  .$name("orb28Fragment");

export const orb28Shader = tgpu.resolve([orb28Fragment]);

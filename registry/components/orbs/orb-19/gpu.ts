import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

export const orb19Params = d.struct({
  anim: d.f32,
  c_body: d.vec3f,
  c_high: d.vec3f,
  c_low: d.vec3f,
  c_sheen: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_bead: d.f32,
  p_bulge: d.f32,
  p_contrast: d.f32,
  p_edge: d.f32,
  p_floorLevel: d.f32,
  p_gain: d.f32,
  p_grow: d.f32,
  p_jitter: d.f32,
  p_light: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_saturation: d.f32,
  p_scale: d.f32,
  p_skew: d.f32,
  p_slide: d.f32,
  p_speed: d.f32,
  p_swirl: d.f32,
  p_vary: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: orb19Params },
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

const hash = tgpu.fn(
  [d.vec2f],
  d.f32
)((p) =>
  std.fract(std.sin(std.dot(p, d.vec2f(127.1, 311.7))) * 43_758.545_312_3)
);

const foamRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32],
  d.vec3f
)((fragCoord, foamGrow, foamJitter, foamGain) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const R = std.max(u.p_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  const pl = uv.div(R);
  const z = std.sqrt(std.max(1 - std.dot(pl, pl), 0));

  const t = u.p_speed;

  // stereographic wrap of the unrotated dome, as in orb-08
  let p = pl.div(z + 1 + u.p_bulge).mul(u.p_scale);

  // projection-safe 2D motion: the packing turns and drifts
  const sw = u.p_swirl;
  p = std.mul(rot2(sw), p);
  p = p.add(d.vec2f(u.p_slide, u.p_slide * 0.7));

  const cell = std.ceil(p);
  const f = p.sub(cell);

  /*
   * The 3x3 walk, keyed on the ABSOLUTE cell index so a bead is one bead.
   * Tracking the winner as well as the max is what makes the shading below
   * possible.
   */
  let cover = d.f32();
  let bestRel = d.f32(1e9);
  let bestDelta = d.vec2f();
  let bestRad = d.f32(1);
  let bestId = d.vec2f();

  for (const gy of std.range(3)) {
    for (const gx of std.range(3)) {
      const g = d.vec2f(d.f32(gx) - 1, d.f32(gy) - 1);
      const id = cell.add(g);

      /*
       * The listing's generator: a dot of a cosine against a detuned,
       * swizzled sine of the cell index, both carrying the clock. A dot of
       * two 2-vectors of unit-bounded components spans FOUR, so /6 puts
       * radii within a third of a cell of the mean. Half that and the
       * largest discs overlap their neighbours — a litter of merged blobs.
       */
      const rad =
        std.dot(std.cos(id.sub(t)), std.sin(id.yx.mul(u.p_skew).add(t))) *
          u.p_vary +
        foamGrow;
      /*
       * Fragment to feature point. The disc labelled id sits at id + jitter,
       * so delta = p - (id + jitter) = f - g - jitter. Write it as f + g and
       * identity and position use opposite offsets.
       */
      const jit = std.cos(id.yx.add(t)).mul(foamJitter);
      const delta = f.sub(g).sub(jit);
      const dist = std.length(delta);

      /*
       * Union over COVERAGE, not signed distance. Max of (radius - distance)
       * hands the whole overlap to whichever disc wins and bites a straight
       * edge out of the other. Max of clamped coverage keeps every disc whole.
       * The x50 ramp is an edge width: a signed distance scaled that hard and
       * clamped is a hard-edged disc with about a pixel of feather.
       */
      cover = std.max(cover, std.clamp((rad - dist) * u.p_edge, 0, 1));

      /*
       * Winner by RELATIVE depth — furthest inside in units of that disc's
       * own radius — so a small disc is not shaded as the large one beside it.
       */
      const rel = dist / std.max(rad, 1e-4);
      if (rel < bestRel) {
        bestRel = rel;
        bestDelta = d.vec2f(delta);
        bestRad = rad;
        bestId = d.vec2f(id);
      }
    }
  }

  /*
   * The bead. The winning cell's distance and radius give the height of a
   * hemisphere over the disc, and that is a normal — so the flat decal
   * becomes a lit piece of glass without a second field being evaluated.
   */
  const rr = std.max(bestRad, 1e-4);
  const dome = std.clamp(1 - std.dot(bestDelta, bestDelta) / (rr * rr), 0, 1);
  const bn = std.normalize(d.vec3f(bestDelta.div(rr), std.sqrt(dome) + 0.001));

  const key = std.normalize(d.vec3f(-0.45, 0.55, 0.72));
  const beadLam = std.clamp(std.dot(bn, key), 0, 1);

  // per-disc colour, hashed on the cell index — near-flat at the defaults
  const beadCol = std.mix(u.c_low, u.c_high, hash(bestId.add(0.5)));

  // p_bead at 0 leaves the listing's flat disc
  const shade = std.mix(1, 0.45 + 0.85 * beadLam, u.p_bead);
  let col = beadCol.mul(shade * foamGain * cover);

  // a dark body under the packing, so the gaps read as the ball
  col = col.add(u.c_body.mul(u.p_floorLevel));

  col = std.pow(std.max(col, d.vec3f()), d.vec3f(u.p_contrast));

  const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
  col = std.mix(d.vec3f(lum), col, u.p_saturation);

  // dome shading keeps the ball a ball under the packing
  const n = d.vec3f(pl, z);
  const lambert = std.clamp(std.dot(n, key), 0, 1);
  col = col.mul(0.55 + u.p_light * lambert);

  const fres = 1 - z;
  const fresCubed = fres * fres * fres;
  col = col.add(u.c_sheen.mul(u.p_rim * fresCubed));

  return col;
});

const orb19Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // Volume coupling: the user's voice shakes the beads off their centres,
    // the agent's swells them and brightens the packing.
    const foamGrow = u.p_grow * (1 + 0.35 * u.outputVol);
    const foamJitter = u.p_jitter * (1 + 0.5 * u.inputVol);
    const foamGain = u.p_gain * (0.85 + 0.4 * u.outputVol);

    const mask = std.smoothstep(
      0.012,
      -0.012,
      std.length(orbUv) - std.max(u.p_radius, 0.001)
    );

    if (mask <= 0) {
      return d.vec4f();
    }

    const col = foamRender(fragCoord, foamGrow, foamJitter, foamGain);

    // Surface orb bounded by a mask: alpha IS coverage, so premultiply —
    // the opposite convention from the emissive orbs (see orb-31).
    const a = mask;
    return d.vec4f(std.max(col, d.vec3f()).mul(a), a);
  })
  .$name("orb19Fragment");

export const orb19Shader = tgpu.resolve([orb19Fragment]);

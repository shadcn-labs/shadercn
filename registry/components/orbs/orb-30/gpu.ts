import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

export const orb30Params = d.struct({
  anim: d.f32,
  c_bloom: d.vec3f,
  c_canopy: d.vec3f,
  c_cloud: d.vec3f,
  c_meadow: d.vec3f,
  c_sheen: d.vec3f,
  c_sky: d.vec3f,
  c_water: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_bulge: d.f32,
  p_cloudCover: d.f32,
  p_cloudScale: d.f32,
  p_contrast: d.f32,
  p_drift: d.f32,
  p_fall: d.f32,
  p_flowerDensity: d.f32,
  p_flowerScale: d.f32,
  p_flowerSize: d.f32,
  p_frameShade: d.f32,
  p_gain: d.f32,
  p_haze: d.f32,
  p_hazeRange: d.f32,
  p_horizon: d.f32,
  p_light: d.f32,
  p_radius: d.f32,
  p_ratio: d.f32,
  p_rim: d.f32,
  p_saturation: d.f32,
  p_scale: d.f32,
  p_streakFreq: d.f32,
  p_streakRad: d.f32,
  p_tilt: d.f32,
  p_water: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: orb30Params },
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
 * Arc length around the unit square, in [0,8), counter-clockwise from the
 * bottom-right corner — two units per face. Continuous everywhere except
 * its single wrap, which lands on a corner.
 */
const squareArc = tgpu.fn(
  [d.vec2f],
  d.f32
)((q) => {
  "use gpu";
  if (std.abs(q.x) >= std.abs(q.y)) {
    if (q.x > 0) {
      return q.y + 1;
    }
    return 5 - q.y;
  }
  if (q.y > 0) {
    return 3 - q.x;
  }
  return 7 + q.x;
});

/*
 * Flower colour by hash: mostly white daisies, then the planted warm, then
 * the cornflower blues — which reuse the SKY colour rather than adding a
 * sixth stop, because that is what keeps them reading as part of the same
 * picture instead of as confetti thrown over it.
 */
const drosteFlower = tgpu.fn(
  [d.f32],
  d.vec3f
)((h) => {
  "use gpu";
  const u = layout.$.params;
  let c = d.vec3f(u.c_cloud);
  c = std.mix(c, u.c_bloom, std.step(0.52, h));
  c = std.mix(c, u.c_sky, std.step(0.86, h));
  return c;
});

const drosteRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32],
  d.vec3f
)((fragCoord, drosteCloud, drosteHaze, drosteBloom) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const R = std.max(u.p_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  const pl = uv.div(R);
  const z = std.sqrt(std.max(1 - std.dot(pl, pl), 0));

  // integrated clock: the flight inward
  const fall = u.p_fall;
  // integrated clock: weather
  const drift = u.p_drift;

  /*
   * The frame tilt is a STATIC angle, not an integrated clock like the roll
   * every other orb here gets. Those clocks seed at a random phase per
   * mount, which is exactly right for a field with no preferred direction
   * and exactly wrong for a picture: it lands the sky down one side of the
   * ball and the meadow up the other. This one has an up.
   */
  const sw = u.p_tilt;

  // stereographic wrap — the tunnel is inside the ball, and compresses
  // toward the limb the way a texture on a sphere does
  let p = pl.div(z + 1 + u.p_bulge).mul(u.p_scale);
  p = std.mul(rot2(sw), p);

  /*
   * The Chebyshev norm makes the level sets SQUARES. The floor on it is
   * what keeps the logarithm finite at the dead centre; the haze below
   * covers that last pixel anyway.
   */
  const m = std.max(std.max(std.abs(p.x), std.abs(p.y)), 0.002);

  const K = std.max(u.p_ratio, 1.05);
  const L = std.log2(m) / std.log2(K) + fall;

  // direction, on the unit square boundary
  const q = p.div(m);
  // this fragment's radius in base-frame units
  const sm = std.pow(K, std.fract(L));
  // where it lands in the base picture
  const P = q.mul(sm);

  // picture height, about -1 at the bottom edge
  const Yn = P.y / K;
  // distance around the frame
  const arc = squareArc(q);

  // ---- sky -----------------------------------------------------------
  let col = std.mix(u.c_sky.mul(0.72), u.c_sky, std.clamp(Yn * 1.3, 0, 1));

  /*
   * Cloud and land are both read in BASE-PICTURE coordinates, so every
   * frame carries the same weather at its own scale — which is the whole
   * point of a picture that contains itself.
   */
  const skyMask = std.smoothstep(u.p_horizon - 0.3, u.p_horizon + 0.2, Yn);
  let cl = fbm(P.mul(u.p_cloudScale).add(d.vec2f(drift, drift * 0.3)));
  cl = std.smoothstep(drosteCloud, drosteCloud + 0.16, cl);
  col = std.mix(col, u.c_cloud, cl * (0.2 + 0.8 * skyMask));

  // ---- land ----------------------------------------------------------
  /*
   * The smear. Sampled on (distance around the frame, frame index) with a
   * low frequency on the second axis, so features run LONG in the
   * direction the recursion stretches them — the streaked walls of the
   * reference, straight out of the geometry.
   */
  const streak = fbm(d.vec2f(arc * u.p_streakFreq, L * u.p_streakRad));

  let land = std.mix(u.c_canopy, u.c_meadow, std.smoothstep(0.02, -0.62, Yn));
  land = land.mul(0.42 + 1.25 * streak);

  // water: the low ground holds it where the streak field pools
  const water =
    std.smoothstep(0.42, 0.16, streak) * std.smoothstep(0.05, -0.3, Yn);
  land = std.mix(land, u.c_water, water * u.p_water);

  /*
   * Flowers, hashed one to a cell on the same (around, index) grid, jittered
   * inside it. Densest low in the picture and gone by the horizon.
   */
  const fg = d.vec2f(arc * u.p_flowerScale, L * u.p_flowerScale * 0.3);
  const fc = std.floor(fg);
  const ff = std.fract(fg).sub(0.5);
  const dcv = ff.sub(
    d
      .vec2f(hash(fc.add(3.7)), hash(fc.add(19.1)))
      .sub(0.5)
      .mul(0.6)
  );
  const petal = std.smoothstep(
    u.p_flowerSize,
    u.p_flowerSize * 0.35,
    std.length(dcv)
  );
  const present = std.step(1 - drosteBloom, hash(fc.add(51.3)));
  const meadow = std.smoothstep(0.13, -0.38, Yn);
  land = std.mix(
    land,
    drosteFlower(hash(fc.add(7.9))),
    petal * present * meadow
  );

  const landMask =
    1 - std.smoothstep(u.p_horizon - 0.12, u.p_horizon + 0.16, Yn);
  col = std.mix(col, land, landMask);

  /*
   * The picture's own edge. Darkening across the frame and resetting hard
   * at its boundary is not an artefact to smooth away — it draws the
   * nested borders the reference is built out of.
   */
  col = col.mul(std.mix(1, u.p_frameShade, std.fract(L)));

  /*
   * Aerial perspective, from the SCREEN radius. Every frame has the same
   * fractional part, so depth cannot come from inside a frame — it has to
   * come from how far in the fragment sits. This is what makes the middle
   * read as far away instead of merely small.
   */
  const deep = 1 - std.smoothstep(0, u.p_hazeRange, m);
  col = std.mix(col, u.c_sky, deep * drosteHaze);

  col = std.pow(std.max(col, d.vec3f()), d.vec3f(u.p_contrast)).mul(u.p_gain);

  const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
  col = std.mix(d.vec3f(lum), col, u.p_saturation);

  // dome shading, kept light — this is a window, not a lit surface
  const n = d.vec3f(pl, z);
  const lambert = std.clamp(
    std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.72))),
    0,
    1
  );
  col = col.mul(0.72 + u.p_light * lambert);

  // the glass: a strong fresnel is what turns a picture into a sphere
  // with a world inside it
  const fres = 1 - z;
  const fresCubed = fres * fres * fres;
  col = col.add(u.c_sheen.mul(u.p_rim * fresCubed));

  return col;
});

const orb30Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // Volume coupling: the user's voice thickens the weather, the agent's
    // clears the haze and brings the meadow into flower.
    const drosteCloud = std.clamp(
      u.p_cloudCover - 0.12 * u.inputVol,
      0.02,
      0.98
    );
    const drosteHaze = u.p_haze * (1 - 0.25 * u.outputVol);
    const drosteBloom = std.clamp(
      u.p_flowerDensity * (1 + 0.5 * u.outputVol),
      0,
      1
    );

    const mask = std.smoothstep(
      0.012,
      -0.012,
      std.length(orbUv) - std.max(u.p_radius, 0.001)
    );

    // Two fbm evaluations and a flower grid per sample — none of it worth
    // paying for outside the silhouette.
    if (mask <= 0) {
      return d.vec4f();
    }

    const col = drosteRender(fragCoord, drosteCloud, drosteHaze, drosteBloom);

    // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
    // opposite convention from the emissive orbs (see orb-31).
    const a = mask;
    return d.vec4f(std.max(col, d.vec3f()).mul(a), a);
  })
  .$name("orb30Fragment");

export const orb30Shader = tgpu.resolve([orb30Fragment]);

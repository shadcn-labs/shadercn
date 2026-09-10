import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

const Params = d.struct({
  anim: d.f32,
  c_body: d.vec3f,
  c_sheen: d.vec3f,
  c_tint: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_bulge: d.f32,
  p_contrast: d.f32,
  p_floorLevel: d.f32,
  p_freq: d.f32,
  p_gain: d.f32,
  p_lens: d.f32,
  p_light: d.f32,
  p_poleSoft: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_ring: d.f32,
  p_saturation: d.f32,
  p_scale: d.f32,
  p_slide: d.f32,
  p_spread: d.f32,
  p_swirl: d.f32,
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

/*
 * Softened tangent. Equal to sin/cos wherever cos is not near zero, capped
 * at 1/(2*sqrt(g)) where it is — see the header for why the raw pole cannot
 * be supersampled away.
 */
const tanSoft = tgpu.fn(
  [d.vec2f, d.f32],
  d.vec2f
)((x, g) => {
  "use gpu";
  const s = std.sin(x);
  const c = std.cos(x);
  return s.mul(c).div(c.mul(c).add(g));
});

const causticRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32],
  d.vec3f
)((fragCoord, causticSoft, causticGain, causticSpread) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const R = std.max(u.p_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  const pl = uv.div(R);
  const z = std.sqrt(std.max(1 - std.dot(pl, pl), 0));

  // integrated clock: the rings travel
  const ring = u.p_ring;

  // stereographic wrap of the unrotated dome, as in orb-08 — the lens
  // lattice compresses toward the limb the way a texture on a sphere does
  let p = d.vec2f(pl.div(z + 1 + u.p_bulge).mul(u.p_scale));

  // projection-safe 2D motion: the lattice turns and slides
  // integrated clock
  const sw = u.p_swirl;
  p = std.mul(rot2(sw), p);
  // integrated clock
  p = p.add(d.vec2f(u.p_slide, u.p_slide * 0.6));

  /*
   * The lens lattice. Adding p back to its own tangent is what gives every
   * cell a different view instead of tiling one image — see the header.
   */
  const L = std.length(tanSoft(p, causticSoft).mul(u.p_lens).add(p));

  /*
   * One cosine, three phases. The listing's (0, .7, 1) sit well under a
   * radian apart, so the channels overlap through most of a band and only
   * separate at its shoulders — white cores with coloured edges, not three
   * independent rainbows.
   */
  let col = std.cos(
    d
      .vec3f(0, 0.7, 1)
      .mul(causticSpread)
      .add(L * u.p_freq - ring)
  );

  // the listing's clamp: half of every period is hard black, and that is
  // what makes these read as bands rather than as a gradient
  col = std.max(col, d.vec3f()).mul(causticGain);

  col = std.pow(col, d.vec3f(u.p_contrast));

  const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
  col = std.mix(d.vec3f(lum), col, u.p_saturation).mul(u.c_tint);

  // a dark body under the bands, so the black half of the cosine reads as
  // the ball rather than as a hole in it
  col = col.add(u.c_body.mul(u.p_floorLevel));

  // dome shading keeps the ball a ball under the lattice
  const n = d.vec3f(pl.x, pl.y, z);
  const lambert = std.clamp(
    std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.72))),
    0,
    1
  );
  col = col.mul(0.6 + u.p_light * lambert);

  const fres = 1 - z;
  const fresCubed = fres * fres * fres;
  col = col.add(u.c_sheen.mul(u.p_rim * fresCubed));

  return col;
});

const orb05Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // Volume coupling: the user's voice lets the walls crowd tighter, the
    // agent's brightens the bands and opens the colour split.
    const causticSoft = std.max(u.p_poleSoft * (1 - 0.5 * u.inputVol), 0.0008);
    const causticGain = u.p_gain * (0.85 + 0.45 * u.outputVol);
    const causticSpread = u.p_spread * (1 + 0.5 * u.outputVol);

    const mask = std.smoothstep(
      0.012,
      -0.012,
      std.length(orbUv) - std.max(u.p_radius, 0.001)
    );

    if (mask <= 0) {
      return d.vec4f();
    }

    const col = causticRender(
      fragCoord,
      causticSoft,
      causticGain,
      causticSpread
    );

    // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
    // opposite convention from the emissive orbs (see orb-31).
    return d.vec4f(std.max(col, d.vec3f()).mul(mask), mask);
  })
  .$name("orb05Fragment");

export const orb05Shader = tgpu.resolve([orb05Fragment]);

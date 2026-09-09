import { d, std, tgpu } from "typegpu";

/*
 * Ported from orbkit SHDR-06 (GLSL) to TypeGPU: a hundred-layer moiré
 * lattice stack seen through a stereographic dome.
 * Original: https://github.com/zzzzshawn/orbkit
 */

const LAYERS = 100;

const Params = d.struct({
  anim: d.f32,
  c_sheen: d.vec3f,
  c_tint: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_bulge: d.f32,
  p_contrast: d.f32,
  p_depth: d.f32,
  p_drift: d.f32,
  p_exposure: d.f32,
  p_freq: d.f32,
  p_glowSize: d.f32,
  p_hueRate: d.f32,
  p_light: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_saturation: d.f32,
  p_scale: d.f32,
  p_speed: d.f32,
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

const moireRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32],
  d.vec3f
)((fragCoord, moireDrift, moireGlow, moireHue) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const R = std.max(u.p_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  const pl = uv.div(R);
  const z = std.sqrt(std.max(1 - std.dot(pl, pl), 0));

  // integrated clock
  const t = u.p_speed;

  /*
   * The layer-zero projection: the plain stereographic wrap of the dome's
   * surface. Every deeper layer is this divided by its own denominator, so
   * the whole parallax below costs one ratio per layer.
   */
  const bulge = 1 + u.p_bulge;
  const den0 = z + bulge;

  let w = d.vec2f(pl.div(den0).mul(u.p_scale));

  let acc = d.vec3f();

  for (const li of std.range(LAYERS)) {
    const f = d.f32(li) + 1;
    const layerT = f / d.f32(LAYERS);

    /*
     * This layer's depth along the view ray, and the projection from the
     * point the ray has reached there. At depth 0 the denominator is den0
     * and the ratio is 1; deeper layers see the pattern from further
     * inside the ball, which spreads them at the limb and not at all
     * through the centre. That gradient is what shears the stack.
     */
    const depth = layerT * u.p_depth;
    const denu =
      z -
      depth +
      bulge * std.sqrt(std.max(1 - 2 * depth * z + depth * depth, 0));
    const q = w.mul(den0 / std.max(denu, 0.05));

    /*
     * One lattice. sin(q * k) vanishes on a rectangular grid of points and
     * the reciprocal of its length lights every one; the floor on that
     * length is the glow's radius, and without it the divide is by exactly
     * zero at every lattice point.
     *
     * The listing's sin(r + f), minus the resolution. The components are a
     * quarter turn apart so the per-layer frequency pair walks a circle —
     * the base value only sets where on that circle layer one starts.
     */
    const k = std
      .sin(d.vec2f(11.3, 12.87).add(f))
      .div(std.max(u.p_freq, 0.001));
    const g = std.max(std.length(std.sin(q.mul(k))), moireGlow);

    // tint by layer index — depth through the stack reads as hue
    const hue = std.cos(d.vec3f(0, 1, 3).add(f * moireHue)).add(1.1);

    acc = acc.add(hue.div(g));

    // the listing's walk between layers: the stack is a hundred grids
    // each shifted a little further along a wandering path
    w = w.add(std.sin(w.yx.add(t)).mul(moireDrift));
  }

  /*
   * The listing's knee is tanh(o*o/4e4) over an unnormalized sum of a
   * hundred layers. Dividing by the layer count first pulls the square's
   * scale down by 100*100, so the same knee is exactly 4 here — a number
   * that fits on a slider. The square is a contrast squarer, not a tone
   * map: it crushes the field between the glows.
   */
  const v = acc.div(d.f32(LAYERS));
  let col = tanh3(v.mul(v).div(std.max(u.p_exposure, 0.0001)));
  col = std.pow(std.clamp(col, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

  // saturation about luminance, then the tint
  const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
  col = std.mix(d.vec3f(lum), col, u.p_saturation).mul(u.c_tint);

  /*
   * Dome shading, kept gentle: the layers are emission seen THROUGH the
   * ball, so a hard lambert reads as a shadow thrown across the inside of
   * a lamp rather than as a lit surface.
   */
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

const orb06Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // Volume coupling: the user's voice widens the walk between layers, the
    // agent's opens the glows and runs the hue through the stack faster.
    const moireDrift = u.p_drift * (1 + 0.6 * u.inputVol);
    const moireGlow = std.max(u.p_glowSize * (1 - 0.3 * u.outputVol), 0.002);
    const moireHue = u.p_hueRate * (1 + 0.35 * u.outputVol);

    const mask = std.smoothstep(
      0.012,
      -0.012,
      std.length(orbUv) - std.max(u.p_radius, 0.001)
    );

    // A hundred lattices per sample, none of them worth paying for outside
    // the silhouette.
    if (mask <= 0) {
      return d.vec4f();
    }

    const col = moireRender(fragCoord, moireDrift, moireGlow, moireHue);

    // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
    // opposite convention from the emissive orbs (see orb-31).
    return d.vec4f(std.max(col, d.vec3f()).mul(mask), mask);
  })
  .$name("orb06Fragment");

export const orb06Shader = tgpu.resolve([orb06Fragment]);

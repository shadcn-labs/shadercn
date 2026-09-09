import { d, std, tgpu } from "typegpu";

/*
 * Ported from orbkit SHDR-25 (GLSL) to TypeGPU: crease-filigree on a dome.
 * Original: https://github.com/zzzzshawn/orbkit
 */

const OCTAVES = 8;

const Params = d.struct({
  anim: d.f32,
  c_body: d.vec3f,
  c_sheen: d.vec3f,
  c_tint: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_blur: d.f32,
  p_bulge: d.f32,
  p_contrast: d.f32,
  p_drift: d.f32,
  p_edgeGain: d.f32,
  p_exposure: d.f32,
  p_floorLevel: d.f32,
  p_fringe: d.f32,
  p_light: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_ripple: d.f32,
  p_saturation: d.f32,
  p_scale: d.f32,
  p_speed: d.f32,
  p_swirl: d.f32,
  p_warp: d.f32,
  p_zoom: d.f32,
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

const tanh1 = tgpu.fn(
  [d.f32],
  d.f32
)((xIn) => {
  "use gpu";
  const x = std.clamp(xIn, -10, 10);
  const e = std.exp(2 * x);
  return (e - 1) / (e + 1);
});

/*
 * The whole chain for one pixel centre: dome, stereographic wrap, then the
 * eight-octave warp. Called three times per sample so the derivative below
 * can be differenced — fwidth is unavailable.
 */
const creaseField = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32, d.f32],
  d.vec2f
)((fragCoord, t, drift, sw, creaseWarp) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const pl = uv.div(std.max(u.p_radius, 0.001));
  const z = std.sqrt(std.max(1 - std.dot(pl, pl), 0));

  let p = pl.div(z + 1 + u.p_bulge).mul(u.p_scale);
  p = std.mul(rot2(sw), p);
  p = p.add(drift);

  /*
   * The listing's matrix, decomposed. mat2x2(vec2(6,-8), vec2(8,6))/9 is
   * (10/9) * mat2x2(vec2(.6,-.8), vec2(.8,.6)), and that second factor is a
   * true rotation because 6-8-10 is a Pythagorean triple — so the octave
   * transform is a rotation through the 3-4-5 angle times a clean zoom.
   */
  const octaveRot = d.mat2x2f(d.vec2f(0.6, -0.8), d.vec2f(0.8, 0.6));
  for (const i of std.range(OCTAVES)) {
    const fi = d.f32(i) + 1;
    p = p.add(std.sin(p.add(t).add(fi)).mul(creaseWarp));
    p = std.mul(octaveRot, p).mul(u.p_zoom);
  }

  return p;
});

const creaseRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.vec3f
)((fragCoord, creaseWarp, creaseGain) => {
  "use gpu";
  const u = layout.$.params;
  const t = u.p_speed;
  const drift = u.p_drift;
  const sw = u.p_swirl;

  /*
   * The three taps the difference needs. p_blur is how far apart they sit:
   * at one pixel this is fwidth exactly, and wider is a deliberate blur —
   * the derivative of a folded field is a hairline, and a rim wants width.
   */
  const p0 = creaseField(fragCoord, t, drift, sw, creaseWarp);
  const px = creaseField(
    fragCoord.add(d.vec2f(u.p_blur, 0)),
    t,
    drift,
    sw,
    creaseWarp
  );
  const py = creaseField(
    fragCoord.add(d.vec2f(0, u.p_blur)),
    t,
    drift,
    sw,
    creaseWarp
  );

  /*
   * fwidth, by hand and once per channel. The sum of the absolute
   * differences on each axis is exactly what the built-in returns — but
   * taking it three times at slightly offset ripple phases puts each
   * channel's rim in a slightly different place, which is where the warm
   * and cool fringes on the edges come from.
   */
  let e = d.vec3f();
  for (const c of std.range(3)) {
    const ph = d.f32(c) * u.p_fringe;
    const v0 = std.sin(p0.mul(u.p_ripple).add(ph));
    const delta = std
      .abs(std.sin(px.mul(u.p_ripple).add(ph)).sub(v0))
      .add(std.abs(std.sin(py.mul(u.p_ripple).add(ph)).sub(v0)));
    const m = tanh1(
      (std.length(delta) * creaseGain) / std.max(u.p_exposure, 0.001)
    );
    if (c === 0) {
      e = d.vec3f(m, e.y, e.z);
    } else if (c === 1) {
      e = d.vec3f(e.x, m, e.z);
    } else {
      e = d.vec3f(e.x, e.y, m);
    }
  }

  e = std.pow(std.clamp(e, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

  let col = u.c_tint.mul(e);

  // a dark body under the filigree, so the flat regions read as the ball
  col = col.add(u.c_body.mul(u.p_floorLevel));

  const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
  col = std.mix(d.vec3f(lum), col, u.p_saturation);

  // dome shading keeps the ball a ball under the folds
  const pl = fragCoord
    .mul(2)
    .sub(u.res)
    .div(std.min(u.res.x, u.res.y))
    .div(std.max(u.p_radius, 0.001));
  const z = std.sqrt(std.max(1 - std.dot(pl, pl), 0));
  const n = d.vec3f(pl.x, pl.y, z);
  const lambert = std.clamp(
    std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.72))),
    0,
    1
  );
  col = col.mul(0.62 + u.p_light * lambert);

  let fres = 1 - z;
  fres = fres * fres * fres;
  col = col.add(u.c_sheen.mul(u.p_rim * fres));

  return col;
});

const orb25Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // Volume coupling: the user's voice folds the field harder, the agent's
    // steepens what counts as a crease.
    const creaseWarp = u.p_warp * (1 + 0.4 * u.inputVol);
    const creaseGain = u.p_edgeGain * (1 + 0.5 * u.outputVol);

    const mask = std.smoothstep(
      0.012,
      -0.012,
      std.length(orbUv) - std.max(u.p_radius, 0.001)
    );

    // Twenty-four warp steps per sample — none of them worth paying for
    // outside the silhouette.
    if (mask <= 0) {
      return d.vec4f();
    }

    const col = creaseRender(fragCoord, creaseWarp, creaseGain);

    // Surface orb bounded by a mask: alpha IS coverage, so premultiply
    const a = mask;
    return d.vec4f(std.max(col, d.vec3f()).mul(a), a);
  })
  .$name("orb25Fragment");

export const orb25Shader = tgpu.resolve([orb25Fragment]);

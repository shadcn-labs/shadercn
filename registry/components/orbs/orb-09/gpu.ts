import { d, std, tgpu } from "typegpu";

/*
 * Ported from orbkit SHDR-09 (GLSL) to TypeGPU: polar iris rings on a
 * tilted dome, each ring re-warped from the original point.
 * Original: https://github.com/zzzzshawn/orbkit
 */

const RINGS = 10;
const TURB = 9;

const Params = d.struct({
  anim: d.f32,
  c_sheen: d.vec3f,
  c_tint: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_contrast: d.f32,
  p_exposure: d.f32,
  p_fringe: d.f32,
  p_fringeSoft: d.f32,
  p_glow: d.f32,
  p_inner: d.f32,
  p_light: d.f32,
  p_lineSoft: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_ringPhase: d.f32,
  p_saturation: d.f32,
  p_scale: d.f32,
  p_seed: d.f32,
  p_speed: d.f32,
  p_spin: d.f32,
  p_tilt: d.f32,
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

const irisRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32],
  d.vec3f
)((fragCoord, irisWarp, irisGlow, irisFringe) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const R = std.max(u.p_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  const pl = uv.div(R);
  const z = std.sqrt(std.max(1 - std.dot(pl, pl), 0));
  const n = d.vec3f(pl.x, pl.y, z);

  // integrated clock
  const t = u.p_speed;

  // tilt about X, then roll about Y on its own integrated clock
  const ct = std.cos(u.p_tilt);
  const st = std.sin(u.p_tilt);
  let sp = d.vec3f(n.x, n.y * ct - n.z * st, n.y * st + n.z * ct);
  const cr = std.cos(u.p_spin);
  const sr = std.sin(u.p_spin);
  sp = d.vec3f(sp.x * cr - sp.z * sr, sp.y, sp.x * sr + sp.z * cr);

  /*
   * Radius becomes the polar angle from the dome's axis (see the header),
   * so ring i lands on the latitude at angle i / p_scale and the rings
   * crowd toward the limb the way a globe's latitudes do. acos is defined
   * on the whole sphere, so the roll above can put the axis anywhere —
   * including behind the visible face, which sweeps the outer rings into
   * view over the limb.
   */
  const pol = std.acos(std.clamp(sp.z, -1, 1));
  const dir = sp.xy.div(std.max(std.length(sp.xy), 1e-4));
  const p = dir.mul(pol * u.p_scale);

  let acc = d.vec3f();

  for (const ri of std.range(RINGS)) {
    const i = d.f32(ri) + 1;

    /*
     * Each ring re-warps the ORIGINAL point with its own seed, exactly as
     * the listing does — this loop is why the rings tear differently
     * instead of nesting like tree rings.
     */
    let v = d.vec2f(p);
    for (const j of std.range(TURB)) {
      const f = d.f32(j) + 1;
      v = v.add(
        std
          .sin(std.ceil(v.mul(f).add(i * u.p_seed)).sub(t * 0.5))
          .mul(irisWarp)
          .div(f)
      );
    }

    const l = std.length(v) - i;

    // the asymmetric absolute value, with the floor doubling as the line
    // width — a wider floor is a fatter, softer wavefront
    const side = std.max(std.max(l, -u.p_inner * l), u.p_lineSoft);

    /*
     * The hue sweep, softened. l/(l*l+g) tracks 1/l off the ring and rolls
     * over to a finite peak on it, so the rainbow compresses into a fringe
     * of finite width instead of an aliased band.
     */
    const fr = (irisFringe * l) / (l * l + u.p_fringeSoft);
    const hue = std
      .cos(d.vec3f(0, 1, 2).add(t - i * u.p_ringPhase + fr))
      .add(1.1);

    acc = acc.add(hue.mul(irisGlow / side));
  }

  // the listing's tanh knee, with the divisor exposed
  let col = tanh3(acc.div(std.max(u.p_exposure, 0.001)));
  col = std.pow(std.clamp(col, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

  // saturation about luminance, then the tint
  const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
  col = std.mix(d.vec3f(lum), col, u.p_saturation).mul(u.c_tint);

  // dome shading keeps the ball a ball under the rings — gentler than the
  // sibling orbs use, because these rings are emission and a hard lambert
  // reads as a shadow thrown across a light source
  const lambert = std.clamp(
    std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.72))),
    0,
    1
  );
  col = col.mul(0.55 + u.p_light * lambert);

  const fres = 1 - z;
  const fresCubed = fres * fres * fres;
  col = col.add(u.c_sheen.mul(u.p_rim * fresCubed));

  return col;
});

const orb09Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // Volume coupling: the user's voice tears the rings harder, the agent's
    // brightens them and opens the rainbow fringe.
    const irisWarp = u.p_warp * (1 + 0.5 * u.inputVol);
    const irisGlow = u.p_glow * (0.85 + 0.5 * u.outputVol);
    const irisFringe = u.p_fringe * (1 + 0.6 * u.outputVol);

    const mask = std.smoothstep(
      0.012,
      -0.012,
      std.length(orbUv) - std.max(u.p_radius, 0.001)
    );

    // Ninety sines per sample before supersampling — none of them worth
    // paying for outside the silhouette.
    if (mask <= 0) {
      return d.vec4f();
    }

    const col = irisRender(fragCoord, irisWarp, irisGlow, irisFringe);

    // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
    // opposite convention from the emissive orbs (see orb-31).
    return d.vec4f(std.max(col, d.vec3f()).mul(mask), mask);
  })
  .$name("orb09Fragment");

export const orb09Shader = tgpu.resolve([orb09Fragment]);

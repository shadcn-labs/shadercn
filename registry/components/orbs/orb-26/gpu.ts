import { d, std, tgpu } from "typegpu";

/*
 * Ported from orbkit SHDR-26 (GLSL) to TypeGPU: a crazed glaze lattice.
 * Original: https://github.com/zzzzshawn/orbkit
 */

const OCTAVES = 9;
const TAU = 6.283_185_307_18;

const Params = d.struct({
  anim: d.f32,
  c_deep: d.vec3f,
  c_hot: d.vec3f,
  c_line: d.vec3f,
  c_sheen: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_bulge: d.f32,
  p_contrast: d.f32,
  p_core: d.f32,
  p_drift: d.f32,
  p_floor: d.f32,
  p_gain: d.f32,
  p_light: d.f32,
  p_pole: d.f32,
  p_poleSoft: d.f32,
  p_pulse: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_scale: d.f32,
  p_sharp: d.f32,
  p_speed: d.f32,
  p_split: d.f32,
  p_swirl: d.f32,
  p_warp: d.f32,
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

const hash = tgpu.fn(
  [d.vec2f],
  d.f32
)((p) =>
  std.fract(std.sin(std.dot(p, d.vec2f(127.1, 311.7))) * 43_758.545_312_3)
);

const latticeRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32],
  d.vec3f
)((fragCoord, latticePole, latticeSharp, latticeGain) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const R = std.max(u.p_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  const pl = uv.div(R);
  const z = std.sqrt(std.max(1 - std.dot(pl, pl), 0));
  const n = d.vec3f(pl.x, pl.y, z);

  const t = u.p_speed;

  /*
   * Stereographic projection of the UNROTATED dome.
   *
   * This orb was built on the abs(sp.z) form first — the one orb-28 and
   * orb-29 use, which survives a 3D roll because the divisor can only fall
   * TO zero at the terminator, never through it. It renders, but every
   * quarter turn it makes the visible hemisphere an EXACT mirror image
   * about the view axis. A cellular grid hides that. A web of long threads
   * does not — the ball turns into a Rorschach blot for a quarter of every
   * revolution.
   *
   * So the dome stays put, as in orb-08, and all the motion below is
   * projection-safe 2D.
   */
  let p = n.xy.div(n.z + 1 + u.p_bulge).mul(u.p_scale);

  // the plane turns while the lattice drifts across it, so the crazing
  // migrates over the glaze instead of sitting welded to it
  const sw = u.p_swirl;
  p = std.mul(rot2(sw), p);
  p = d.vec2f(p.x + u.p_drift, p.y);

  /*
   * A fractional offset off the pattern origin. The listing carries the
   * resolution here; it cancels out of the pole term exactly but it does
   * keep the lattice off centre, and without something in its place a cell
   * corner sits pinned at the dead middle of the ball.
   */
  p = p.add(d.vec2f(0.37, 0.21));

  // the cell the sample starts in, fixed before the warp — everything the
  // pole term does is relative to THIS corner, not to wherever c wanders
  const cell = std.floor(p);

  /*
   * Each cell knots on its own hashed phase, so the grid breathes instead
   * of pulsing as one sheet. The rate is a constant, not a slider: this
   * multiplies the integrated clock, and a slider there would jump the
   * phase of every cell on a state change.
   */
  const breathe = 1 + u.p_pulse * std.sin(TAU * hash(cell) + t * 0.35);

  let c = d.vec2f(p);
  for (const j of std.range(OCTAVES)) {
    const i = d.f32(j) + 1;

    /*
     * The lattice pole, softened. d/(d*d+g) tracks 1/d away from the cell
     * corner and rolls over to a finite peak at it, so the phase stays
     * band-limited and the knot has a SIZE — p_poleSoft is that size.
     */
    const delta = cell.sub(c);
    const pole = delta
      .div(delta.mul(delta).add(d.vec2f(u.p_poleSoft)))
      .mul(latticePole * breathe);

    c = c.add(std.cos(c.yx.mul(i).add(pole).add(t)).mul(u.p_warp).div(i));
  }

  /*
   * The listing's tone map: a thin ridge every PI with an exponential
   * falloff. The per-channel offsets are kept as their original ratio
   * (0, 2, 1) so one slider widens the whole split.
   */
  const x = d.vec3f(c.y).add(d.vec3f(0, 2, 1).mul(u.p_split));
  const thread = std.exp(std.abs(std.sin(x)).mul(-latticeSharp));

  const lev = std.dot(thread, d.vec3f(1 / 3));

  /*
   * The exp() floor never reaches zero, so the shell is lit between the
   * threads by construction — the body colour is added under it rather
   * than filling a hole. The thread term stays PER-CHANNEL through the
   * palette multiply; collapsing it to lev first would throw away the
   * filament split.
   */
  let col = u.c_deep.mul(u.p_floor);
  /*
   * The ramp between the two thread colours runs nearly the whole range of
   * lev deliberately. Started at 0.35 it reached c_hot across most of the
   * visible web, and the state palettes, which ride on c_line, never got
   * to the eye at all.
   */
  col = col.add(
    thread
      .mul(std.mix(u.c_line, u.c_hot, std.smoothstep(0.12, 1, lev)))
      .mul(latticeGain)
  );

  /*
   * A tight second read of the same ridge, added on top: raising a value
   * that is already exp(-k*|sin|) to a high power is the same ridge at a
   * fraction of the width, which lands as a hot core inside each thread.
   * Taken from lev — the MEAN of the three channels — deliberately, so the
   * core is achromatic and lands only where all three filaments coincide.
   */
  let core = lev * lev;
  core *= core;
  col = col.add(u.c_hot.mul(core * u.p_core));

  col = std.pow(std.max(col, d.vec3f()), d.vec3f(u.p_contrast));

  // dome shading keeps the ball a ball under the web
  const lambert = std.clamp(
    std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.72))),
    0,
    1
  );
  col = col.mul(0.35 + u.p_light * lambert);

  // fresnel sheen: the glaze the threads are crazed into
  let fres = 1 - z;
  fres = fres * fres * fres;
  col = col.add(u.c_sheen.mul(u.p_rim * fres));

  return col;
});

const orb26Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // Volume coupling: the user's voice tightens the knots, the agent's
    // thickens the threads and brightens them.
    const latticePole = u.p_pole * (1 + 0.8 * u.inputVol);
    const latticeSharp = u.p_sharp * (1 - 0.25 * u.outputVol);
    const latticeGain = u.p_gain * (0.85 + 0.4 * u.outputVol);

    const mask = std.smoothstep(
      0.012,
      -0.012,
      std.length(orbUv) - std.max(u.p_radius, 0.001)
    );

    // Nothing outside the silhouette is ever visible, so skip the warps
    if (mask <= 0) {
      return d.vec4f();
    }

    const col = latticeRender(
      fragCoord,
      latticePole,
      latticeSharp,
      latticeGain
    );

    // Surface orb bounded by a mask: alpha IS coverage, so premultiply
    const a = mask;
    return d.vec4f(std.max(col, d.vec3f()).mul(a), a);
  })
  .$name("orb26Fragment");

export const orb26Shader = tgpu.resolve([orb26Fragment]);

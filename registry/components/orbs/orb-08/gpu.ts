import { d, std, tgpu } from "typegpu";

/*
 * Ported from orbkit SHDR-08 (GLSL) to TypeGPU: nacreous bands on a
 * rolling dome, with a slow warp beat.
 * Original: https://github.com/zzzzshawn/orbkit
 */

const OCTAVES = 10;
const TAU = 6.283_185_307_18;

const Params = d.struct({
  anim: d.f32,
  c_crest: d.vec3f,
  c_deep: d.vec3f,
  c_low: d.vec3f,
  c_sheen: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_beat: d.f32,
  p_bulge: d.f32,
  p_contrast: d.f32,
  p_floor: d.f32,
  p_flow: d.f32,
  p_gain: d.f32,
  p_iris: d.f32,
  p_irisScale: d.f32,
  p_light: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_scale: d.f32,
  p_speed: d.f32,
  p_split: d.f32,
  p_swirl: d.f32,
  p_thick: d.f32,
  p_view: d.f32,
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

const tanh3 = tgpu.fn(
  [d.vec3f],
  d.vec3f
)((x) => {
  "use gpu";
  const clamped = std.clamp(x, d.vec3f(-10), d.vec3f(10));
  const e = std.exp(clamped.mul(2));
  return e.sub(1).div(e.add(1));
});

/*
 * The listing's entire tone map: o = tanh(.2 / tan(x)); o *= o.
 *
 * The square folds the sign, so abs() on the denominator is not an
 * approximation here — it is exact, and it removes the branch.
 */
const cotBands = tgpu.fn(
  [d.vec3f, d.f32],
  d.vec3f
)((x, k) => {
  "use gpu";
  const b = tanh3(
    std
      .cos(x)
      .mul(k)
      .div(std.max(std.abs(std.sin(x)), d.vec3f(1e-4)))
  );
  return b.mul(b);
});

const nacreRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32],
  d.vec3f
)((fragCoord, nacreWarp, nacreThick, nacreGain) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const R = std.max(u.p_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  const pl = uv.div(R);
  const z = std.sqrt(std.max(1 - std.dot(pl, pl), 0));
  const n = d.vec3f(pl.x, pl.y, z);

  const t = u.p_speed; // integrated clock: the boil

  /*
   * Stereographic projection, on the UNROTATED dome. Equal steps in screen
   * space map to ever-larger steps in pattern space toward the rim, which
   * is the foreshortening that sells a flat field as wrapped geometry.
   * p_bulge softens the divisor — higher flattens the shell back toward a
   * disc, lower crowds the layers into the limb.
   */
  let p = d.vec2f(n.xy.div(n.z + 1 + u.p_bulge).mul(u.p_scale));

  // projection-safe 2D motion, in place of a dome spin: the plane turns,
  // and the bands travel across themselves
  const sw = u.p_swirl; // integrated clock
  p = std.mul(rot2(sw), p);
  p = d.vec2f(p.x, p.y - u.p_flow); // integrated clock

  /*
   * The ten-octave feedback warp. q is fed back into itself with the
   * components swapped, so each octave curls what the last one drew.
   * The listing's +r, minus the resolution dependence (see the header).
   */
  let q = d.vec2f(p);
  for (const j of std.range(OCTAVES)) {
    const i = d.f32(j) + 1;
    q = q.add(
      std
        .sin(
          q.yx
            .mul(i)
            .add(i * i + t * i)
            .add(d.vec2f(4.7, 2.3))
        )
        .mul(nacreWarp)
        .div(i)
    );
  }

  // the bands, with the listing's uneven per-channel phase kept as a ratio
  // so one slider widens the whole split
  const band = cotBands(
    d.vec3f(q.y).add(d.vec3f(0, 1, 3).mul(u.p_split)),
    nacreThick
  );
  const lev = std.dot(band, d.vec3f(1 / 3));

  /*
   * A dark body colour under the bands, so the valleys read as the shell
   * itself rather than as holes punched through the ball. The band term
   * stays PER-CHANNEL through the palette multiply — that is what carries
   * the colour fringing; collapsing it to lev first would throw away the
   * only thing the vec4f phase was for.
   */
  let col = u.c_deep.mul(u.p_floor);
  col = col.add(
    band
      .mul(std.mix(u.c_low, u.c_crest, std.smoothstep(0.1, 0.9, lev)))
      .mul(nacreGain)
  );

  /*
   * Thin-film interference. The cosine palette is keyed to the band
   * coordinate, so every layer carries its own hue — the inside of a shell
   * — and p_view rotates that hue with the viewing angle through 1 - z,
   * which means the sphere's curvature is doing the colouring. Multiplied
   * in rather than mixed to, so it bends hues without erasing the palette.
   */
  const irid = std
    .cos(
      d
        .vec3f(0, 0.33, 0.67)
        .add(q.y * u.p_irisScale + (1 - z) * u.p_view + t * 0.03)
        .mul(TAU)
    )
    .mul(0.5)
    .add(0.5);
  col = std.mix(col, col.mul(irid.mul(1.9).add(0.25)), u.p_iris);

  col = std.pow(std.max(col, d.vec3f()), d.vec3f(u.p_contrast));

  // dome shading keeps the ball a ball under the pattern
  const lambert = std.clamp(
    std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.72))),
    0,
    1
  );
  col = col.mul(0.35 + u.p_light * lambert);

  // fresnel sheen: the wet gloss of a shell, and the thing that keeps the
  // limb reading as a surface where the bands have compressed to a blur
  let fres = 1 - z;
  fres = fres * fres * fres;
  col = col.add(u.c_sheen.mul(u.p_rim * fres));

  return col;
});

const orb08Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    /*
     * The BEAT: warp driven between 0.6 and 1.8 on a slow, unbroken cycle —
     * one full swing every second and a third — with nothing held at either
     * end. Warp is the amplitude of the octave loop that folds the bands, so
     * sweeping it three to one makes the whole field draw in and open again
     * rather than change colour or brightness — a swell, not a flash.
     *
     * Absolute bounds, so the range is exactly the range; that is why the mix
     * sits outside the volume term below. At beat zero nothing here applies
     * and the dialled warp stands, so a state that does not ask for it is
     * untouched.
     *
     * Well under 3Hz, which matters: above that a full-field oscillation is
     * in the band photosensitivity guidance warns about, and this one covers
     * the whole ball. The rate is the constant below — raising it much past
     * 18 walks back into that range.
     */
    const beat = 0.5 - 0.5 * std.cos(u.anim * 5);

    // Volume coupling: the user's voice churns the warp harder, the agent's
    // widens the crests and brightens them.
    const nacreWarp = std.mix(
      u.p_warp * (1 + 0.45 * u.inputVol),
      std.mix(0.6, 1.8, beat),
      u.p_beat
    );
    const nacreThick = u.p_thick * (1 + 0.6 * u.outputVol);
    const nacreGain = u.p_gain * (0.85 + 0.4 * u.outputVol);

    const mask = std.smoothstep(
      0.012,
      -0.012,
      std.length(orbUv) - std.max(u.p_radius, 0.001)
    );

    // Nothing outside the silhouette is ever visible, so skip AA * AA warps
    // for it rather than shading transparent sky.
    if (mask <= 0) {
      return d.vec4f();
    }

    const col = nacreRender(fragCoord, nacreWarp, nacreThick, nacreGain);

    // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
    // opposite convention from the emissive orbs (see orb-31).
    return d.vec4f(std.max(col, d.vec3f()).mul(mask), mask);
  })
  .$name("orb08Fragment");

export const orb08Shader = tgpu.resolve([orb08Fragment]);

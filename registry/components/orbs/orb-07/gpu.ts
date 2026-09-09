import { d, std, tgpu } from "typegpu";

/*
 * Ported from orbkit SHDR-07 (GLSL) to TypeGPU: torsion shells wound
 * about a travelling twist axis.
 * Original: https://github.com/zzzzshawn/orbkit
 */

const STEPS = 50;
const TURB = 9;

const Params = d.struct({
  anim: d.f32,
  c_tint: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_alphaGain: d.f32,
  p_camDist: d.f32,
  p_column: d.f32,
  p_contrast: d.f32,
  p_edge: d.f32,
  p_edgeFade: d.f32,
  p_envCore: d.f32,
  p_envRadius: d.f32,
  p_exposure: d.f32,
  p_fill: d.f32,
  p_focal: d.f32,
  p_hueDepth: d.f32,
  p_hueStep: d.f32,
  p_saturation: d.f32,
  p_scatter: d.f32,
  p_speed: d.f32,
  p_spin: d.f32,
  p_stepClamp: d.f32,
  p_stepScale: d.f32,
  p_tilt: d.f32,
  p_turb: d.f32,
  p_twist: d.f32,
  p_wave: d.f32,
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

// GLSL ES 1.0 has no round() — it arrived in ES 3.0. The listing quantizes
// with it, so it ships here. Halves round up rather than to even, which is
// what a lattice quantizer wants anyway.
const roundv = tgpu.fn([d.vec3f], d.vec3f)((x) => std.floor(x.add(0.5)));

const torsionRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.vec3f
)((fragCoord, torsionTurb, torsionTwist) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const ro = d.vec3f(0, 0, u.p_camDist);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, -u.p_focal));

  // integrated clock: cell flicker
  const shimmer = u.p_speed;
  // integrated clock: the travelling twist
  const wave = u.p_wave;
  // integrated clock: roll about the axis
  const spin = u.p_spin;

  // the axis lean and the roll, applied to the SAMPLE rather than to the
  // axis — see the header
  const ct = std.cos(u.p_tilt);
  const st = std.sin(u.p_tilt);
  const cs = std.cos(spin);
  const ss = std.sin(spin);

  // the twist axis, unit by construction, which is what makes the
  // Rodrigues rotation below exact
  const axis = d.vec3f(0, 1, 0);

  let acc = d.vec3f();

  // transmittance carried front-to-back — near shells veil far ones
  let T = d.f32(1);

  // march only the span the envelope can light, as in orb-01
  let z = std.max(u.p_camDist - u.p_envRadius * 1.3, 0);
  const zEnd = u.p_camDist + u.p_envRadius * 1.3;

  for (const it of std.range(STEPS)) {
    const world = ro.add(rd.mul(z));

    // into the axis frame: lean about X, then roll about Y
    let p = d.vec3f(
      world.x,
      world.y * ct + world.z * st,
      -world.y * st + world.z * ct
    );
    p = d.vec3f(p.x * cs - p.z * ss, p.y, p.x * ss + p.z * cs);

    /*
     * The travelling twist. h is the sample's radius (scaled by the twist
     * knob) minus the wave clock, and the line below is an exact rotation
     * about the axis by 90 degrees - h. Because h depends only on radius,
     * the winding is constant on spheres: the ball's own shells are the
     * structure, and raising p_twist puts more turns between the core and
     * the surface.
     */
    const h = std.length(p) * torsionTwist - wave;
    let a = std
      .mix(axis.mul(std.dot(axis, p)), p, std.sin(h))
      .add(std.cross(axis, p).mul(std.cos(h)));

    // cell-quantized turbulence: every lattice cell flickers on its own
    // phase, the same construction orb-22 uses
    for (const j of std.range(TURB)) {
      const dj = d.f32(j) + 1;
      a = a.add(
        std
          .sin(roundv(a.mul(dj)).sub(shimmer))
          .zxy.mul(torsionTurb)
          .div(dj)
      );
    }

    /*
     * The axial density. At p_column 0 this is the listing's
     * length(a.xz) — distance from the twist axis, so the step collapses
     * along the pole and the axis burns as a column. At 1 it is the plain
     * radial length and the column dissolves into shells.
     */
    let dist =
      u.p_stepScale * std.mix(std.length(a.xz), std.length(a), u.p_column);
    dist = std.max(dist, u.p_envRadius * 0.003);

    /*
     * The march's own colour code, from the listing: red constant, green
     * by DEPTH into the ball, blue by STEP INDEX — the opposite assignment
     * from orb-22, and the reason this orb runs cyan-blue where that
     * one runs red-green. Blue gets twice the clamp headroom: its ramp
     * runs to STEPS (50) where red is fixed at 3, and an equal clamp would
     * crush the step gradient first.
     */
    let w = d
      .vec3f(
        3,
        (z - u.p_camDist + u.p_envRadius) * u.p_hueDepth,
        d.f32(it) * u.p_hueStep
      )
      .div(dist);
    w = std.min(w, d.vec3f(u.p_stepClamp).mul(d.vec3f(1, 1, 2)));

    /*
     * Normalize the clamped weight back to family units, exactly as in
     * orb-22: without this line the clamp value leaks into total
     * energy and Exposure, Body fill and Diffusion all change meaning
     * whenever the clamp moves.
     */
    w = w.mul(20 / std.max(u.p_stepClamp, 1));

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    const env = std.smoothstep(
      u.p_envRadius * 1.12,
      u.p_envRadius * u.p_envCore,
      std.length(world)
    );
    w = w.add(u.p_fill).mul(env);

    acc = acc.add(w.mul(T));
    T *= std.exp(-std.dot(w, d.vec3f(0.299, 0.587, 0.114)) * u.p_scatter);

    z += dist;
    if (T < 0.004 || z > zEnd) {
      break;
    }
  }

  return acc;
});

const orb07Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);

    const torsionTurb = u.p_turb * (1 + 0.5 * u.inputVol);
    const torsionExposure = u.p_exposure * (1 - 0.35 * u.outputVol);
    // the ball winds tighter while the agent speaks
    const torsionTwist = u.p_twist * (1 + 0.4 * u.outputVol);

    const acc = torsionRender(fragCoord, torsionTurb, torsionTwist);

    // tanh tone map per channel — the envelope and transmittance change the
    // accumulator's scale, so the golfed /1e4 knee is a tunable here
    let col = tanh3(acc.div(std.max(torsionExposure, 1)));
    col = std.pow(std.clamp(col, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

    // saturation about luminance, then the tint
    const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
    col = std.mix(d.vec3f(lum), col, u.p_saturation).mul(u.c_tint);

    // alpha from the brightest channel, not luminance — a deep blue tail
    // has low luminance but must not go transparent
    const peak = std.max(col.x, std.max(col.y, col.z));
    let alpha = std.clamp(peak * u.p_alphaGain, 0, 1);

    // Analytic silhouette — identical construction to orb-01: exact
    // ray-to-centre distance against the radius, colour AND alpha.
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
    const mrd = std.normalize(d.vec3f(orbUv.x, orbUv.y, -u.p_focal));
    const closest = std.length(std.cross(d.vec3f(0, 0, u.p_camDist), mrd));
    const band = std.mix(0.35, 0.012, std.clamp(u.p_edge, 0, 1));
    const mask =
      1 -
      std.smoothstep(
        u.p_envRadius * (1 - band),
        u.p_envRadius * 1.005,
        closest
      );
    col = col.mul(mask);
    alpha *= mask;

    // safety taper at the frame boundary — colour as well as alpha
    const fade = 1 - std.smoothstep(u.p_edgeFade, 1, std.length(orbUv));
    col = col.mul(fade);
    alpha *= fade;

    // Emitted light, so rgb is already premultiplied — do NOT scale by alpha
    // again (see the same note in orb-31).
    return d.vec4f(col, alpha);
  })
  .$name("orb07Fragment");

export const orb07Shader = tgpu.resolve([orb07Fragment]);

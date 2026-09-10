import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

const STEPS = 80;
const TURB = 8;

const Params = d.struct({
  anim: d.f32,
  c_tint: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_alphaGain: d.f32,
  p_camDist: d.f32,
  p_contrast: d.f32,
  p_edge: d.f32,
  p_edgeFade: d.f32,
  p_envCore: d.f32,
  p_envRadius: d.f32,
  p_exposure: d.f32,
  p_feedback: d.f32,
  p_fill: d.f32,
  p_focal: d.f32,
  p_hue: d.f32,
  p_plane: d.f32,
  p_pulse: d.f32,
  p_saturation: d.f32,
  p_scatter: d.f32,
  p_shellR: d.f32,
  p_shellW: d.f32,
  p_speed: d.f32,
  p_spread: d.f32,
  p_stepClamp: d.f32,
  p_surge: d.f32,
  p_turb: d.f32,
  p_wander: d.f32,
  p_width: d.f32,
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

const eclipticRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32],
  d.vec3f
)((fragCoord, eclipticTurb, eclipticPlane, eclipticWidth) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const ro = d.vec3f(0, 0, u.p_camDist);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, -u.p_focal));

  // integrated clock: the warp
  const animTime = u.p_speed;
  // integrated clock: the belt's tilt
  const wander = u.p_wander;

  let acc = d.vec3f();

  // transmittance carried front-to-back — the near belt veils the far one
  let T = d.f32(1);

  // march only the span the envelope can light, as in orb-01
  let z = std.max(u.p_camDist - u.p_envRadius * 1.3, 0);
  const zEnd = u.p_camDist + u.p_envRadius * 1.3;

  /*
   * The listing's feedback variable, explicit. On the first iteration the
   * axis below reads this before anything has written it — zero is what the
   * golfed version gets, so zero is what it gets here.
   */
  let dist = d.f32(0);

  for (const _it of std.range(STEPS)) {
    const p = ro.add(rd.mul(z));

    /*
     * The axis, steered by the PREVIOUS step's density: the belt's tilt
     * settles as the ray closes on the surface and swings away from it out
     * in the open. The three phases are far enough apart that the cosines
     * can never null together, so the normalize is safe without a guard.
     */
    const axis = std.normalize(
      std.cos(
        d
          .vec3f(4, 2, 0)
          .sub(dist * u.p_feedback)
          .add(wander)
      )
    );

    // the exact minus-90-degree rotation about that axis
    let a = axis.mul(std.dot(axis, p)).sub(std.cross(axis, p));

    // eight octaves of plain feedback warp — no lattice quantizer here,
    // unlike its cousins orb-22 and orb-04
    for (const j of std.range(TURB)) {
      const f = d.f32(j) + 2;
      a = a.add(std.sin(a.mul(f).add(animTime)).yzx.mul(eclipticTurb).div(f));
    }

    /*
     * Sphere plus plane. The shell reads the RAW point so the ball stays a
     * ball; the plane reads the WARPED one so the belt writhes across it.
     * p_plane at zero drops the belt and lights the whole shell, which is
     * worth being able to see once.
     */
    dist =
      u.p_shellW * std.abs(std.length(p) - u.p_shellR) +
      eclipticPlane * std.abs(a.y);
    dist = std.max(dist, eclipticWidth);

    /*
     * Hue from the DENSITY — the belt contoured in rainbow along its own
     * distance field — and the listing's z in the numerator, which burns
     * the far limb hotter than the near one.
     */
    let w = std
      .cos(
        d
          .vec3f(0, 2, 4)
          .mul(u.p_spread)
          .add(dist * u.p_hue)
      )
      .add(1);
    w = w.mul(z / dist);
    w = std.min(w, d.vec3f(u.p_stepClamp));

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    const env = std.smoothstep(
      u.p_envRadius * 1.12,
      u.p_envRadius * u.p_envCore,
      std.length(p)
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

const orb03Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);

    /*
     * The SURGE: tightness and warp swept together on one phase, so the belt
     * gathers into a hard warped girdle and then opens back into a smooth
     * shell. Two params, one gesture — swept apart they read as two unrelated
     * things happening at once.
     *
     * Absolute bounds rather than a swing around what was dialled, so the range
     * is exactly the range: tightness 0.1 to 0.3, warp 0.5 to 1.6. That is why
     * the mix sits OUTSIDE the volume terms below — folding the surge under
     * them would shave the top of both ranges by whatever the agent happened to
     * be doing. At surge zero those terms are all that is left, so a state that
     * does not ask for this is untouched.
     */
    const surge = 0.5 - 0.5 * std.cos(u.anim * 4);

    const eclipticTurb = std.mix(
      u.p_turb * (1 + 0.4 * u.inputVol),
      std.mix(0.5, 1.6, surge),
      u.p_surge
    );
    // the belt broadens toward a full shell while the agent speaks
    const eclipticPlane = std.mix(
      u.p_plane * (1 - 0.35 * u.outputVol),
      std.mix(0.1, 0.3, surge),
      u.p_surge
    );
    const eclipticExposure = u.p_exposure * (1 - 0.3 * u.outputVol);

    /*
     * The belt BREATHES. At pulse zero the width is exactly what was dialled,
     * so a state that does not ask for this is untouched; at one it sweeps the
     * whole way from nothing to that width and back, once every few seconds.
     *
     * It cannot truly reach zero. Belt width is the march's step floor — see
     * the port note above — and a zero step stalls the ray on one point, which
     * with no scatter to close the transmittance accumulates the clamp eighty
     * times into a white flare. The floor is the param's own minimum, four
     * times finer than what the resting belt uses, so it reads as gone.
     *
     * Off anim rather than a raw clock, so the breath quickens with the agent
     * like every other motion in the engine.
     */
    const eclipticWidth = std.max(
      u.p_width * (1 - u.p_pulse * (0.5 + 0.5 * std.cos(u.anim * 3))),
      5e-4
    );

    const acc = eclipticRender(
      fragCoord,
      eclipticTurb,
      eclipticPlane,
      eclipticWidth
    );

    // tanh tone map per channel — the envelope and transmittance change the
    // accumulator's scale, so the golfed /1e4 knee is a tunable here
    let col = tanh3(acc.div(std.max(eclipticExposure, 1)));
    col = std.pow(std.clamp(col, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

    // saturation about luminance, then the tint
    const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
    col = std.mix(d.vec3f(lum), col, u.p_saturation).mul(u.c_tint);

    // alpha from the brightest channel, not luminance — a deep blue contour
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
  .$name("orb03Fragment");

export const orb03Shader = tgpu.resolve([orb03Fragment]);

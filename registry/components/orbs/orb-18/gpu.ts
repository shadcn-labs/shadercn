import { d, std, tgpu } from "typegpu";

const STEPS = 50;

const Params = d.struct({
  anim: d.f32,
  c_tint: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_alphaGain: d.f32,
  p_camDist: d.f32,
  p_contrast: d.f32,
  p_crease: d.f32,
  p_edge: d.f32,
  p_edgeFade: d.f32,
  p_envCore: d.f32,
  p_envRadius: d.f32,
  p_exposure: d.f32,
  p_fill: d.f32,
  p_focal: d.f32,
  p_fold: d.f32,
  p_freq: d.f32,
  p_hue: d.f32,
  p_saturation: d.f32,
  p_scatter: d.f32,
  p_spread: d.f32,
  p_stepClamp: d.f32,
  p_stepScale: d.f32,
  p_wander: d.f32,
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

const octantRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.vec3f
)((fragCoord, octantFold, octantFreq) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const ro = d.vec3f(0, 0, u.p_camDist);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, -u.p_focal));

  const wander = u.p_wander;

  /*
   * The wandering axis. Unit by construction — the three phases are far
   * enough apart that the cosines can never null together.
   */
  const axis = std.normalize(std.cos(d.vec3f(0, 2, 4).add(wander)));

  let acc = d.vec3f();
  let T = d.f32(1);

  let z = std.max(u.p_camDist - u.p_envRadius * 1.3, 0);
  const zEnd = u.p_camDist + u.p_envRadius * 1.3;

  for (const _it of std.range(STEPS)) {
    const p = ro.add(rd.mul(z));

    // the exact minus-90-degree rotation about the wandering axis
    let a = axis.mul(std.dot(axis, p)).sub(std.cross(axis, p));

    /*
     * Two blendable folds. p_fold reflects the octants together and p_crease
     * creases the diagonals; at zero the crystal dissolves into an ordinary
     * periodic field.
     */
    a = std.mix(a, std.abs(a), octantFold);
    a = std.mix(a, std.max(a, a.yzx), u.p_crease);

    let dist = u.p_stepScale * std.length(std.cos(a.mul(octantFreq)));
    dist = std.max(dist, u.p_envRadius * 0.004);

    /*
     * Depth as hue, near as bright. Hue is keyed to depth measured from
     * where the envelope BEGINS, not from the camera, so moving the camera
     * no longer repaints the crystal. No step-length weighting — 1/dist IS
     * this shader's density.
     */
    const zRel = z - (u.p_camDist - u.p_envRadius);
    let w = std
      .cos(
        d
          .vec3f(0, 2, 3)
          .mul(u.p_spread)
          .add(u.p_hue * zRel)
      )
      .add(1);
    w = w.div(dist * std.max(z, 0.05));
    w = std.min(w, d.vec3f(u.p_stepClamp));

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

const orb18Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    const octantFold = std.clamp(u.p_fold * (1 + 0.3 * u.inputVol), 0, 1);
    const octantFreq = u.p_freq * (1 + 0.25 * u.inputVol);
    const octantExposure = u.p_exposure * (1 - 0.35 * u.outputVol);

    const acc = octantRender(fragCoord, octantFold, octantFreq);

    let col = tanh3(acc.div(std.max(octantExposure, 0.01)));
    col = std.pow(std.clamp(col, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

    const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
    col = std.mix(d.vec3f(lum), col, u.p_saturation).mul(u.c_tint);

    const peak = std.max(col.x, std.max(col.y, col.z));
    let alpha = std.clamp(peak * u.p_alphaGain, 0, 1);

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

    const fade = 1 - std.smoothstep(u.p_edgeFade, 1, std.length(orbUv));
    col = col.mul(fade);
    alpha *= fade;

    // Emitted light, so rgb is already premultiplied — do NOT scale by alpha again.
    return d.vec4f(col, alpha);
  })
  .$name("orb18Fragment");

export const orb18Shader = tgpu.resolve([orb18Fragment]);

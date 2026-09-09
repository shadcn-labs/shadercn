import { d, std, tgpu } from "typegpu";

const STEPS = 10;
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
  p_disperse: d.f32,
  p_edge: d.f32,
  p_edgeFade: d.f32,
  p_envCore: d.f32,
  p_envRadius: d.f32,
  p_exposure: d.f32,
  p_fieldScale: d.f32,
  p_fill: d.f32,
  p_focal: d.f32,
  p_saturation: d.f32,
  p_scatter: d.f32,
  p_speed: d.f32,
  p_stepClamp: d.f32,
  p_stepScale: d.f32,
  p_turb: d.f32,
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

const muonsRender = tgpu.fn(
  [d.vec2f, d.f32],
  d.vec3f
)((fragCoord, muonsTurb) => {
  "use gpu";
  const u = layout.$.params;
  const animTime = u.p_speed;
  const wander = u.p_wander;

  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const ro = d.vec3f(0, 0, u.p_camDist);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, -u.p_focal));

  /*
   * Anchor the micro-slab to the ball: intersect the ray with the shell
   * analytically and start the ten steps AT the entry point. Rays that miss
   * fall back to their closest approach — the envelope and silhouette cut them.
   */
  const proj = std.dot(ro.mul(-1), rd);
  const b2 = std.dot(ro, ro) - proj * proj;
  const R = u.p_envRadius * 0.96;
  const entry = proj - std.sqrt(std.max(R * R - b2, 0));

  let acc = d.vec3f();
  let T = d.f32(1);
  let z = entry;
  let s = d.f32(0);

  for (const _it of std.range(STEPS)) {
    const p = ro.add(rd.mul(z));

    const q = p.mul(u.p_fieldScale);

    // the per-layer axis, with the original's s feedback
    const axis = std.normalize(std.cos(d.vec3f(7, 1, 0).add(wander).sub(s)));

    // the minus-90-degree Rodrigues twin of orb-22
    let a = axis.mul(std.dot(axis, q)).sub(std.cross(axis, q));

    for (const j of std.range(TURB)) {
      const dj = d.f32(j) + 2;
      const wave = std.sin(a.mul(dj).add(animTime));
      a = a.add(wave.yzx.mul(muonsTurb).div(dj));
    }

    // the shells: the march sticks where the field magnitude sits on a
    // multiple of pi, and 1/dist blows up — that is the web
    s = std.length(a);
    let dist = u.p_stepScale * std.abs(std.sin(s));
    dist = std.max(dist, 1e-5);
    z += dist;

    /*
     * Layer-cycled palette, with depth measured from the ENTRY point so
     * the banding follows the ball's skin. Clamp then normalize to family units.
     */
    let w = std
      .cos(
        d
          .vec3f(0, 2, 3)
          .mul(u.p_disperse)
          .add((z - entry) / std.max(u.p_stepScale, 1e-3) + animTime)
      )
      .add(1)
      .div(dist)
      .div(std.max(s, 0.5));
    w = std.min(w, d.vec3f(u.p_stepClamp));
    w = w.mul(20 / std.max(u.p_stepClamp, 1));

    const env = std.smoothstep(
      u.p_envRadius * 1.12,
      u.p_envRadius * u.p_envCore,
      std.length(p)
    );
    w = w.add(u.p_fill).mul(env);

    acc = acc.add(w.mul(T));
    T *= std.exp(-std.dot(w, d.vec3f(0.299, 0.587, 0.114)) * u.p_scatter);

    if (T < 0.004) {
      break;
    }
  }

  return acc;
});

const orb15Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    const muonsTurb = u.p_turb * (1 + 0.5 * u.inputVol);
    const muonsExposure = u.p_exposure * (1 - 0.35 * u.outputVol);

    const acc = muonsRender(fragCoord, muonsTurb);

    let col = tanh3(acc.div(std.max(muonsExposure, 1)));
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
  .$name("orb15Fragment");

export const orb15Shader = tgpu.resolve([orb15Fragment]);

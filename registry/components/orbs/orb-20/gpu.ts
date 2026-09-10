import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

const STEPS = 50;
const TURB = 5;

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
  p_fill: d.f32,
  p_flow: d.f32,
  p_foam: d.f32,
  p_focal: d.f32,
  p_hueScale: d.f32,
  p_saturation: d.f32,
  p_scatter: d.f32,
  p_speed: d.f32,
  p_stepClamp: d.f32,
  p_stepScale: d.f32,
  p_stretch: d.f32,
  p_tilt: d.f32,
  p_wall: d.f32,
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

const fallsRender = tgpu.fn(
  [d.vec2f, d.f32],
  d.vec3f
)((fragCoord, fallsFoam) => {
  "use gpu";
  const u = layout.$.params;
  const animTime = u.p_speed;
  const flow = u.p_flow;

  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const ro = d.vec3f(0, 0, u.p_camDist);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, -u.p_focal));

  const rShell = u.p_envRadius * 0.92;

  let acc = d.vec3f();

  // transmittance carried front-to-back — near foam veils far foam
  let T = d.f32(1);

  // march only the span the envelope can light, as in orb-01
  let z = std.max(u.p_camDist - u.p_envRadius * 1.3, 0);
  const zEnd = u.p_camDist + u.p_envRadius * 1.3;

  for (const it of std.range(STEPS)) {
    let c = ro.add(rd.mul(z));

    // a slight static tilt of the flow axis
    const cTilt = std.mul(rot2(u.p_tilt), d.vec2f(c.y, c.z));
    c = d.vec3f(c.x, cTilt.x, cTilt.y);

    /*
     * The fall grain: squash the vertical axis, then the five octaves with
     * the rush phase on the first component — cos(p.yzx*f + ...) writes
     * that component to x, so height and time drive the sideways waves.
     */
    let p = d.vec3f(c.x, c.y * u.p_stretch, c.z);
    for (const j of std.range(TURB)) {
      const fj = d.f32(j) + 1.3;
      p = p.add(
        std
          .cos(
            d
              .vec3f(p.y, p.z, p.x)
              .mul(fj)
              .add(d.f32(it))
              .add(z)
              .add(d.vec3f(flow, 0, 0))
          )
          .div(fj)
      );
    }

    // the foam blend — most of the displacement is thrown away, leaving a
    // film of detail over a coherent surface
    const pm = std.mix(c, p, fallsFoam);

    /*
     * The surface, swapped from the sigmoid cliff to the ball's own shell:
     * distance to the sphere (sharpened by p_wall) plus the original's
     * traveling ripple. f can still reach zero exactly — the guard feeds
     * both the division and the march step.
     */
    let dist =
      u.p_stepScale *
      (std.abs(std.length(pm) - rShell) * u.p_wall +
        std.sin(pm.x - pm.z + animTime * 2) +
        1);
    dist = std.max(dist, 1e-3);
    z += dist;

    /*
     * Vertical hue sheets from the listing, bright where the march grazes
     * the film. The CLAMP is load-bearing — one f-null step would own the
     * whole 50-step sum.
     */
    let w = std
      .cos(d.vec3f(pm.x * u.p_hueScale + dist).add(d.vec3f(6, 1, 2)))
      .add(2)
      .div(dist)
      .div(std.max(z, 1));
    w = std.min(w, d.vec3f(u.p_stepClamp));

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    const env = std.smoothstep(
      u.p_envRadius * 1.12,
      u.p_envRadius * u.p_envCore,
      std.length(ro.add(rd.mul(z)))
    );
    w = w.add(u.p_fill).mul(env);

    acc = acc.add(w.mul(T));
    T *= std.exp(-std.dot(w, d.vec3f(0.299, 0.587, 0.114)) * u.p_scatter);

    if (T < 0.004 || z > zEnd) {
      break;
    }
  }

  return acc;
});

const orb20Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    const fallsFoam = u.p_foam * (1 + 0.5 * u.inputVol);
    const fallsExposure = u.p_exposure * (1 - 0.35 * u.outputVol);

    const acc = fallsRender(fragCoord, fallsFoam);

    // tanh tone map per channel — the golfed /3e1 knee is a tunable here
    let col = tanh3(acc.div(std.max(fallsExposure, 1)));
    col = std.pow(std.clamp(col, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

    const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
    col = std.mix(d.vec3f(lum), col, u.p_saturation);
    col = col.mul(u.c_tint);

    // alpha from the brightest channel, not luminance — a deep blue sheet
    // has low luminance but must not go transparent
    const peak = std.max(col.x, std.max(col.y, col.z));
    let a = std.clamp(peak * u.p_alphaGain, 0, 1);

    // Analytic silhouette — identical construction to orb-01
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
    a *= mask;

    const r2d = std.length(orbUv);
    const fade = 1 - std.smoothstep(u.p_edgeFade, 1, r2d);
    col = col.mul(fade);
    a *= fade;

    // Emitted light, so rgb is already premultiplied — do NOT scale by alpha
    // again (see the same note in orb-31).
    return d.vec4f(col, a);
  })
  .$name("orb20Fragment");

export const orb20Shader = tgpu.resolve([orb20Fragment]);

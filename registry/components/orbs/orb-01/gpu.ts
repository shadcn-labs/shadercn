import { d, std, tgpu } from "typegpu";

/*
 * Ported from orbkit SHDR-01 (GLSL) to TypeGPU, matching the existing
 * WebGPU/WGSL orb-01 look: a cut-glass shell with a dispersive interior.
 * Original: https://github.com/zzzzshawn/orbkit
 */

const STEPS = 60;
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
  p_disperse: d.f32,
  p_edge: d.f32,
  p_edgeFade: d.f32,
  p_envCore: d.f32,
  p_envRadius: d.f32,
  p_exposure: d.f32,
  p_fill: d.f32,
  p_focal: d.f32,
  p_saturation: d.f32,
  p_scatter: d.f32,
  p_sheets: d.f32,
  p_speed: d.f32,
  p_spin: d.f32,
  p_stepClamp: d.f32,
  p_stria: d.f32,
  p_tilt: d.f32,
  p_turb: d.f32,
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

const dispersionRender = tgpu.fn(
  [d.vec2f, d.f32],
  d.vec3f
)((fragCoord, turb) => {
  "use gpu";
  const u = layout.$.params;
  const animTime = u.p_speed;
  const spinAng = u.p_spin;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const ro = d.vec3f(0, 0, u.p_camDist);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, -u.p_focal));

  let acc = d.vec3f();
  let T = d.f32(1);
  let z = std.max(u.p_camDist - u.p_envRadius * 1.3, 0);
  const zEnd = u.p_camDist + u.p_envRadius * 1.3;

  for (const it of std.range(STEPS)) {
    const p = ro.add(rd.mul(z));

    let q = d.vec3f(p);
    const spun = std.mul(rot2(spinAng), d.vec2f(q.x, q.z));
    q = d.vec3f(spun.x, q.y, spun.y);
    const tilted = std.mul(rot2(u.p_tilt), d.vec2f(q.y, q.z));
    q = d.vec3f(q.x, tilted.x, tilted.y);

    let a = d.vec3f(q);
    for (const j of std.range(TURB)) {
      const dj = d.f32(j) + 3;
      const wave = std.sin(a.mul(dj).add(animTime).add(d.f32(it)));
      a = a.sub(d.vec3f(wave.y, wave.z, wave.x).mul(turb).div(dj));
    }

    const wall = std.abs(std.length(a) - u.p_envRadius);
    const s = a.z + a.y - animTime;
    const dist = std.max(wall + std.abs(std.cos(s)) / u.p_sheets, 1e-4);

    let w = std
      .cos(
        d
          .vec3f(s, s, s)
          .sub(z * u.p_stria)
          .add(d.vec3f(0, 1, 8).mul(u.p_disperse))
      )
      .add(1)
      .div(dist);
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

const orb01Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const turb = u.p_turb * (1 + 0.5 * u.inputVol);
    const exposure = u.p_exposure * (1 - 0.35 * u.outputVol);

    let col = tanh3(
      dispersionRender(fragCoord, turb).div(std.max(exposure, 1))
    );
    col = std.pow(std.clamp(col, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

    const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
    col = std.mix(d.vec3f(lum), col, u.p_saturation).mul(u.c_tint);

    const peak = std.max(col.x, std.max(col.y, col.z));
    let alpha = std.clamp(peak * u.p_alphaGain, 0, 1);

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

    const fade = 1 - std.smoothstep(u.p_edgeFade, 1, std.length(orbUv));
    col = col.mul(fade);
    alpha *= fade;

    return d.vec4f(col, alpha);
  })
  .$name("orb01Fragment");

export const orb01Shader = tgpu.resolve([orb01Fragment]);

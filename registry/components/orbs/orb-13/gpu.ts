import { d, std, tgpu } from "typegpu";

const STEPS = 64;

const Params = d.struct({
  anim: d.f32,
  c_arc: d.vec3f,
  c_inner: d.vec3f,
  c_tint: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_alphaGain: d.f32,
  p_camDist: d.f32,
  p_contrast: d.f32,
  p_coreGain: d.f32,
  p_edge: d.f32,
  p_envRadius: d.f32,
  p_exposure: d.f32,
  p_fill: d.f32,
  p_fils: d.f32,
  p_focal: d.f32,
  p_saturation: d.f32,
  p_scatter: d.f32,
  p_sharp: d.f32,
  p_soft: d.f32,
  p_speed: d.f32,
  p_spin: d.f32,
  p_stepClamp: d.f32,
  p_swell: d.f32,
  p_tilt: d.f32,
  p_tipGain: d.f32,
  p_whiten: d.f32,
  p_writhe: d.f32,
  p_writheFreq: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: Params },
  })
  .$idx(0);

const hash = tgpu.fn(
  [d.vec2f],
  d.f32
)((p) =>
  std.fract(std.sin(std.dot(p, d.vec2f(127.1, 311.7))) * 43_758.545_312_3)
);

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

const ionRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32, d.f32],
  d.vec3f
)((fragCoord, ionSharp, ionWrithe, ionCore, ionRadius) => {
  "use gpu";
  const u = layout.$.params;
  const t = u.p_speed;
  const spinAng = u.p_spin;

  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const ro = d.vec3f(0, 0, u.p_camDist);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, -u.p_focal));

  // exact ray/sphere chord — the march never leaves the globe
  const proj = std.dot(ro.mul(-1), rd);
  const b2 = std.dot(ro, ro) - proj * proj;
  const halfChord = std.sqrt(std.max(ionRadius * ionRadius - b2, 0));
  let zNear = proj - halfChord;
  const stepLen = (2 * halfChord) / d.f32(STEPS);
  // per-pixel jitter of the march start melts dotted filaments into plasma grain
  zNear += (hash(fragCoord) - 0.5) * stepLen;

  let acc = d.vec3f();
  let T = d.f32(1);

  for (const i of std.range(STEPS)) {
    const p = ro.add(rd.mul(zNear + (d.f32(i) + 0.5) * stepLen));

    // precess the whole filament array; a static tilt keeps the spin axis
    // off-vertical so the motion reads in 3D
    let pr = d.vec3f(p);
    const prSpun = std.mul(rot2(spinAng), d.vec2f(pr.x, pr.z));
    pr = d.vec3f(prSpun.x, pr.y, prSpun.y);
    const prTilt = std.mul(rot2(u.p_tilt), d.vec2f(pr.y, pr.z));
    pr = d.vec3f(pr.x, prTilt.x, prTilt.y);

    const rad = std.length(pr);
    const dir = pr.div(std.max(rad, 1e-4));
    const rr = rad / std.max(ionRadius, 1e-3);

    // writhe: bend the sampling direction with radius and time, rooted at
    // the nucleus by the smoothstep so filaments stay attached
    const wr = ionWrithe * std.smoothstep(0, ionRadius * 0.35, rad);
    let q = dir.mul(u.p_fils);
    q = q.add(
      d
        .vec3f(
          std.sin(rad * u.p_writheFreq - t * 1.2 + q.y * 1.8),
          std.sin(rad * u.p_writheFreq * 0.83 + t * 1 + q.z * 1.8),
          std.sin(rad * u.p_writheFreq * 1.19 - t * 0.7 + q.x * 1.8)
        )
        .mul(wr)
    );

    // two independent fields; their joint zero set is the filament curves
    const f1 =
      std.sin(q.x + t * 0.7) +
      std.sin(q.y * 1.31 - t * 0.5) +
      std.sin(q.z * 1.13 + t * 0.9);
    const f2 =
      std.sin(q.y * 1.21 + t * 0.6 + 1.7) +
      std.sin(q.z * 1.43 - t * 0.8 + 3.1) +
      std.sin(q.x * 0.87 + t * 0.4 + 5);
    const d2 = f1 * f1 + f2 * f2;
    let g = 1 / (d2 * ionSharp + u.p_soft);

    // flare where a streamer lands on the glass, and the hot nucleus
    g *= 1 + u.p_tipGain * std.smoothstep(0.55, 0.95, rr);
    const core = ionCore / (rad * rad * 8 + 0.05);

    // pink near the nucleus, violet-blue at the glass
    const fCol = std.mix(u.c_inner, u.c_arc, std.smoothstep(0.1, 0.75, rr));
    let w = fCol
      .add(d.vec3f(u.p_whiten).mul(g))
      .mul(g)
      .add(u.c_inner.mul(core))
      .add(d.vec3f(u.p_fill));
    w = std.min(w, d.vec3f(u.p_stepClamp));
    w = w.mul(stepLen);

    acc = acc.add(w.mul(T));
    T *= std.exp(-std.dot(w, d.vec3f(0.299, 0.587, 0.114)) * u.p_scatter);
    if (T < 0.004) {
      break;
    }
  }

  return acc;
});

const orb13Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // Louder agent output softens and thickens the arcs; user input flares
    // the nucleus — the globe answers being spoken to.
    const ionSharp = u.p_sharp * (1 - 0.25 * u.outputVol);
    const ionWrithe = u.p_writhe * (1 + 0.6 * u.outputVol);
    const ionCore = u.p_coreGain * (1 + 1.6 * u.inputVol + 0.4 * u.outputVol);
    const ionExposure = u.p_exposure * (1 - 0.35 * u.outputVol);
    const ionRadius = u.p_envRadius + u.p_swell * u.inputVol;

    const acc = ionRender(fragCoord, ionSharp, ionWrithe, ionCore, ionRadius);

    let col = tanh3(acc.div(std.max(ionExposure, 0.01)));
    col = std.pow(std.clamp(col, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

    const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
    col = std.mix(d.vec3f(lum), col, u.p_saturation).mul(u.c_tint);

    const peak = std.max(col.x, std.max(col.y, col.z));
    let alpha = std.clamp(peak * u.p_alphaGain, 0, 1);

    const mrd = std.normalize(d.vec3f(orbUv.x, orbUv.y, -u.p_focal));
    const closest = std.length(std.cross(d.vec3f(0, 0, u.p_camDist), mrd));
    const band = std.mix(0.35, 0.012, std.clamp(u.p_edge, 0, 1));
    const mask =
      1 - std.smoothstep(ionRadius * (1 - band), ionRadius * 1.005, closest);
    col = col.mul(mask);
    alpha *= mask;

    // Emitted light, so rgb is already premultiplied — do NOT scale by alpha again.
    return d.vec4f(col, alpha);
  })
  .$name("orb13Fragment");

export const orb13Shader = tgpu.resolve([orb13Fragment]);

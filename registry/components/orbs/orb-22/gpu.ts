import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

const STEPS = 70;
const TURB = 7;

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
  p_focal: d.f32,
  p_glow: d.f32,
  p_glowFew: d.f32,
  p_hueDepth: d.f32,
  p_hueStep: d.f32,
  p_hug: d.f32,
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

const hash = tgpu.fn(
  [d.vec2f],
  d.f32
)((p) =>
  std.fract(std.sin(std.dot(p, d.vec2f(127.1, 311.7))) * 43_758.545_312_3)
);

const vectorsRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.vec3f
)((fragCoord, vectorsTurb, vectorsGlow) => {
  "use gpu";
  const u = layout.$.params;
  const animTime = u.p_speed;
  const wander = u.p_wander;

  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const ro = d.vec3f(0, 0, u.p_camDist);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, -u.p_focal));

  // the wandering rotation axis — unit by construction, which is what
  // makes the 90-degree Rodrigues below exact
  const axis = std.normalize(std.sin(d.vec3f(0, 2, 4).add(wander)));

  let acc = d.vec3f();

  // transmittance carried front-to-back — near streaks veil far ones
  let T = d.f32(1);

  let z = std.max(u.p_camDist - u.p_envRadius * 1.3, 0);
  const zEnd = u.p_camDist + u.p_envRadius * 1.3;

  for (const it of std.range(STEPS)) {
    const p = ro.add(rd.mul(z));

    /*
     * THE ORB IS THE OBJECT — pull the sample toward the sphere's shell
     * before the field ever sees it. At hug 0 this is the raw 3D tangle;
     * at 1 the field is purely angular, painted on the ball's skin. The
     * guard keeps normalize() defined through the centre.
     */
    const rl = std.max(std.length(p), 1e-3);
    const q = std.mix(p, p.div(rl).mul(u.p_envRadius), u.p_hug);

    // the exact 90-degree rotation about the wandering axis; v stays
    // clean, a takes the turbulence — the fork is the original's v=a=...
    const v = axis.mul(std.dot(axis, q)).add(std.cross(axis, q));
    let a = d.vec3f(v);

    // cell-quantized turbulence: every ceil() lattice cell flickers on
    // its own phase
    for (const j of std.range(TURB)) {
      const dj = d.f32(j) + 3;
      const wave = std.sin(std.ceil(a.mul(dj)).sub(animTime));
      a = a.add(d.vec3f(wave.y, wave.z, wave.x).mul(vectorsTurb).div(dj));
    }

    // the density product — turbulent detail times clean streak surfaces
    let dens =
      u.p_stepScale *
      std.length(std.sin(a.mul(a))) *
      std.sqrt(std.length(v.mul(std.sin(d.vec3f(v.y, v.z, v.x)))));
    dens = std.max(dens, 1e-4);

    /*
     * The march's own colour code: red constant, green by step index, blue
     * by depth into the ball. Green gets twice the clamp headroom: its ramp
     * runs to STEPS (70) where red is fixed at 9.
     */
    let w = d
      .vec3f(
        9,
        d.f32(it) * u.p_hueStep,
        (z - u.p_camDist + u.p_envRadius) * u.p_hueDepth
      )
      .div(dens);
    w = std.min(w, d.vec3f(u.p_stepClamp).mul(d.vec3f(1, 2, 1)));

    /*
     * Normalize the clamped weight back to family units (a ceiling of ~20).
     * This orb's raw weights run in the hundreds — without this the clamp
     * value leaks into total energy.
     */
    w = w.mul(20 / std.max(u.p_stepClamp, 1));

    /*
     * A few vectors GLOW. Cells of the clean rotated frame are hashed, and
     * each cell's hash cycles against the clock so only a small fraction
     * (p_glowFew of the cycle) are hot at any moment. Where a hot cell
     * meets a streak null, the same 1/d spike is re-read on a far higher
     * ceiling than the step clamp.
     */
    const few = std.max(u.p_glowFew, 1e-3);
    const vc = std.ceil(v.mul(2));
    const hcell = hash(vc.xy.add(d.vec2f(7.31, 3.17).mul(vc.z)));
    const cyc = std.fract(hcell + animTime * 0.05);
    const sel =
      std.smoothstep(1 - few, 1 - 0.5 * few, cyc) *
      std.smoothstep(1, 1 - 0.5 * few, cyc);
    // QUADRATIC in 1/d — the glow hugs the filament core
    w = w.add(
      d
        .vec3f(1, 0.96, 0.88)
        .mul(std.min(0.08 / (dens * dens), 500) * sel * vectorsGlow)
    );

    const env = std.smoothstep(
      u.p_envRadius * 1.12,
      u.p_envRadius * u.p_envCore,
      std.length(p)
    );
    w = w.add(u.p_fill).mul(env);

    acc = acc.add(w.mul(T));
    T *= std.exp(-std.dot(w, d.vec3f(0.299, 0.587, 0.114)) * u.p_scatter);

    z += dens;
    if (T < 0.004 || z > zEnd) {
      break;
    }
  }

  return acc;
});

const orb22Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    const vectorsTurb = u.p_turb * (1 + 0.5 * u.inputVol);
    const vectorsExposure = u.p_exposure * (1 - 0.35 * u.outputVol);
    // the glows flare when the agent speaks
    const vectorsGlow = u.p_glow * (1 + 0.8 * u.outputVol);

    const acc = vectorsRender(fragCoord, vectorsTurb, vectorsGlow);

    let col = tanh3(acc.div(std.max(vectorsExposure, 1)));
    col = std.pow(std.clamp(col, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

    const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
    col = std.mix(d.vec3f(lum), col, u.p_saturation);
    col = col.mul(u.c_tint);

    const peak = std.max(col.x, std.max(col.y, col.z));
    let a = std.clamp(peak * u.p_alphaGain, 0, 1);

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

    return d.vec4f(col, a);
  })
  .$name("orb22Fragment");

export const orb22Shader = tgpu.resolve([orb22Fragment]);

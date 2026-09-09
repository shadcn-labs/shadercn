import { d, std, tgpu } from "typegpu";

/*
 * Ported from orbkit SHDR-10 (GLSL) to TypeGPU: a knitted lattice skin
 * unwrapped around a climbing shell.
 * Original: https://github.com/zzzzshawn/orbkit
 */

const STEPS = 40;
const TURB = 6;

const Params = d.struct({
  anim: d.f32,
  c_tint: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_alphaGain: d.f32,
  p_camDist: d.f32,
  p_cell: d.f32,
  p_climb: d.f32,
  p_contrast: d.f32,
  p_edge: d.f32,
  p_edgeFade: d.f32,
  p_envCore: d.f32,
  p_envRadius: d.f32,
  p_exposure: d.f32,
  p_fill: d.f32,
  p_focal: d.f32,
  p_hueStep: d.f32,
  p_layer: d.f32,
  p_saturation: d.f32,
  p_scatter: d.f32,
  p_scroll: d.f32,
  p_shellR: d.f32,
  p_speed: d.f32,
  p_spread: d.f32,
  p_stepClamp: d.f32,
  p_stepScale: d.f32,
  p_turb: d.f32,
  p_wrap: d.f32,
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

const weaveRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.vec3f
)((fragCoord, weaveTurb, weaveCell) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const ro = d.vec3f(0, 0, u.p_camDist);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, -u.p_focal));

  // integrated clock: the warp
  const animTime = u.p_speed;
  // integrated clock: the skin climbs
  const scroll = u.p_scroll;

  let acc = d.vec3f();

  // transmittance carried front-to-back — the near skin veils the far one
  let T = d.f32(1);

  // march only the span the envelope can light, as in orb-01
  let z = std.max(u.p_camDist - u.p_envRadius * 1.3, 0);
  const zEnd = u.p_camDist + u.p_envRadius * 1.3;

  for (const it of std.range(STEPS)) {
    const fi = d.f32(it) + 1;
    const world = ro.add(rd.mul(z));

    /*
     * The unwrap, with the listing's cylinder swapped for the ball: angle
     * about the axis, height, and distance from the CENTRE less the shell
     * radius. p_wrap wants to stay a whole number — see the header.
     */
    const rl = std.length(world);
    let p = d.vec3f(
      std.atan2(world.z, world.x) * u.p_wrap,
      world.y * u.p_climb + scroll,
      rl - u.p_shellR
    );

    // six octaves of feedback warp, each march step on its own phase
    for (const j of std.range(TURB)) {
      const dj = d.f32(j) + 1;
      p = p.add(
        std
          .sin(p.yzx.mul(dj).add(animTime + u.p_layer * fi))
          .mul(weaveTurb)
          .div(dj)
      );
    }

    /*
     * The lattice. Small only where all three cosines sit at one and the
     * sample is on the shell — so the cells of a 3D lattice in unwrapped
     * space are cut by the ball's surface, and what is left is a knitted
     * skin. p_cell is the listing's .3: the amplitude of the cosine terms
     * against the shell term, and therefore how much the lattice matters
     * relative to simply being on the surface.
     */
    let dist =
      u.p_stepScale *
      std.length(d.vec4f(std.cos(p).mul(weaveCell).sub(weaveCell), p.z));
    dist = std.max(dist, u.p_envRadius * 0.004);

    // colour by unwrapped height, with each step offset again
    let w = std
      .cos(
        d
          .vec3f(6, 1, 2)
          .mul(u.p_spread)
          .add(p.y + fi * u.p_hueStep)
      )
      .add(1);
    w = w.div(dist);
    w = std.min(w, d.vec3f(u.p_stepClamp));

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    const env = std.smoothstep(
      u.p_envRadius * 1.12,
      u.p_envRadius * u.p_envCore,
      rl
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

const orb10Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);

    const weaveTurb = u.p_turb * (1 + 0.4 * u.inputVol);
    const weaveCell = u.p_cell * (1 + 0.3 * u.inputVol);
    const weaveExposure = u.p_exposure * (1 - 0.3 * u.outputVol);

    const acc = weaveRender(fragCoord, weaveTurb, weaveCell);

    /*
     * The listing's knee is tanh(o*o/6e3) over an unnormalized sum of forty
     * steps. Dividing by the step count first pulls the square's scale down
     * by forty squared, so the same knee lands near four — a number that fits
     * on a slider. The square is a contrast squarer, not a tone map.
     */
    const v = acc.div(d.f32(STEPS));
    let col = tanh3(v.mul(v).div(std.max(weaveExposure, 0.0001)));
    col = std.pow(std.clamp(col, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

    // saturation about luminance, then the tint
    const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
    col = std.mix(d.vec3f(lum), col, u.p_saturation).mul(u.c_tint);

    // alpha from the brightest channel, not luminance — a deep blue thread
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
  .$name("orb10Fragment");

export const orb10Shader = tgpu.resolve([orb10Fragment]);

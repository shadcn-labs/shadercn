import { d, std, tgpu } from "typegpu";

/*
 * Ported from orbkit SHDR-04 (GLSL) to TypeGPU: a faceted geode shell
 * quantized onto a single lattice pitch.
 * Original: https://github.com/zzzzshawn/orbkit
 */

const STEPS = 50;
const TURB = 6;

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
  p_envScale: d.f32,
  p_exposure: d.f32,
  p_floorLevel: d.f32,
  p_focal: d.f32,
  p_hueGain: d.f32,
  p_pitch: d.f32,
  p_saturation: d.f32,
  p_shellR: d.f32,
  p_slack: d.f32,
  p_speed: d.f32,
  p_turb: d.f32,
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

// GLSL ES 1.0 has no round() — it arrived in ES 3.0. The listing quantizes
// with it, so it ships here. Halves round up rather than to even.
const roundv = tgpu.fn([d.vec3f], d.vec3f)((x) => std.floor(x.add(0.5)));

const geodeRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.vec3f
)((fragCoord, geodeTurb, geodeWidth) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const ro = d.vec3f(0, 0, u.p_camDist);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, -u.p_focal));

  // integrated clock
  const animTime = u.p_speed;
  const shellR = u.p_shellR;
  const pitch = std.max(u.p_pitch, 0.002);

  // the run-away bound for rays that miss the shell entirely
  const zEnd = u.p_camDist + shellR * 2.5;

  let acc = d.vec3f();

  // The listing starts its march at the camera and lets the trace do the
  // travelling — see the header. z is the distance already walked.
  let z = d.f32(0);

  for (const _it of std.range(STEPS)) {
    let p = d.vec3f(ro.add(rd.mul(z)));

    /*
     * Six octaves on ONE lattice. The pitch never changes; only the phase
     * multiplier does, so the displacement is piecewise constant on a
     * single grid and the shell facets at one scale.
     */
    for (const j of std.range(TURB)) {
      const f = d.f32(j) + 2;
      p = p.add(
        std
          .sin(
            roundv(p.zxy.div(pitch))
              .mul(pitch * f)
              .sub(animTime)
          )
          .mul(geodeTurb)
          .div(f)
      );
    }

    /*
     * Sphere trace toward the shell, on the WARPED point — so the facets
     * are what the ray is chasing, not a smooth ball underneath them. The
     * slack is the listing's tenth, and the floor is the surface width.
     */
    const dist = geodeWidth + u.p_slack * std.abs(std.length(p) - shellR);

    z += dist;

    /*
     * Position as colour, washing toward white with depth. Guarded on z:
     * the listing gets away with reading p/z here because its comma
     * operator advances z first, which is worth knowing before anyone
     * reorders these two lines.
     */
    acc = acc.add(
      p.mul(u.p_hueGain).div(std.max(z, 1e-3)).add(u.p_floorLevel).div(dist)
    );

    if (z > zEnd) {
      break;
    }
  }

  return acc;
});

const orb04Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);

    const geodeTurb = u.p_turb * (1 + 0.5 * u.inputVol);
    const geodeWidth = std.max(u.p_width * (1 - 0.4 * u.outputVol), 0.0002);
    const geodeExposure = u.p_exposure * (1 - 0.3 * u.outputVol);

    const acc = geodeRender(fragCoord, geodeTurb, geodeWidth);

    // tanh tone map per channel — the golfed /2e3 knee is a tunable here
    let col = tanh3(acc.div(std.max(geodeExposure, 1)));
    col = std.pow(std.clamp(col, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

    // saturation about luminance, then the tint
    const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
    col = std.mix(d.vec3f(lum), col, u.p_saturation).mul(u.c_tint);

    // alpha from the brightest channel, not luminance — a deep blue facet
    // has low luminance but must not go transparent
    const peak = std.max(col.x, std.max(col.y, col.z));
    let alpha = std.clamp(peak * u.p_alphaGain, 0, 1);

    /*
     * Analytic silhouette against the shell, widened by p_envScale because
     * the turbulence pushes the visible surface OUT past the nominal radius —
     * cut at the bare radius and the facets would be shaved flat all round
     * the limb.
     */
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
    const mrd = std.normalize(d.vec3f(orbUv.x, orbUv.y, -u.p_focal));
    const closest = std.length(std.cross(d.vec3f(0, 0, u.p_camDist), mrd));
    const sil = u.p_shellR * u.p_envScale;
    const band = std.mix(0.35, 0.012, std.clamp(u.p_edge, 0, 1));
    const mask = 1 - std.smoothstep(sil * (1 - band), sil * 1.005, closest);
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
  .$name("orb04Fragment");

export const orb04Shader = tgpu.resolve([orb04Fragment]);

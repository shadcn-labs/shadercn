import { d, std, tgpu } from "typegpu";

/*
 * Ported from orbkit SHDR-21 (GLSL) to TypeGPU: a back-lit nimbus volume.
 * Original: https://github.com/zzzzshawn/orbkit
 */

const STEPS = 56;
const LIGHT_STEPS = 4;
const DENSITY_OCT = 4;

const Params = d.struct({
  anim: d.f32,
  c_light: d.vec3f,
  c_shadow: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_absorb: d.f32,
  p_alphaGain: d.f32,
  p_ambient: d.f32,
  p_aniso: d.f32,
  p_camDist: d.f32,
  p_churn: d.f32,
  p_density: d.f32,
  p_edgeSoft: d.f32,
  p_exposure: d.f32,
  p_focal: d.f32,
  p_lightSpin: d.f32,
  p_power: d.f32,
  p_radius: d.f32,
  p_scale: d.f32,
  p_shadowAbsorb: d.f32,
  p_shadowLift: d.f32,
  p_speed: d.f32,
  p_threshold: d.f32,
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

/*
 * Density inside the sphere.
 *
 * The radial term falls to zero at the boundary, which both bounds the volume
 * and gives the soft edge for free. The cos-warp folds the sample point a few
 * times — the same cheap turbulence the other orbs use — and the threshold
 * carves that into clumps rather than an even fog.
 */
const density = tgpu.fn(
  [d.vec3f, d.f32, d.f32],
  d.f32
)((p, animTime, nimbusDensity) => {
  "use gpu";
  const u = layout.$.params;
  const shell = 1 - std.length(p) / u.p_radius;
  if (shell <= 0) {
    return d.f32();
  }

  let q = p.mul(u.p_scale);
  let f = d.f32(1);
  for (const _k of std.range(DENSITY_OCT)) {
    q = q.add(
      std
        .cos(
          d
            .vec3f(q.y, q.z, q.x)
            .mul(f)
            .add(animTime * u.p_churn)
        )
        .div(f)
    );
    f *= 1.8;
  }

  const n = ((std.sin(q.x) + std.sin(q.y) + std.sin(q.z)) / 3) * 0.5 + 0.5;
  // smoothstep against the threshold is the clump control: high threshold
  // leaves sparse wisps, low fills the sphere with even fog
  const clump = std.smoothstep(u.p_threshold, 1, n);
  return clump * std.pow(shell, u.p_edgeSoft) * nimbusDensity;
});

/*
 * Henyey-Greenstein: g > 0 biases scattering forward, which is what gives the
 * bloom on the limb facing the light.
 *
 * The physical form carries a 1/(4*PI) normalisation. It is dropped here and
 * folded into p_power instead — kept in, the whole term sits around 0.02 and
 * the orb renders black unless power is pushed into the hundreds.
 */
const phaseHG = tgpu.fn(
  [d.f32, d.f32],
  d.f32
)((c, g) => {
  "use gpu";
  const g2 = g * g;
  return (1 - g2) / std.pow(std.max(1 + g2 - 2 * g * c, 0.0001), 1.5);
});

const nimbusRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.vec4f
)((fragCoord, nimbusPower, nimbusDensity) => {
  "use gpu";
  const u = layout.$.params;
  const animTime = u.p_speed;

  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const ro = d.vec3f(0, 0, -u.p_camDist);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, u.p_focal));

  /*
   * Light direction, slowly orbiting so the shading is never static.
   *
   * The z term is kept POSITIVE — the camera looks along +z, so a light also
   * pointing along +z sits behind the cloud. That is the back-lit case, where
   * dot(rd, L) approaches 1 and the forward-scattering phase blooms.
   */
  const L = std.normalize(
    d.vec3f(
      std.cos(animTime * u.p_lightSpin) * 0.7,
      0.45,
      std.sin(animTime * u.p_lightSpin) * 0.35 + 0.65
    )
  );

  const phase = phaseHG(std.dot(rd, L), u.p_aniso);

  // Start the march at the sphere's front face instead of the camera
  const toCentre = u.p_camDist;
  const tStart = std.max(toCentre - u.p_radius, 0);
  const span = 2 * u.p_radius;
  const dt = span / d.f32(STEPS);

  let T = d.f32(1);
  let scattered = d.vec3f();

  for (const i of std.range(STEPS)) {
    const t = tStart + (d.f32(i) + 0.5) * dt;
    const p = ro.add(rd.mul(t));

    const dn = density(p, animTime, nimbusDensity);
    if (dn > 0.001) {
      // short march toward the light for self-shadowing
      let shadow = d.f32(1);
      const lstep = u.p_radius / d.f32(LIGHT_STEPS);
      for (const k of std.range(LIGHT_STEPS)) {
        const fk = d.f32(k) + 1;
        const lp = p.add(L.mul((fk - 0.5) * lstep));
        shadow *= std.exp(
          -density(lp, animTime, nimbusDensity) * lstep * u.p_shadowAbsorb
        );
      }

      /*
       * In-scattered light: warm where lit, cool where the volume shadows
       * itself.
       *
       * The shadow term appears ONCE, inside the mix. Multiplying by it again
       * as a factor scales the shadowed end of the mix toward zero, so the
       * cool colour is always multiplied away. p_shadowLift is how much light
       * still reaches the shadowed side.
       */
      const lit = std.mix(u.c_shadow.mul(u.p_shadowLift), u.c_light, shadow);
      scattered = scattered.add(lit.mul(T * dn * dt * phase * nimbusPower));

      T *= std.exp(-dn * dt * u.p_absorb);
      if (T < 0.01) {
        break;
      }
    }
  }

  // a soft ambient body so the unlit side is not pure black
  const body = 1 - T;
  scattered = scattered.add(u.c_shadow.mul(body * u.p_ambient));

  return d.vec4f(scattered, body);
});

const orb21Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);

    /*
     * Agent output turns the light up; user input thickens the cloud. Both are
     * AMPLITUDES. Churn is deliberately NOT volume-scaled: it multiplies the
     * accumulated clock into a phase (animTime * churn), so scaling it by the
     * live volume would turn every volume wobble into a phase jump.
     */
    const nimbusPower = u.p_power * (0.7 + 0.9 * u.outputVol);
    const nimbusDensity = u.p_density * (1 + 0.35 * u.inputVol);

    const acc = nimbusRender(fragCoord, nimbusPower, nimbusDensity);

    const col = tanh3(acc.xyz.mul(u.p_exposure));
    const a = std.clamp(acc.w * u.p_alphaGain, 0, 1);

    // Emitted/scattered light, so rgb is already premultiplied — do NOT multiply
    // by alpha again (see the same note in orb-31).
    return d.vec4f(col, a);
  })
  .$name("orb21Fragment");

export const orb21Shader = tgpu.resolve([orb21Fragment]);

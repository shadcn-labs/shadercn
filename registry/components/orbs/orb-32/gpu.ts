import { d, std, tgpu } from "typegpu";

const STEPS = 56;
const TURB_OCT = 4;

const Params = d.struct({
  anim: d.f32,
  c_core: d.vec3f,
  c_deep: d.vec3f,
  c_inner: d.vec3f,
  c_outer: d.vec3f,
  c_rim: d.vec3f,
  c_tint: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_absorb: d.f32,
  p_alphaGain: d.f32,
  p_armSharp: d.f32,
  p_arms: d.f32,
  p_beat: d.f32,
  p_breathe: d.f32,
  p_bulge: d.f32,
  p_camDist: d.f32,
  p_churn: d.f32,
  p_contrast: d.f32,
  p_core: d.f32,
  p_density: d.f32,
  p_edge: d.f32,
  p_edgeFade: d.f32,
  p_envRadius: d.f32,
  p_exposure: d.f32,
  p_falloff: d.f32,
  p_fill: d.f32,
  p_focal: d.f32,
  p_hueReach: d.f32,
  p_pulse: d.f32,
  p_ragged: d.f32,
  p_rim: d.f32,
  p_saturation: d.f32,
  p_spin: d.f32,
  p_starDensity: d.f32,
  p_starScale: d.f32,
  p_stars: d.f32,
  p_thick: d.f32,
  p_threshold: d.f32,
  p_tilt: d.f32,
  p_turbScale: d.f32,
  p_twinkle: d.f32,
  p_wind: d.f32,
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
 * The galactic density at a point in the galaxy's own frame: the disc lies
 * in xz, the normal is y. Returns (dens, arm, rho).
 */
const galaxy = tgpu.fn(
  [d.vec3f, d.f32, d.f32, d.f32, d.f32],
  d.vec3f
)((p, t, galDensity, galCore, galFalloff) => {
  "use gpu";
  const u = layout.$.params;
  const rho = std.length(p.xz);
  const h = p.y;
  // atan(0, 0) is undefined; the exact axis is all bulge anyway
  const phi = std.select(0, std.atan2(p.z, p.x), rho > 1e-4);
  const lr = std.log(std.max(rho, 0.02));
  const armPhase = phi * u.p_arms - u.p_wind * lr;

  // feedback curl turbulence, shared phase
  let q = p.mul(u.p_turbScale);
  let f = d.f32(1);
  for (const _k of std.range(TURB_OCT)) {
    q = q.add(std.cos(q.yzx.mul(f).add(t)).div(f));
    f *= 1.9;
  }
  const n = ((std.sin(q.x) + std.sin(q.y) + std.sin(q.z)) / 3) * 0.5 + 0.5;
  const clump = std.smoothstep(u.p_threshold, 1, n);

  let arm = 0.5 + 0.5 * std.cos(armPhase + (n - 0.5) * u.p_ragged);
  arm = std.pow(arm, u.p_armSharp);

  const scaleH = u.p_thick * (0.12 + rho);
  const disc = std.exp(-rho * galFalloff) * std.exp(-std.abs(h) / scaleH);
  const bulge = std.exp(-std.dot(p, p) * u.p_bulge);

  const dens =
    disc * (0.08 + 1.6 * arm) * (0.25 + 0.75 * clump) + bulge * galCore;
  return d.vec3f(dens * galDensity, arm, rho);
});

/*
 * One lattice of hashed stars. Each cell either carries a star or not, at a
 * hashed position, with its own twinkle rate; the 3x3 neighbourhood is
 * gathered so a star near a cell wall is not clipped.
 */
const starField = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32],
  d.f32
)((p, density, size, twinkleT) => {
  "use gpu";
  const id = std.floor(p);
  const f = std.fract(p);
  let acc = d.f32();
  for (const j of std.range(3)) {
    for (const i of std.range(3)) {
      const o = d.vec2f(d.f32(i) - 1, d.f32(j) - 1);
      const cid = id.add(o);
      const h = hash(cid);
      if (h <= density) {
        const sp = o.add(d.vec2f(hash(cid.add(1.3)), hash(cid.add(2.7))));
        const dd = std.length(f.sub(sp));
        const tw =
          0.55 +
          0.45 * std.sin(twinkleT * (1.5 + 5 * hash(cid.add(5.1))) + h * 40);
        const sz = size * (0.5 + 1.2 * hash(cid.add(8.9)) * hash(cid.add(8.9)));
        acc +=
          tw *
          std.exp((-dd * dd) / (sz * sz)) *
          (0.4 + (0.6 * h) / std.max(density, 0.001));
      }
    }
  }
  return acc;
});

const galaxyRender = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32],
  d.vec4f
)((fragCoord, galDensity, galCore, galFalloff) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));
  const ro = d.vec3f(0, 0, u.p_camDist);
  const rd = std.normalize(d.vec3f(uv, -u.p_focal));

  const t = u.p_churn; // integrated clock: the turbulence boils
  const spin = u.p_spin; // integrated clock: the disc turns

  // the galaxy frame: tip about x by the tilt, then turn about the disc's
  // own normal
  const ct = std.cos(u.p_tilt);
  const st = std.sin(u.p_tilt);
  const cs = std.cos(spin);
  const sn = std.sin(spin);

  let acc = d.vec3f();
  let trans = d.vec3f(1);
  // extinction weighted to blue, so thick gas reddens what is behind it
  const absorb = d.vec3f(0.7, 1, 1.5).mul(u.p_absorb);

  // march only the span the envelope can light
  let z = std.max(u.p_camDist - u.p_envRadius * 1.05, 0);
  const zEnd = u.p_camDist + u.p_envRadius * 1.05;
  const dt = (zEnd - z) / d.f32(STEPS);
  // a hashed start offset per pixel hides the step banding
  z += dt * hash(fragCoord.mul(0.37));

  for (const _i of std.range(STEPS)) {
    const p = ro.add(rd.mul(z));

    // envelope: nothing outside the ball contributes
    const env =
      1 - std.smoothstep(u.p_envRadius * 0.92, u.p_envRadius, std.length(p));
    if (env > 0.001) {
      // into the galaxy frame
      let g = d.vec3f(p.x, p.y * ct - p.z * st, p.y * st + p.z * ct);
      g = d.vec3f(g.x * cs - g.z * sn, g.y, g.x * sn + g.z * cs);

      const gs = galaxy(
        g.div(u.p_envRadius),
        t,
        galDensity,
        galCore,
        galFalloff
      );
      const arm = gs.y;
      const rho = gs.z;
      const dens = gs.x * env;

      // the colour ramp, keyed to radius from the core
      const ramp = std.mix(
        u.c_inner,
        u.c_outer,
        std.smoothstep(0.12, u.p_hueReach, rho)
      );
      const coreW = std.exp(-rho * rho * u.p_bulge * 0.6);
      const emit = std.mix(ramp, u.c_core, coreW).mul(0.6 + 0.6 * arm);

      acc = acc.add(trans.mul(dens * dt).mul(emit));
      trans = trans.mul(std.exp(absorb.mul(-dens * dt)));
    }

    z += dt;
    if (trans.y < 0.004 || z > zEnd) {
      break;
    }
  }

  return d.vec4f(acc, 1 - trans.y);
});

const orb32Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // The beat: one wave on the core-beat clock, shared by the core flare and
    // the disc's breathing. Both depths are amplitudes, so they stage cleanly.
    const wave = 0.5 + 0.5 * std.cos(u.p_beat);
    const galDensity = u.p_density * (1 + 0.35 * u.inputVol);
    const galCore = u.p_core * (1 + 0.7 * u.outputVol) * (1 + u.p_pulse * wave);
    // breathing: the disc's falloff relaxes on the wave, so the whole disc
    // swells outward and draws back — a smooth exponential, safe to sweep
    const galFalloff = u.p_falloff / (1 + u.p_breathe * wave);

    let acc = galaxyRender(fragCoord, galDensity, galCore, galFalloff);

    /*
     * Stars, at the ray's exact hit with the galactic plane. The plane is the
     * tilted xz-plane through the origin; its world normal is the tilted y.
     * The lattice lives in the disc's own turning frame, so the stars turn
     * with the gas, and the march's transmittance dims them through the dust.
     */
    const ro = d.vec3f(0, 0, u.p_camDist);
    const rd = std.normalize(d.vec3f(orbUv, -u.p_focal));
    const ct = std.cos(u.p_tilt);
    const st = std.sin(u.p_tilt);
    const N = d.vec3f(0, ct, st);
    const denom = std.dot(N, rd);
    if (std.abs(denom) > 1e-4) {
      const th = -std.dot(N, ro) / denom;
      const q = ro.add(rd.mul(th));
      if (th > 0 && std.dot(q, q) < u.p_envRadius * u.p_envRadius * 0.9) {
        const g = d
          .vec3f(q.x, q.y * ct - q.z * st, q.y * st + q.z * ct)
          .div(u.p_envRadius);
        const cs = std.cos(u.p_spin);
        const sn = std.sin(u.p_spin);
        const gp = d.vec2f(g.x * cs - g.z * sn, g.x * sn + g.z * cs);
        const rho = std.length(gp);
        const phi = std.select(0, std.atan2(gp.y, gp.x), rho > 1e-4);
        const armW =
          0.5 +
          0.5 *
            std.cos(phi * u.p_arms - u.p_wind * std.log(std.max(rho, 0.02)));
        const sf = starField(
          gp.mul(u.p_starScale),
          u.p_starDensity * (0.3 + 0.7 * armW),
          0.12,
          u.p_twinkle
        );
        const veil = 1 - acc.w; // what the march let through
        const starLight = d
          .vec3f(1, 0.97, 0.9)
          .mul(sf * u.p_stars * std.exp(-rho * 1.5) * (0.25 + 0.75 * veil));
        acc = d.vec4f(acc.xyz.add(starLight), acc.w);
      }
    }

    // tanh tone map per channel, tunable knee
    let col = tanh3(acc.xyz.div(std.max(u.p_exposure, 0.01)));
    col = std.pow(std.clamp(col, d.vec3f(), d.vec3f(1)), d.vec3f(u.p_contrast));

    // saturation about luminance, then the tint
    const lum = std.dot(col, d.vec3f(0.299, 0.587, 0.114));
    col = std.mix(d.vec3f(lum), col, u.p_saturation);
    col = col.mul(u.c_tint);

    // alpha from the brightest channel — emitted light (see orb-18)
    const peak = std.max(col.x, std.max(col.y, col.z));
    let a = std.clamp(peak * u.p_alphaGain, 0, 1);

    // the night behind: a fill so the ball is a solid sphere, not a cut-out
    col = col.add(u.c_deep.mul(u.p_fill));
    a = std.max(a, u.p_fill);

    // Analytic silhouette — identical construction to orb-01: exact
    // ray-to-centre distance against the radius, colour AND alpha.
    const mrd = std.normalize(d.vec3f(orbUv, -u.p_focal));
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

    // a fresnel rim on the glass, inside the mask
    const fres = std.smoothstep(u.p_envRadius * 0.7, u.p_envRadius, closest);
    col = col.add(u.c_rim.mul(u.p_rim * fres * fres * mask));

    // safety taper at the frame boundary — colour as well as alpha
    const r2d = std.length(orbUv);
    const fade = 1 - std.smoothstep(u.p_edgeFade, 1, r2d);
    col = col.mul(fade);
    a *= fade;

    // Emitted light, so rgb is already premultiplied — do NOT scale by alpha
    // again (see the same note in orb-31).
    return d.vec4f(col, a);
  })
  .$name("orb32Fragment");

export const orb32Shader = tgpu.resolve([orb32Fragment]);

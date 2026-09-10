import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

export const orb11Params = d.struct({
  anim: d.f32,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_baseVis: d.f32,
  p_chromaSpread: d.f32,
  p_flowAmp: d.f32,
  p_flowScale: d.f32,
  p_flowSpeed: d.f32,
  p_glow: d.f32,
  p_metalDark: d.f32,
  p_posScale: d.f32,
  p_precess: d.f32,
  p_probGain: d.f32,
  p_probPow: d.f32,
  p_radialDecay: d.f32,
  p_radialPow: d.f32,
  p_radius: d.f32,
  p_rotSpeed: d.f32,
  p_speed: d.f32,
  p_swell: d.f32,
  p_waveFreq: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: orb11Params },
  })
  .$idx(0);

const hash = tgpu.fn(
  [d.vec2f],
  d.f32
)((p) =>
  std.fract(std.sin(std.dot(p, d.vec2f(127.1, 311.7))) * 43_758.545_312_3)
);

const noise = tgpu.fn(
  [d.vec2f],
  d.f32
)((p) => {
  "use gpu";
  const i = std.floor(p);
  const f = std.fract(p);
  const ff = f.mul(f).mul(d.vec2f(3).sub(f.mul(2)));
  return std.mix(
    std.mix(hash(i), hash(i.add(d.vec2f(1, 0))), ff.x),
    std.mix(hash(i.add(d.vec2f(0, 1))), hash(i.add(d.vec2f(1, 1))), ff.x),
    ff.y
  );
});

const fbm = tgpu.fn(
  [d.vec2f],
  d.f32
)((pIn) => {
  "use gpu";
  let p = d.vec2f(pIn);
  let v = d.f32(0);
  let a = d.f32(0.5);
  for (const _i of std.range(5)) {
    v += a * noise(p);
    p = p.mul(2.03).add(d.vec2f(11.7, 7.3));
    a *= 0.5;
  }
  return v;
});

const orb11Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    const r2d = std.length(uv);
    const R = u.p_radius + u.p_swell * u.inputVol;
    const mask = std.smoothstep(0.012, -0.012, r2d - R);
    const nr = std.clamp(r2d / std.max(R, 0.001), 0, 1);
    const z = std.sqrt(std.max(1 - nr * nr, 0));

    // p_speed and p_flowSpeed arrive pre-integrated as clocks, so state
    // transitions stay phase-continuous. Input/output excitement bends zoom,
    // radial form, probability and chroma into a different interference pattern.
    const posScale =
      u.p_posScale * (0.8 + 0.45 * u.outputVol + 0.2 * u.inputVol);
    const radialPow = u.p_radialPow * (0.7 + 0.8 * u.outputVol);
    const radialDecay = u.p_radialDecay * (1.25 - 0.5 * u.outputVol);
    const probPow = u.p_probPow * (1.3 - 0.55 * u.outputVol);
    const probGain =
      u.p_probGain * (0.7 + 0.6 * u.outputVol + 0.5 * u.inputVol);
    const waveFreq = u.p_waveFreq * (0.6 + 1 * u.outputVol);
    const chromaSpread =
      u.p_chromaSpread * (0.6 + 0.9 * u.outputVol + 0.5 * u.inputVol);

    // dome point rotated around Y — the fake 3D of the flat disc
    const animTime = u.p_speed;
    const cosT = std.cos(animTime * u.p_rotSpeed);
    const sinT = std.sin(animTime * u.p_rotSpeed);
    const nxy = uv.div(std.max(R, 0.001));
    const sp = d.vec3f(nxy.x, nxy.y, z).mul(posScale);
    let pos = d.vec3f(
      sp.x * cosT - sp.z * sinT,
      sp.y,
      sp.x * sinT + sp.z * cosT
    );

    // precession: the rotation axis itself drifts, so the pattern never
    // settles into a repeating spin
    const tilt = std.sin(animTime * 0.21 + 1.7) * u.p_precess;
    const cx = std.cos(tilt);
    const sx = std.sin(tilt);
    pos = d.vec3f(pos.x, pos.y * cx - pos.z * sx, pos.y * sx + pos.z * cx);

    // liquid flow: drifting fbm warps the 3D domain so the wave function
    // smears around the sphere instead of wobbling in place
    const flowT = u.p_flowSpeed;
    const fAmp = u.p_flowAmp * (0.7 + 0.6 * u.outputVol + 0.4 * u.inputVol);
    const w = d.vec3f(
      fbm(pos.yz.mul(u.p_flowScale).add(d.vec2f(flowT * 0.7, -flowT * 0.4))),
      fbm(
        pos.zx
          .mul(u.p_flowScale)
          .add(d.vec2f(-flowT * 0.55, flowT * 0.62).add(3.7))
      ),
      fbm(
        pos.xy
          .mul(u.p_flowScale)
          .add(d.vec2f(flowT * 0.5, flowT * 0.85).add(7.1))
      )
    );
    pos = pos.add(w.sub(0.5).mul(fAmp));

    const r = std.length(pos) + 0.001;
    const theta = std.acos(std.clamp(pos.y / r, -1, 1));
    const phi = std.atan2(pos.z, pos.x);

    const a0 = d.f32(0.5);
    const rho = (2 * r) / (5 * a0);
    const radial = std.pow(rho, radialPow) * std.exp(-rho / radialDecay);
    const angular = std.pow(std.sin(theta), 3) * std.cos(phi + animTime * 0.2);

    const psi = radial * angular;
    let probability = psi * psi;

    // travelling spiral wave — snap the azimuthal harmonic to a whole number
    // so sin(phi * f) lines up across the +/-PI wrap
    const waveN = std.max(1, std.floor(waveFreq + 0.5));
    const wavePhase = phi * waveN + theta * 2.5 - animTime * 2;
    probability *= 0.85 + 0.15 * std.sin(wavePhase);

    // drifting bright patches, like convection cells wandering the surface
    const patches = fbm(
      pos.xy.mul(1.6).add(d.vec2f(flowT * 0.4, -flowT * 0.3))
    );
    probability *= 0.65 + 0.7 * patches;

    probability = std.pow(probability, probPow) * probGain;
    probability = std.clamp(probability, 0, 1);

    const fresnel = std.pow(1 - z, 1.5);

    const chromaOffset =
      phi * 2 + theta * 1.5 + animTime * 0.3 + probability * 3;
    const rainbowRaw = d.vec3f(
      std.sin(chromaOffset) * 0.5 + 0.5,
      std.sin(chromaOffset + chromaSpread) * 0.5 + 0.5,
      std.sin(chromaOffset + chromaSpread * 2) * 0.5 + 0.5
    );
    const rainbow = std
      .normalize(rainbowRaw.add(0.01))
      .mul(std.length(rainbowRaw));

    const bandFreq = chromaOffset * 3 + fresnel * 2.4;
    const chromaticBands = d.vec3f(
      std.sin(bandFreq) * 0.5 + 0.5,
      std.sin(bandFreq + 2.094) * 0.5 + 0.5,
      std.sin(bandFreq + 4.189) * 0.5 + 0.5
    );

    let glowColor = std.mix(rainbow, chromaticBands, 0.12);
    glowColor = std.pow(glowColor, d.vec3f(0.8));

    const darkMetal = d.vec3f(u.p_metalDark);
    const lightMetal = std.mix(d.vec3f(0.9, 0.92, 0.95), glowColor, 0.7);

    const metalGradient = std.smoothstep(
      0,
      1,
      probability * 0.7 + fresnel * 0.3
    );
    const metalColor = std.mix(darkMetal, lightMetal, metalGradient);

    const orbGlow = u.p_glow + 0.6 * u.outputVol;
    const totalGlow = (0.25 + fresnel * 0.6 + probability * 0.8) * orbGlow;
    const glowAmount = std.clamp(std.pow(totalGlow, 0.7), 0, 1);

    let surfaceColor = std.mix(metalColor, glowColor, glowAmount);

    const normal = d.vec3f(nxy.x, nxy.y, z);
    const specular = std.pow(
      std.max(std.dot(normal, std.normalize(d.vec3f(1, 1, 2))), 0),
      32
    );
    surfaceColor = surfaceColor.add(
      std.mix(d.vec3f(1), glowColor, 0.6).mul(specular * 0.4)
    );

    const visibility = std.clamp(
      probability * 1.2 + fresnel * 0.3 + u.p_baseVis + u.inputVol * 0.15,
      0,
      1
    );

    const alpha = mask * visibility;
    return d.vec4f(surfaceColor.mul(alpha), alpha);
  })
  .$name("orb11Fragment");

export const orb11Shader = tgpu.resolve([orb11Fragment]);

import { d, std, tgpu } from "typegpu";

import { rot2 } from "@/lib/shader";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

const LAYERS = 10;
const WARP = 9;

export const orb02Params = d.struct({
  anim: d.f32,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_alphaGain: d.f32,
  p_baseVis: d.f32,
  p_bulge: d.f32,
  p_coreClamp: d.f32,
  p_falloff: d.f32,
  p_gain: d.f32,
  p_hueShift: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_rimPow: d.f32,
  p_speed: d.f32,
  p_swell: d.f32,
  p_swirl: d.f32,
  p_warpFreq: d.f32,
  p_zoom: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: orb02Params },
  })
  .$idx(0);

const orb02Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    const R = u.p_radius + u.p_swell * u.inputVol;
    const r2d = std.length(orbUv);
    const mask = std.smoothstep(0.012, -0.012, r2d - R);
    const nr = std.clamp(r2d / std.max(R, 0.001), 0, 1);
    const z = std.sqrt(std.max(1 - nr * nr, 0));

    const animTime = u.p_speed;

    const sp = d.vec3f(orbUv.div(std.max(R, 0.001)), z);

    /*
     * Stereographic projection: sphere → plane. Equal steps in screen space map
     * to ever-larger steps in pattern space as the rim is approached. p_bulge
     * softens the divisor — higher flattens it back toward a disc.
     *
     * DO NOT rotate sp in 3D before this. Spinning the dome about Y mixes sp.x
     * into sp.z, so near the rim the divisor collapses toward zero.
     */
    let p = d.vec2f(sp.xy.div(sp.z + 1 + u.p_bulge).mul(u.p_zoom));

    const sw = animTime * u.p_swirl;
    p = std.mul(rot2(sw), p);

    const warpFreq = u.p_warpFreq * (1 + 0.35 * u.inputVol);
    const gain = u.p_gain * (0.75 + 0.7 * u.outputVol);

    let acc = d.vec4f();
    for (const i of std.range(LAYERS)) {
      const fi = d.f32(i) + 1;
      let v = d.vec2f(p);
      for (const j of std.range(WARP)) {
        const f = d.f32(j) + 1;
        v = v.add(
          std
            .sin(
              v.yx
                .mul(f * warpFreq)
                .add(fi)
                .add(animTime)
            )
            .div(f)
        );
      }
      const rad = std.pow(std.max(std.length(v), u.p_coreClamp), u.p_falloff);
      acc = acc.add(
        std
          .cos(d.vec4f(0, 1, 2, 3).add(fi).add(u.p_hueShift))
          .add(1)
          .div(6)
          .div(rad)
      );
    }

    let col = std.tanh(acc.xyz.mul(acc.xyz).mul(gain));

    const fresnel = std.pow(1 - z, u.p_rimPow);
    col = col.add(d.vec3f(fresnel).mul(u.p_rim));

    const lum = std.dot(col, d.vec3f(0.2126, 0.7152, 0.0722));
    const visibility = std.clamp(
      lum * u.p_alphaGain + u.p_baseVis + fresnel * 0.25,
      0,
      1
    );

    const a = mask * visibility;
    return d.vec4f(col.mul(a), a);
  })
  .$name("orb02Fragment");

export const orb02Shader = tgpu.resolve([orb02Fragment]);

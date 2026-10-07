import { d, std, tgpu } from "typegpu";

import { rot2 } from "@/lib/shader";

/*
 * Adapted from Paper Shaders (`warp.ts`) by Paper Design
 * (https://github.com/paper-design/shaders).
 * Licensed under the Apache License, Version 2.0 (Apache-2.0).
 * Ported to TypeGPU / WGSL for shadercn.
 */

const MAX_SWIRL_STEPS = 20;
const TWO_PI = 6.283_185_307_18;

export const warpParams = d.struct({
  anim: d.f32,
  c_color1: d.vec3f,
  c_color2: d.vec3f,
  c_color3: d.vec3f,
  c_color4: d.vec3f,
  p_distortion: d.f32,
  p_proportion: d.f32,
  p_rotation: d.f32,
  p_scale: d.f32,
  p_shape: d.f32,
  p_shapeScale: d.f32,
  p_softness: d.f32,
  p_speed: d.f32,
  p_swirl: d.f32,
  p_swirlIterations: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: warpParams },
  })
  .$idx(0);

const hash21 = tgpu.fn(
  [d.vec2f],
  d.f32
)((p) => {
  "use gpu";
  let q = std.fract(p.mul(d.vec2f(0.318_309_9, 0.367_879_4))).add(0.1);
  q = q.add(std.dot(q, q.add(19.19)));
  return std.fract(q.x * q.y);
});

const valueNoise = tgpu.fn(
  [d.vec2f],
  d.f32
)((st) => {
  "use gpu";
  const i = std.floor(st);
  const f = std.fract(st);
  const a = hash21(i);
  const b = hash21(i.add(d.vec2f(1, 0)));
  const c = hash21(i.add(d.vec2f(0, 1)));
  const dVal = hash21(i.add(d.vec2f(1, 1)));
  const u = f.mul(f).mul(d.vec2f(3).sub(f.mul(2)));
  const x1 = std.mix(a, b, u.x);
  const x2 = std.mix(c, dVal, u.x);
  return std.mix(x1, x2, u.y);
});

const blendStop = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32, d.f32],
  d.vec3f
)((acc, nextCol, rawM, softnessParam) => {
  "use gpu";
  const m = std.clamp(rawM, 0, 1);
  const localStart = std.floor(m);
  const soft = 0.5 * softnessParam + 0.015;
  const lowEdge = std.max(0, 0.5 - soft);
  const highEdge = std.min(1, 0.5 + soft);
  const smoothed = std.smoothstep(lowEdge, highEdge, m - localStart);
  const stepped = localStart + smoothed;
  const factor = std.mix(stepped, m, softnessParam);
  return std.mix(acc, nextCol, factor);
});

const warpFragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const minDim = std.max(std.min(u.res.x, u.res.y), 1);
    const centered = fragCoord.mul(2).sub(u.res).div(minDim);
    const rotMat = rot2(u.p_rotation);
    let uv = std
      .mul(rotMat, centered)
      .mul(0.5 * std.max(u.p_scale, 0.05));

    const t = 0.0625 * (u.p_speed + 118);

    const n1 = valueNoise(uv.add(t));
    const n2 = valueNoise(uv.mul(2).sub(t));
    const angle = n1 * TWO_PI;
    uv = d.vec2f(
      uv.x + 4 * u.p_distortion * n2 * std.cos(angle),
      uv.y + 4 * u.p_distortion * n2 * std.sin(angle)
    );

    const swirl = u.p_swirl;
    const maxIter = d.i32(u.p_swirlIterations);
    for (const idx of std.range(MAX_SWIRL_STEPS)) {
      const stepIdx = idx + 1;
      if (stepIdx >= maxIter) {
        break;
      }
      const iFloat = d.f32(stepIdx);
      const nextX =
        uv.x + (swirl / iFloat) * std.cos(t + iFloat * 1.5 * uv.y);
      const nextY =
        uv.y + (swirl / iFloat) * std.cos(t + iFloat * 1.0 * nextX);
      uv = d.vec2f(nextX, nextY);
    }

    const proportion = std.clamp(u.p_proportion, 0, 1);
    const propDelta = proportion - 0.5;
    const propBias =
      0.48 * std.sign(propDelta) * std.sqrt(std.abs(propDelta));

    let shape = d.f32(0);
    if (u.p_shape < 0.5) {
      const checksUv = uv.mul(0.5 + 3.5 * u.p_shapeScale);
      shape = 0.5 + 0.5 * std.sin(checksUv.x) * std.cos(checksUv.y) + propBias;
    } else if (u.p_shape < 1.5) {
      const stripesUv = uv.mul(2 * u.p_shapeScale);
      const f = std.fract(stripesUv.y);
      shape =
        std.smoothstep(0, 0.55, f) * (1 - std.smoothstep(0.45, 1, f)) +
        propBias;
    } else {
      const shapeScaling = 5 * (1 - u.p_shapeScale);
      const e0 = 0.45 - shapeScaling;
      const e1 = 0.55 + shapeScaling;
      shape = std.smoothstep(
        std.min(e0, e1),
        std.max(e0, e1) + 1e-4,
        1 - uv.y + 0.3 * propDelta
      );
    }

    const mixer = shape * 3;
    let col = d.vec3f(u.c_color1);
    col = blendStop(col, u.c_color2, mixer, u.p_softness);
    col = blendStop(col, u.c_color3, mixer - 1, u.p_softness);
    col = blendStop(col, u.c_color4, mixer - 2, u.p_softness);

    const dither = (hash21(fragCoord) - 0.5) / 255;
    col = std.clamp(col.add(dither), d.vec3f(0), d.vec3f(1));

    return d.vec4f(col, 1);
  })
  .$name("warpFragment");

export const warpShader = tgpu.resolve([warpFragment]);

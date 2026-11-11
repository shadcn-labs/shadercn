import { d, std, tgpu } from "typegpu";

import { rot2 } from "@/lib/shader";

/*
 * Adapted from Paper Shaders (`water.ts`) by Paper Design
 * (https://github.com/paper-design/shaders).
 * Licensed under the Apache License, Version 2.0 (Apache-2.0).
 * Ported to TypeGPU / WGSL for shadercn.
 */

const CAUSTIC_OCTAVES = 6;

export const waterParams = d.struct({
  anim: d.f32,
  c_colorBack: d.vec3f,
  c_colorHighlight: d.vec3f,
  c_colorMid: d.vec3f,
  p_caustic: d.f32,
  p_edges: d.f32,
  p_highlights: d.f32,
  p_layering: d.f32,
  p_scale: d.f32,
  p_size: d.f32,
  p_speed: d.f32,
  p_waves: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: waterParams },
  })
  .$idx(0);

const mod289v3 = tgpu.fn(
  [d.vec3f],
  d.vec3f
)((x) => {
  "use gpu";
  return x.sub(std.floor(x.mul(1 / 289)).mul(289));
});

const mod289v2 = tgpu.fn(
  [d.vec2f],
  d.vec2f
)((x) => {
  "use gpu";
  return x.sub(std.floor(x.mul(1 / 289)).mul(289));
});

const permute = tgpu.fn(
  [d.vec3f],
  d.vec3f
)((x) => {
  "use gpu";
  return mod289v3(x.mul(34).add(1).mul(x));
});

const snoise = tgpu.fn(
  [d.vec2f],
  d.f32
)((v) => {
  "use gpu";
  const c = d.vec4f(
    0.211_324_865_405_187,
    0.366_025_403_784_439,
    -0.577_350_269_189_626,
    0.024_390_243_902_439
  );
  let i = std.floor(v.add(std.dot(v, d.vec2f(c.y, c.y))));
  const x0 = v.sub(i).add(std.dot(i, d.vec2f(c.x, c.x)));
  const i1 =
    x0.x > x0.y ? d.vec2f(1, 0) : d.vec2f(0, 1);
  const x12 = d.vec4f(x0.x, x0.y, x0.x, x0.y).add(
    d.vec4f(c.x, c.x, c.z, c.z)
  ).sub(d.vec4f(i1.x, i1.y, 0, 0));
  i = mod289v2(i);
  const p = permute(
    permute(
      d.vec3f(0, i1.y, 1).add(i.y)
    ).add(d.vec3f(0, i1.x, 1).add(i.x))
  );
  let m = std.max(
    d.vec3f(0.5).sub(
      d.vec3f(
        std.dot(x0, x0),
        std.dot(d.vec2f(x12.x, x12.y), d.vec2f(x12.x, x12.y)),
        std.dot(d.vec2f(x12.z, x12.w), d.vec2f(x12.z, x12.w))
      )
    ),
    d.vec3f(0)
  );
  m = m.mul(m);
  m = m.mul(m);
  const x = std.fract(p.mul(c.w)).mul(2).sub(1);
  const h = std.abs(x).sub(0.5);
  const ox = std.floor(x.add(0.5));
  const a0 = x.sub(ox);
  m = m.mul(
    d.vec3f(1.792_842_914_001_59).sub(
      a0.mul(a0).add(h.mul(h)).mul(0.853_734_720_953_14)
    )
  );
  const g0 = a0.x * x0.x + h.x * x0.y;
  const g1 = a0.y * x12.x + h.y * x12.y;
  const g2 = a0.z * x12.z + h.z * x12.w;
  return 130 * std.dot(m, d.vec3f(g0, g1, g2));
});

const getCausticNoise = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.f32
)((uvIn, t, initialScale) => {
  "use gpu";
  let uv = d.vec2f(uvIn);
  let n = d.vec2f(0.1, 0.1);
  let N = d.vec2f(0.1, 0.1);
  let scale = d.f32(initialScale);
  const m = rot2(0.5);

  for (const j of std.range(CAUSTIC_OCTAVES)) {
    uv = std.mul(m, uv);
    n = std.mul(m, n);
    const jFloat = d.f32(j);
    const parity = d.f32(j % 2) - 1;
    const timeShift = (0.5 + 0.5 * jFloat) * parity * t;
    const q = uv.mul(scale).add(jFloat).add(n).add(timeShift);
    n = n.add(std.sin(q));
    N = N.add(std.cos(q).div(scale));
    scale *= 1.1;
  }
  return N.x + N.y + 1;
});

const waterFragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const aspect = u.res.x / std.max(u.res.y, 1);
    let imageUV = d.vec2f(input.uv);
    let patternUV = input.uv.sub(0.5).mul(d.vec2f(aspect, 1)).mul(u.p_scale);
    patternUV = patternUV.div(0.01 + 0.09 * u.p_size);

    const t = u.p_speed;

    const wavesNoise = snoise(
      patternUV.mul((0.3 + 0.1 * std.sin(t)) * 0.1).add(d.vec2f(0, 0.4 * t))
    );

    const waveOffset = d.vec2f(1, -1).mul(u.p_waves * wavesNoise);
    let causticNoise = getCausticNoise(patternUV.add(waveOffset), 2 * t, 1.5);

    if (u.p_layering > 0) {
      causticNoise +=
        u.p_layering *
        getCausticNoise(patternUV.add(waveOffset.mul(2)), 1.5 * t, 2);
    }
    causticNoise *= causticNoise;

    let edgesDistortion =
      std.smoothstep(0, 0.1, imageUV.x) * std.smoothstep(0, 0.1, imageUV.y);
    edgesDistortion *=
      std.smoothstep(1, 1.1, imageUV.x) +
      (1 - std.smoothstep(0.8, 0.95, imageUV.x));
    edgesDistortion *= 1 - std.smoothstep(0.9, 1, imageUV.y);
    edgesDistortion = std.mix(edgesDistortion, 1, u.p_edges);

    const causticDistortion = 0.02 * causticNoise * edgesDistortion;
    const wavesDistortion = 0.1 * u.p_waves * wavesNoise;

    imageUV = imageUV
      .add(d.vec2f(wavesDistortion, -wavesDistortion))
      .add(u.p_caustic * causticDistortion);

    const depthGrad = std.clamp(
      0.5 + 0.5 * std.sin(imageUV.x * 3.14159) * std.cos(imageUV.y * 3.14159) +
        0.25 * wavesNoise,
      0,
      1
    );
    let color = std.mix(u.c_colorBack, u.c_colorMid, depthGrad);

    const clampedCaustic = std.max(-0.2, causticNoise);
    const highlightAmt = std.clamp(
      0.05 * u.p_highlights * clampedCaustic,
      0,
      1
    );
    color = std.mix(color, u.c_colorHighlight, highlightAmt);

    const shimmer = 0.025 * u.p_highlights * clampedCaustic * (0.5 + 0.5 * wavesNoise);
    color = std.clamp(color.add(shimmer), d.vec3f(0), d.vec3f(1));

    return d.vec4f(color, 1);
  })
  .$name("waterFragment");

export const waterShader = tgpu.resolve([waterFragment]);

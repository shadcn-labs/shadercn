import { d, std, tgpu } from "typegpu";

const PI = 3.141_592_653_59;

const Params = d.struct({
  anim: d.f32,
  c_deep: d.vec3f,
  c_flash: d.vec3f,
  c_hot: d.vec3f,
  c_low: d.vec3f,
  c_mid: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_bands: d.f32,
  p_churn: d.f32,
  p_contrast: d.f32,
  p_filmGrain: d.f32,
  p_flash: d.f32,
  p_flashRate: d.f32,
  p_gain: d.f32,
  p_grain: d.f32,
  p_grainSize: d.f32,
  p_light: d.f32,
  p_radius: d.f32,
  p_rainbow: d.f32,
  p_rim: d.f32,
  p_scale: d.f32,
  p_shear: d.f32,
  p_speed: d.f32,
  p_spin: d.f32,
  p_warp: d.f32,
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

// Animated white noise, one tap per grain cell per grain frame.
const grainNoise = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.f32
)((gpix, frame, seed) =>
  hash(gpix.add(d.vec2f(frame * 13.71 + seed, frame * 7.37 - seed)))
);

const orb17Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // User input churns the warp harder, agent output brightens the field.
    const warpNow = u.p_warp * (1 + 0.55 * u.inputVol);
    const gainNow = u.p_gain * (0.85 + 0.45 * u.outputVol);

    const rd = std.length(uv);
    const R = u.p_radius;
    const mask = std.smoothstep(0.012, -0.012, rd - R);

    // Skip the five fbm evaluations outside the silhouette.
    if (mask <= 0) {
      return d.vec4f();
    }

    const pl = uv.div(R);
    const r2 = std.dot(pl, pl);
    const z = std.sqrt(std.max(1 - r2, 0));
    const n = d.vec3f(pl.x, pl.y, z);

    const cr = std.cos(u.p_spin);
    const sr = std.sin(u.p_spin);
    const sp = d.vec3f(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);

    const t = u.p_speed;

    // stereographic wrap: weather travels around the ball and compresses toward the limb
    let st = sp.xy.div(1.3 + sp.z).mul(u.p_scale);

    /*
     * Jovian band flow: a uniform stream plus a BOUNDED traveling wave of
     * shear, so latitude rings slip past each other without accumulating
     * into hairline streaks. sp.y is untouched by the Y-roll, so the bands
     * hold horizontal while the dome turns underneath them.
     */
    st = d.vec2f(st.x - t * 0.3, st.y);
    st = d.vec2f(st.x + u.p_shear * std.sin(sp.y * u.p_bands - t * 0.45), st.y);

    const q = d.vec2f(
      fbm(st.add(d.vec2f(0, t * 0.35))),
      fbm(st.add(d.vec2f(5.2, 1.3)).sub(d.vec2f(t * 0.28, 0)))
    );
    const w = d.vec2f(
      fbm(
        st
          .add(q.mul(warpNow))
          .add(d.vec2f(1.7, 9.2))
          .add(d.vec2f(t * 0.12, 0))
      ),
      fbm(
        st
          .add(q.mul(warpNow))
          .add(d.vec2f(8.3, 2.8))
          .sub(d.vec2f(0, t * 0.1))
      )
    );
    let f = fbm(st.add(w.mul(u.p_churn)));

    /*
     * Grain tap 1: speckle folded into the FIELD itself, before the gradient,
     * so colour stops dither into grain instead of smooth bands.
     */
    const gpix = std.floor(fragCoord.div(std.max(u.p_grainSize, 1)));
    const frame = std.floor(u.time * 48);
    const g1 = grainNoise(gpix, frame, 3.1);
    f += (g1 - 0.5) * u.p_grain;

    f = std.pow(std.clamp(f * gainNow, 0, 1), u.p_contrast);

    let col = std.mix(u.c_deep, u.c_low, std.smoothstep(0.05, 0.35, f));
    col = std.mix(col, u.c_mid, std.smoothstep(0.35, 0.62, f));
    col = std.mix(col, u.c_hot, std.smoothstep(0.62, 0.88, f));

    // iridescent shimmer keyed to the field AND the warp vector, so rainbow
    // lands as coherent weather cells instead of hue noise
    const shimmer = d.vec3f(0.5).add(
      std
        .cos(
          d
            .vec3f(0, 0.33, 0.67)
            .add(f * 0.9 + q.x * 1.1 + t * 0.06)
            .mul(2 * PI)
        )
        .mul(0.5)
    );
    col = std.mix(col, col.mul(shimmer.mul(1.9).add(0.35)), u.p_rainbow);

    /*
     * Lightning: one hashed gate per flash interval with exponential decay.
     * Agent output opens the gate. Squared so the strike stays inside storm cells.
     */
    const ft = t * u.p_flashRate;
    const gate = std.step(
      1 - (0.1 + 0.5 * u.outputVol),
      hash(d.vec2f(std.floor(ft), 7.7))
    );
    const flashEnv = gate * std.exp(-std.fract(ft) * 6);
    const high = std.smoothstep(0.55, 0.95, f);
    col = col.add(
      u.c_flash.mul(flashEnv * u.p_flash).mul(0.06 + 0.94 * high * high)
    );

    const lambert = std.clamp(
      std.dot(n, std.normalize(d.vec3f(-0.45, 0.55, 0.7))),
      0,
      1
    );
    col = col.mul(0.35 + u.p_light * lambert);
    const fres = std.pow(1 - z, 2.5);
    col = col.add(u.c_flash.mul(u.p_rim * fres * (0.4 + 0.35 * flashEnv)));

    const g2 = grainNoise(gpix, frame, 27.9);
    col = col.mul(1 + (g2 - 0.5) * u.p_filmGrain);

    const alpha = mask;
    return d.vec4f(std.max(col, d.vec3f()).mul(alpha), alpha);
  })
  .$name("orb17Fragment");

export const orb17Shader = tgpu.resolve([orb17Fragment]);

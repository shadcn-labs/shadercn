import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

const MAX_STEPS = 256;

export const orb31Params = d.struct({
  anim: d.f32,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_alphaGain: d.f32,
  p_ambient: d.f32,
  p_camDist: d.f32,
  p_edgeFade: d.f32,
  p_fov: d.f32,
  p_freqSwing: d.f32,
  p_maxDist: d.f32,
  p_radius: d.f32,
  p_rayFalloff: d.f32,
  p_rayGain: d.f32,
  p_smoothK: d.f32,
  p_smoothSwing: d.f32,
  p_speed: d.f32,
  p_stepScale: d.f32,
  p_surfaceLit: d.f32,
  p_sweepRate: d.f32,
  p_swell: d.f32,
  p_warp: d.f32,
  p_warpFreq: d.f32,
  p_warpSwing: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: orb31Params },
  })
  .$idx(0);

// An artistic tumble, not an orthonormal rotation — the axes shear against each
// other so the shell never repeats a clean spin.
const coronaRot = tgpu.fn(
  [d.f32],
  d.mat3x3f
)((a) =>
  d.mat3x3f(
    std.cos(a),
    std.sin(a / 2) * std.sin(a),
    std.sin(a) * std.cos(a / 2),
    0,
    std.cos(a / 2),
    -std.sin(a / 2),
    -std.sin(a),
    std.sin(a / 2) * std.cos(a),
    std.cos(a / 2) * std.cos(a)
  )
);

const smin = tgpu.fn(
  [d.f32, d.f32, d.f32],
  d.f32
)((a, b, k) => {
  "use gpu";
  const h = std.clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return std.mix(b, a, h) - k * h * (1 - h);
});

const coronaSDF = tgpu.fn(
  [d.vec3f, d.f32, d.f32, d.f32, d.f32],
  d.f32
)((p, shellRadius, warpAmount, warpFreqNow, smoothKNow) => {
  "use gpu";
  let p1 = d.vec3f(p);
  // p1.zyx += ... : WGSL has no swizzle assignment, so the reversed
  // components are written back one at a time from a temporary.
  const w = std.sin(p.xzy.mul(warpFreqNow)).div(std.max(warpAmount, 0.001));
  p1 = d.vec3f(p1.x + w.z, p1.y + w.y, p1.z + w.x);
  return -smin(
    std.length(p1) - shellRadius,
    shellRadius - std.length(p),
    smoothKNow
  );
});

const shellColor = tgpu.fn(
  [d.vec3f, d.mat3x3f, d.f32, d.f32, d.f32, d.f32],
  d.vec3f
)((p, globalInvRot, shellRadius, warpAmount, warpFreqNow, smoothKNow) => {
  "use gpu";
  const eps = 0.001;
  const normal = std.mul(
    globalInvRot,
    std.normalize(
      d.vec3f(
        coronaSDF(
          p.add(d.vec3f(eps, 0, 0)),
          shellRadius,
          warpAmount,
          warpFreqNow,
          smoothKNow
        ) -
          coronaSDF(
            p.sub(d.vec3f(eps, 0, 0)),
            shellRadius,
            warpAmount,
            warpFreqNow,
            smoothKNow
          ),
        coronaSDF(
          p.add(d.vec3f(0, eps, 0)),
          shellRadius,
          warpAmount,
          warpFreqNow,
          smoothKNow
        ) -
          coronaSDF(
            p.sub(d.vec3f(0, eps, 0)),
            shellRadius,
            warpAmount,
            warpFreqNow,
            smoothKNow
          ),
        coronaSDF(
          p.add(d.vec3f(0, 0, eps)),
          shellRadius,
          warpAmount,
          warpFreqNow,
          smoothKNow
        ) -
          coronaSDF(
            p.sub(d.vec3f(0, 0, eps)),
            shellRadius,
            warpAmount,
            warpFreqNow,
            smoothKNow
          )
      )
    )
  );

  let next = d.vec3f(1).sub(normal.mul(0.5).add(0.5));
  next = d.vec3f(std.dot(next, d.vec3f(1)) / 3);
  return d.vec3f(1.025).sub(next.mul(next));
});

const coronaRender = tgpu.fn(
  [d.vec2f, d.mat3x3f, d.mat3x3f, d.f32, d.f32, d.f32, d.f32, d.f32],
  d.vec4f
)((
  fragCoord,
  globalRot,
  globalInvRot,
  shellRadius,
  warpAmount,
  warpFreqNow,
  smoothKNow,
  rayGain
) => {
  "use gpu";
  const u = layout.$.params;
  const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

  let ro = d.vec3f(0, 0, -u.p_camDist);
  let rd = std.normalize(d.vec3f(uv, u.p_fov));

  ro = std.mul(globalRot, ro);
  rd = std.mul(globalRot, rd);

  let p = d.vec3f(ro);
  let dist = d.f32(1);
  let t = d.f32();
  let godrays = d.f32();

  for (const _i of std.range(MAX_STEPS)) {
    if (dist <= 0.005 || t >= u.p_maxDist) {
      break;
    }
    p = ro.add(rd.mul(t));
    dist =
      coronaSDF(p, shellRadius, warpAmount, warpFreqNow, smoothKNow) /
      std.max(u.p_stepScale, 0.5);

    // Gate the accumulation on the shell so light bleeds out of the hollow
    // instead of glowing uniformly through empty space.
    const fog = std.select(
      1,
      std.smoothstep(
        0,
        0.5,
        coronaSDF(
          std.normalize(p).mul(shellRadius),
          shellRadius,
          warpAmount,
          warpFreqNow,
          smoothKNow
        )
      ),
      std.length(p) > shellRadius
    );
    godrays += (rayGain / (1 + std.dot(p, p) * u.p_rayFalloff)) * fog;

    t += dist;
  }

  let col = d.vec3f(u.p_ambient);
  if (t < u.p_maxDist) {
    col = shellColor(
      p,
      globalInvRot,
      shellRadius,
      warpAmount,
      warpFreqNow,
      smoothKNow
    ).mul(u.p_surfaceLit);
  }
  col = col.add(godrays);

  return d.vec4f(col, 1);
});

const orb31Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // integrated clock
    const animTime = u.p_speed;
    const globalRot = coronaRot(animTime);
    const globalInvRot = std.transpose(coronaRot(animTime));

    /*
     * One shared BACK-AND-FORTH phase for the swept values. sin() of an
     * integrated clock is a true round trip — it eases through both ends
     * instead of snapping at a wrap, which fract() or mod() would do.
     *
     * Every swept value is resolved HERE, once per fragment, and never read
     * straight from its uniform inside coronaSDF: the normal estimate calls
     * that SDF six more times, and a value that moved between those calls
     * would corrupt the finite difference and pit the shading.
     *
     * params.p_sweepRate is its own integrated clock, so the breathing rate tunes
     * without jumping the phase, and it only ever enters through sin() —
     * safe for an unbounded clock. All three swings share the phase, so the
     * shell breathes as one motion rather than three unrelated wobbles.
     */
    const sweepPhase = std.sin(u.p_sweepRate);

    // Louder agent output pushes the godrays; user input roughens the shell and
    // swells it slightly, so the silhouette breathes with speech.
    const shellRadius = u.p_radius + u.p_swell * u.inputVol;
    let warpAmount =
      (u.p_warp + u.p_warpSwing * sweepPhase) *
      (1 - 0.25 * u.inputVol - 0.15 * u.outputVol);
    warpAmount = std.max(warpAmount, 0.05);
    const rayGain = u.p_rayGain * (0.7 + 0.8 * u.outputVol + 0.3 * u.inputVol);

    const warpFreqNow = std.max(
      u.p_warpFreq + u.p_freqSwing * sweepPhase,
      0.05
    );

    /*
     * smoothK reaches EXACTLY zero at the bottom of the speaking sweep
     * (0.25 +/- 0.25), and smin() divides by it — an unguarded zero is a
     * NaN across the whole SDF. The floor keeps the blend hard but finite.
     */
    const smoothKNow = std.max(
      u.p_smoothK + u.p_smoothSwing * sweepPhase,
      0.005
    );

    const acc = coronaRender(
      fragCoord,
      globalRot,
      globalInvRot,
      shellRadius,
      warpAmount,
      warpFreqNow,
      smoothKNow,
      rayGain
    );

    // Luminance becomes alpha so the orb composites onto the page instead of
    // painting an opaque square.
    //
    // The colour is emitted light, so it is already premultiplied: rgb is what
    // the orb adds, alpha is only how much background it hides. Multiplying rgb
    // by alpha again (the usual move for a lit surface) would darken the glow
    // quadratically and wash the godrays out.
    let col = std.clamp(acc.xyz, d.vec3f(), d.vec3f(1));
    const lum = std.dot(col, d.vec3f(0.2126, 0.7152, 0.0722));
    let a = std.clamp(lum * u.p_alphaGain, 0, 1);

    // The godrays are volumetric, so they reach the frame boundary and would
    // otherwise show the canvas as a hard-edged glowing square. Taper radially to
    // let the halo fall off into the page instead — colour as well as alpha,
    // since premultiplied output would otherwise keep emitting at full brightness
    // right up to the cutoff and leave a visible rim.
    const fade = 1 - std.smoothstep(u.p_edgeFade, 1, std.length(orbUv));
    col = col.mul(fade);
    a *= fade;

    return d.vec4f(col, a);
  })
  .$name("orb31Fragment");

export const orb31Shader = tgpu.resolve([orb31Fragment]);

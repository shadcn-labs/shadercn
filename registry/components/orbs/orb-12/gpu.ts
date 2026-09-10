import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

const STEPS = 96;

export const orb12Params = d.struct({
  anim: d.f32,
  c_brickA: d.vec3f,
  c_brickB: d.vec3f,
  c_brickC: d.vec3f,
  c_brickD: d.vec3f,
  c_brickE: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_contrast: d.f32,
  p_gain: d.f32,
  p_gap: d.f32,
  p_gloss: d.f32,
  p_light: d.f32,
  p_patch: d.f32,
  p_radius: d.f32,
  p_rebuild: d.f32,
  p_seam: d.f32,
  p_spin: d.f32,
  p_stud: d.f32,
  p_studs: d.f32,
  p_tilt: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: orb12Params },
  })
  .$idx(0);

const BrickHit = d.struct({
  bid: d.vec3f,
  off: d.f32,
  orient: d.f32,
});

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

const rot2 = tgpu.fn(
  [d.f32],
  d.mat2x2f
)((angle) => {
  "use gpu";
  const c = std.cos(angle);
  const s = std.sin(angle);
  return d.mat2x2f(d.vec2f(c, -s), d.vec2f(s, c));
});

/*
 * Which 2x4 brick owns this stud cell? Layers alternate their long axis
 * and every (layer, row) course staggers by a hashed offset — brickwork
 * bonding, so vertical seams never stack.
 */
const lgBrick = tgpu.fn(
  [d.vec3f],
  BrickHit
)((cellIdx) => {
  "use gpu";
  const orient = cellIdx.y - 2 * std.floor(cellIdx.y / 2);
  const lc = std.select(cellIdx.z, cellIdx.x, orient < 0.5);
  const sc = std.select(cellIdx.x, cellIdx.z, orient < 0.5);
  const srow = std.floor(sc / 2);
  const off = std.floor(hash(d.vec2f(cellIdx.y * 3.17, srow * 7.31)) * 4);
  const bid = d.vec3f(
    std.floor((lc + off) / 4),
    cellIdx.y,
    srow + orient * 913
  );
  return { bid, off, orient };
});

/*
 * Inside the ball, minus bricks currently blinked out of the outer two
 * courses. Interior cells skip the brick lookup.
 */
const lgSolid = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32],
  d.f32
)((cc, cell, gap) => {
  "use gpu";
  const u = layout.$.params;
  const r = std.length(cc);
  if (r >= 1) {
    return 0;
  }
  if (r > 1 - 2.2 * cell.y) {
    const brick = lgBrick(std.floor(cc.div(cell)));
    const blink = std.fract(
      hash(brick.bid.xy.mul(0.173).add(brick.bid.z * 0.089)) +
        u.p_rebuild * 0.03
    );
    if (blink < gap) {
      return 0;
    }
  }
  return 1;
});

const orb12Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const uv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    // Agent output stokes the sheen and the gain; user input brightens the key light.
    const glossNow = u.p_gloss * (0.7 + 0.9 * u.outputVol);
    const gainNow = u.p_gain * (0.92 + 0.25 * u.outputVol);
    const lightNow = u.p_light * (1 + 0.3 * u.inputVol);

    const pitch = 2 / std.clamp(u.p_studs, 8, 48);
    const cell = d.vec3f(pitch, pitch * 1.2, pitch);
    const gap = std.clamp(u.p_gap, 0, 0.9);

    const bound = 1 + std.length(cell) * 0.5 + 0.001;

    const duv = uv.div(u.p_radius);
    let ro = d.vec3f(duv.x * bound, duv.y * bound, 2.6);
    let rd = d.vec3f(0, 0, -1);

    // rotate the RAY into object space (inverse tumble) — the lattice stays
    // axis-aligned and the studs stay up while the ball turns
    const tiltM = rot2(u.p_tilt);
    const spinM = rot2(-u.p_spin);
    const roT = std.mul(tiltM, d.vec2f(ro.y, ro.z));
    ro = d.vec3f(ro.x, roT.x, roT.y);
    const roS = std.mul(spinM, d.vec2f(ro.x, ro.z));
    ro = d.vec3f(roS.x, ro.y, roS.y);
    const rdT = std.mul(tiltM, d.vec2f(rd.y, rd.z));
    rd = d.vec3f(rd.x, rdT.x, rdT.y);
    const rdS = std.mul(spinM, d.vec2f(rd.x, rd.z));
    rd = d.vec3f(rdS.x, rd.y, rdS.y);
    let Lo = std.normalize(d.vec3f(-0.5, 0.7, 0.55));
    const loT = std.mul(tiltM, d.vec2f(Lo.y, Lo.z));
    Lo = d.vec3f(Lo.x, loT.x, loT.y);
    const loS = std.mul(spinM, d.vec2f(Lo.x, Lo.z));
    Lo = d.vec3f(loS.x, Lo.y, loS.y);
    let Vo = d.vec3f(0, 0, 1);
    const voT = std.mul(tiltM, d.vec2f(Vo.y, Vo.z));
    Vo = d.vec3f(Vo.x, voT.x, voT.y);
    const voS = std.mul(spinM, d.vec2f(Vo.x, Vo.z));
    Vo = d.vec3f(voS.x, Vo.y, voS.y);

    const sgn = d.vec3f(
      std.select(-1, 1, rd.x >= 0),
      std.select(-1, 1, rd.y >= 0),
      std.select(-1, 1, rd.z >= 0)
    );
    rd = std.normalize(sgn.mul(std.max(std.abs(rd), d.vec3f(1e-4))));

    const b = std.dot(rd, ro);
    const c = std.dot(ro, ro) - bound * bound;
    const disc = b * b - c;
    if (disc < 0) {
      return d.vec4f();
    }
    const sq = std.sqrt(disc);
    const p0 = ro.add(rd.mul(-b - sq + pitch * 0.001));
    const tSpan = 2 * sq;

    let vp = std.floor(p0.div(cell));
    const tDelta = cell.div(std.abs(rd));
    let tMax = vp.add(std.step(d.vec3f(), rd)).mul(cell).sub(p0).div(rd);

    let hitF = d.f32(0);
    let mask = d.vec3f(0, 0, 1);
    let tCur = d.f32(0);

    for (const _i of std.range(STEPS)) {
      if (lgSolid(vp.add(0.5).mul(cell), cell, gap) > 0.5) {
        hitF = 1;
        break;
      }
      if (tMax.x < tMax.y && tMax.x < tMax.z) {
        tCur = tMax.x;
        tMax = d.vec3f(tMax.x + tDelta.x, tMax.y, tMax.z);
        vp = d.vec3f(vp.x + sgn.x, vp.y, vp.z);
        mask = d.vec3f(1, 0, 0);
      } else if (tMax.y < tMax.z) {
        tCur = tMax.y;
        tMax = d.vec3f(tMax.x, tMax.y + tDelta.y, tMax.z);
        vp = d.vec3f(vp.x, vp.y + sgn.y, vp.z);
        mask = d.vec3f(0, 1, 0);
      } else {
        tCur = tMax.z;
        tMax = d.vec3f(tMax.x, tMax.y, tMax.z + tDelta.z);
        vp = d.vec3f(vp.x, vp.y, vp.z + sgn.z);
        mask = d.vec3f(0, 0, 1);
      }
      if (tCur > tSpan) {
        break;
      }
    }

    if (hitF < 0.5) {
      return d.vec4f();
    }

    const cc = vp.add(0.5).mul(cell);
    const r = std.length(cc);
    const dir = cc.div(std.max(r, 1e-4));
    const brick = lgBrick(vp);
    const n = mask.mul(sgn).mul(-1);
    const hp = p0.add(rd.mul(tCur));

    /*
     * Per-brick hash picks one of five plastic colours. The patch parameter
     * slides the pick toward a smooth field over the sphere: 0 is confetti,
     * 1 is moulded colour regions.
     */
    const cph = hash(brick.bid.xy.mul(1.37).add(brick.bid.z * 0.91));
    let rn =
      noise(dir.xy.mul(2.6).add(7)) * 0.5 +
      noise(dir.yz.mul(2.6).add(13)) * 0.5;
    rn = std.clamp(0.5 + (rn - 0.5) * 2.2, 0, 0.999);
    const idx = std.floor(
      std.clamp(std.mix(cph, rn, std.clamp(u.p_patch, 0, 1)), 0, 0.999) * 5
    );
    let albedo = std.select(
      std.select(
        std.select(
          std.select(u.c_brickE, u.c_brickD, idx < 3.5),
          u.c_brickC,
          idx < 2.5
        ),
        u.c_brickB,
        idx < 1.5
      ),
      u.c_brickA,
      idx < 0.5
    );
    albedo = albedo.mul(
      0.93 + 0.14 * hash(brick.bid.xy.mul(0.53).add(brick.bid.z * 1.7))
    );

    /*
     * Seams: distance to the nearest BRICK boundary along each lattice axis.
     * Only the two axes tangent to the struck face draw.
     */
    const sp = hp.div(cell);
    const lcC = std.select(sp.z, sp.x, brick.orient < 0.5);
    const scC = std.select(sp.x, sp.z, brick.orient < 0.5);
    const u4 = std.fract((lcC + brick.off) / 4);
    const v2 = std.fract(scC / 2);
    const wY = std.fract(sp.y);
    const dL = std.min(u4, 1 - u4) * 4 * pitch;
    const dS = std.min(v2, 1 - v2) * 2 * pitch;
    const dY = std.min(wY, 1 - wY) * cell.y;
    let seamD = d.f32(0);
    if (mask.y > 0.5) {
      seamD = std.min(dL, dS);
    } else if (mask.x > 0.5) {
      seamD = std.min(dY, std.select(dL, dS, brick.orient < 0.5));
    } else {
      seamD = std.min(dY, std.select(dS, dL, brick.orient < 0.5));
    }
    const seam =
      (1 - std.smoothstep(0, 0.07 * pitch, seamD)) * std.clamp(u.p_seam, 0, 1);

    let nEff = d.vec3f(n);
    let studF = d.f32(0);
    let shadowF = d.f32(0);
    let engrave = d.f32(0);
    const studAmt = std.clamp(u.p_stud, 0, 1);
    if (mask.y > 0.5 && n.y > 0.5) {
      const cuv = std.fract(hp.xz.div(pitch)).sub(0.5);
      const sd = std.length(cuv);
      const rim =
        std.smoothstep(0.14, 0.29, sd) * (1 - std.smoothstep(0.29, 0.335, sd));
      const tiltN = std.normalize(d.vec3f(cuv.x, 0.42, cuv.y));
      nEff = std.normalize(std.mix(n, tiltN, rim * studAmt));
      studF = 1 - std.smoothstep(0.285, 0.33, sd);
      const lxz = std.normalize(Lo.xz.add(d.vec2f(1e-5)));
      const away = std.clamp(
        std.dot(std.normalize(cuv.add(d.vec2f(1e-5))), lxz.mul(-1)),
        0,
        1
      );
      shadowF =
        std.smoothstep(0.47, 0.335, sd) * (1 - studF) * (0.35 + 0.65 * away);
      engrave =
        std.smoothstep(0.11, 0.135, sd) *
        (1 - std.smoothstep(0.155, 0.18, sd)) *
        studF;
    }

    const lam = std.clamp(std.dot(nEff, Lo), 0, 1);
    const wrap = std.clamp(std.dot(dir, Lo) * 0.5 + 0.5, 0, 1);
    const depthDim = std.mix(1, 0.55, std.clamp((1 - r) / (3 * cell.y), 0, 1));
    const shade = (0.34 + 0.42 * wrap * wrap + 0.8 * lam * lightNow) * depthDim;

    let col = albedo.mul(shade).mul(1 + 0.1 * studF);
    col = col.mul(1 - shadowF * 0.38 * studAmt);
    col = col.mul(1 - engrave * 0.14 * studAmt);

    const bevel =
      std.smoothstep(0.05 * pitch, 0.085 * pitch, seamD) *
      (1 - std.smoothstep(0.085 * pitch, 0.16 * pitch, seamD));
    col = col.add(
      albedo.mul(bevel * (0.18 + 0.5 * lam) * std.clamp(u.p_seam, 0, 1))
    );
    col = col.mul(1 - seam * 0.8);

    const ndh = std.clamp(std.dot(nEff, std.normalize(Lo.add(Vo))), 0, 1);
    const spec = std.pow(ndh, 48) + 0.22 * std.pow(ndh, 8);
    col = col.add(d.vec3f(1).mul(spec * glossNow * (1 - seam) * depthDim));

    col = col.mul(gainNow);
    col = std.pow(std.max(col, d.vec3f()), d.vec3f(u.p_contrast));

    return d.vec4f(col, 1);
  })
  .$name("orb12Fragment");

export const orb12Shader = tgpu.resolve([orb12Fragment]);

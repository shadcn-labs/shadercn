import { d, std, tgpu } from "typegpu";

/*
 * Shader by XorDev (https://x.com/XorDev), ported for Orbkit with the author's
 * permission. Non-commercial use only, with attribution to XorDev; keep this
 * notice with the file. shadercn's runtime (renderer.ts) is MIT-licensed.
 */

const STEPS = 160;

const Params = d.struct({
  anim: d.f32,
  c_dirt: d.vec3f,
  c_grass: d.vec3f,
  c_lava: d.vec3f,
  c_leaf: d.vec3f,
  c_ore: d.vec3f,
  c_sand: d.vec3f,
  c_stone: d.vec3f,
  c_water: d.vec3f,
  inputVol: d.f32,
  mouse: d.vec2f,
  outputVol: d.f32,
  p_blocks: d.f32,
  p_cave: d.f32,
  p_contrast: d.f32,
  p_core: d.f32,
  p_drift: d.f32,
  p_gain: d.f32,
  p_glow: d.f32,
  p_light: d.f32,
  p_ore: d.f32,
  p_radius: d.f32,
  p_rough: d.f32,
  p_scale: d.f32,
  p_sea: d.f32,
  p_season: d.f32,
  p_shuffle: d.f32,
  p_spin: d.f32,
  p_texture: d.f32,
  p_tilt: d.f32,
  p_trees: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: Params },
  })
  .$idx(0);

const World = d.struct({
  cherry: d.f32,
  clim: d.vec4f,
  drift: d.vec3f,
  maxH: d.f32,
  seaN: d.f32,
  treeMul: d.f32,
  vs: d.f32,
});

const TreeCell = d.struct({
  dir: d.vec3f,
  h1: d.f32,
  h2: d.f32,
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

// Seam-free noise on the direction sphere: tri-planar sum of 2D value noise,
// range-stretched and clamped so the terrain bound stays a true bound.
const ckN3 = tgpu.fn(
  [d.vec3f],
  d.f32
)((p) => {
  "use gpu";
  const v = (noise(p.xy) + noise(p.yz.add(19.1)) + noise(p.zx.add(47.3))) / 3;
  return std.clamp(0.5 + (v - 0.5) * 1.9, 0, 1);
});

// The raw terrain field for a surface direction, 0..1. Two octaves only —
// the voxel grid quantizes away anything finer.
const ckField = tgpu.fn(
  [d.vec3f, World],
  d.f32
)((dir, world) => {
  "use gpu";
  const u = layout.$.params;
  const q = dir.mul(u.p_scale).add(world.drift);
  return ckN3(q) * 0.65 + ckN3(q.mul(2.6).add(31.7)) * 0.35;
});

// Local terrain radius. Relief is strictly ADDITIVE above the unit sphere:
// oceans and plains sit exactly on it, mountains climb from the shoreline.
const ckTerrain = tgpu.fn(
  [d.vec3f, World],
  d.f32
)((dir, world) => {
  "use gpu";
  const u = layout.$.params;
  const h =
    1 +
    u.p_rough *
      std.max(ckField(dir, world) - world.seaN, 0) *
      1.2 *
      (1 + world.clim.w * 0.8);
  const stepH = 3 * world.vs;
  const hq = 1 + std.floor((h - 1) / stepH) * stepH;
  return std.mix(h, hq, world.clim.w * 0.85);
});

// Continent-scale biome field: below 0.3 desert, above 0.58 forest.
const ckBiome = tgpu.fn(
  [d.vec3f, World],
  d.f32
)((dir, world) => ckN3(dir.mul(1.3).add(world.drift).add(57.9)));

/*
 * Which tree cell does this direction fall in? The direction is projected
 * onto its dominant cube face and quantized there — every voxel along a
 * radial line lands in the same cell, which is what keeps a tree's trunk
 * and canopy agreeing across grid levels.
 */
const ckTreeCell = tgpu.fn(
  [d.vec3f],
  TreeCell
)((dir) => {
  "use gpu";
  const u = layout.$.params;
  const ad = std.abs(dir);
  let fuv = d.vec2f();
  let face = d.f32();
  if (ad.x >= ad.y && ad.x >= ad.z) {
    fuv = dir.yz.div(ad.x);
    face = std.select(1, 0, dir.x > 0);
  } else if (ad.y >= ad.z) {
    fuv = dir.xz.div(ad.y);
    face = std.select(3, 2, dir.y > 0);
  } else {
    fuv = dir.xy.div(ad.z);
    face = std.select(5, 4, dir.z > 0);
  }
  const grid = std.max(u.p_blocks / 6, 2);
  const cell = std.floor(fuv.mul(0.5).add(0.5).mul(grid));
  const h1 = hash(cell.mul(1.17).add(face * 19.3));
  const h2 = hash(cell.mul(0.71).add(face * 7.7 + 9.3));
  const jit = d
    .vec2f(hash(cell.add(7.1 + face)), hash(cell.add(13.7 + face)))
    .sub(0.5);
  const auv = cell.add(0.5).add(jit.mul(0.3)).div(grid).mul(2).sub(1);
  let cp = d.vec3f();
  if (face < 1.5) {
    cp = d.vec3f(std.select(-1, 1, face < 0.5), auv.x, auv.y);
  } else if (face < 3.5) {
    cp = d.vec3f(auv.x, std.select(-1, 1, face < 2.5), auv.y);
  } else {
    cp = d.vec3f(auv.x, auv.y, std.select(-1, 1, face < 4.5));
  }
  return TreeCell({
    dir: std.normalize(cp),
    h1,
    h2,
  });
});

/*
 * Check tree material at a position based on climate type.
 * Returns: 0 = no tree, 2 = trunk, 3 = leaves
 */
const ckTreeMaterial = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32, d.f32, d.f32, d.f32, World],
  d.f32
)((cc, treeDir, h2, r, ha, lat, world) => {
  "use gpu";

  if (world.clim.z > 0.5) {
    // ICE SPIKES: tapering packed-ice spires
    const spikeH = (2 + 6 * h2 * h2) * world.vs;
    const w = std.mix(1.15, 0.3, std.clamp((r - ha) / spikeH, 0, 1)) * world.vs;
    if (lat < w && r > ha - world.vs && r < ha + spikeH) {
      return d.f32(3);
    }
  } else if (world.clim.w > 0.5) {
    // CACTI: short green columns
    const cacH = (1.5 + 2 * h2) * world.vs;
    if (lat < 0.6 * world.vs && r > ha - world.vs && r < ha + cacH) {
      return d.f32(3);
    }
  } else if (world.cherry > 0.5) {
    // CHERRY GROVE: broad flat blossom puffs on short dark trunks
    const trunkTop = ha + (2 + 1.5 * h2) * world.vs;
    if (lat < 0.75 * world.vs && r > ha - world.vs && r < trunkTop) {
      return d.f32(2);
    }
    let dd = cc.sub(treeDir.mul(trunkTop + 0.6 * world.vs));
    dd = dd.add(treeDir.mul(std.dot(dd, treeDir) * 0.8));
    const lv = std.floor(cc.div(world.vs));
    const rag = hash(lv.xy.mul(0.61).add(lv.z * 2.23));
    if (std.length(dd) < (2.2 + 0.5 * rag) * world.vs) {
      return d.f32(3);
    }
  } else {
    // DEFAULT: tall trees with trunks and canopies
    const trunkTop = ha + (2.5 + 2 * h2) * world.vs;
    if (lat < 0.75 * world.vs && r > ha - world.vs && r < trunkTop) {
      return d.f32(2);
    }
    const dd = cc.sub(treeDir.mul(trunkTop + 0.7 * world.vs));
    const lv = std.floor(cc.div(world.vs));
    const rag = hash(lv.xy.mul(0.61).add(lv.z * 2.23));
    if (std.length(dd) < (1.7 + 0.5 * rag) * world.vs) {
      return d.f32(3);
    }
  }

  return d.f32();
});

/*
 * The world function: what fills this voxel?
 *   0 air   1 ground   2 trunk   3 leaves
 * Ground is the terrain sphere; caves are carved ONLY where the ground has
 * risen above the base sphere, so the smooth lowlands stay pristine.
 */
const ckVoxel = tgpu.fn(
  [d.vec3f, World],
  d.f32
)((cc, world) => {
  "use gpu";
  const u = layout.$.params;
  const r = std.length(cc);
  const dir = cc.div(std.max(r, 1e-4));

  // ground: terrain sphere with caves
  if (r < world.maxH) {
    const h = ckTerrain(dir, world);
    if (r < h) {
      // carve caves into risen ground only
      if (h > 1 + 1.5 * world.vs) {
        const cv = ckN3(cc.mul(u.p_scale * 1.9).add(71.3));
        const cw =
          u.p_cave * 0.16 * std.smoothstep(world.maxH, world.maxH - 0.45, r);
        if (std.abs(cv - 0.5) < cw) {
          return d.f32();
        }
      }
      return d.f32(1);
    }
  }

  // trees: thin shell above terrain
  if (r >= world.maxH + 8 * world.vs || u.p_trees <= 0.001) {
    return d.f32();
  }

  const tree = ckTreeCell(dir);
  const thrMax = std.clamp(u.p_trees, 0, 1) * 0.8;
  if (tree.h1 <= 1 - thrMax) {
    return d.f32();
  }

  const bioA = ckBiome(tree.dir, world);
  let dens = std.select(std.select(0, 0.25, bioA > 0.3), 1, bioA > 0.58);
  dens *= world.treeMul;
  if (tree.h1 <= 1 - thrMax * dens) {
    return d.f32();
  }

  const fA = ckField(tree.dir, world);
  const ha = 1 + u.p_rough * std.max(fA - world.seaN, 0) * 1.2;
  // dry land only, below the stone tree line
  if (fA <= world.seaN + 0.015 || ha >= 1 + u.p_rough * 0.42) {
    return d.f32();
  }

  const lat = std.length(cc.sub(tree.dir.mul(std.dot(cc, tree.dir))));
  return ckTreeMaterial(cc, tree.dir, tree.h2, r, ha, lat, world);
});

const orb24Fragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;
    const fragCoord = input.uv.mul(u.res);
    const orbUv = fragCoord.mul(2).sub(u.res).div(std.min(u.res.x, u.res.y));

    const glowNow = u.p_glow * (0.7 + 1 * u.outputVol);
    const gainNow = u.p_gain * (0.9 + 0.3 * u.outputVol);
    const lightNow = u.p_light * (1 + 0.3 * u.inputVol);

    const drift = d.vec3f(
      u.p_drift * 0.31,
      u.p_drift * 0.17,
      -u.p_drift * 0.23
    );

    /*
     * CLIMATE: the integrated season clock carries the planet through four
     * worlds — lush, desert, ice, mesa — on a cycle. The triangular weights
     * overlap so exactly two adjacent climates crossfade at any moment.
     * Five worlds in crossfade order: lush, cherry, ice, mesa, desert.
     */
    const t5 = std.fract(u.p_season * 0.05) * 5;
    const clim = d.vec4f(
      std.clamp(1 - std.min(std.abs(t5), std.abs(t5 - 5)), 0, 1),
      std.clamp(1 - std.abs(t5 - 4), 0, 1),
      std.clamp(1 - std.abs(t5 - 2), 0, 1),
      std.clamp(1 - std.abs(t5 - 3), 0, 1)
    );
    const cherry = std.clamp(1 - std.abs(t5 - 1), 0, 1);
    const treeMul = std.dot(clim, d.vec4f(1, 0.15, 0.9, 0.3)) + cherry * 0.9;

    const vs = 2 / std.clamp(u.p_blocks, 8, 96);
    const seaN = 0.25 + std.clamp(u.p_sea, 0, 1) * 0.5;
    const maxH = 1 + u.p_rough * (1 - seaN) * 1.2 * 1.8 + 0.001;
    const bound = maxH + 8.5 * vs;

    const world = World({
      cherry,
      clim,
      drift,
      maxH,
      seaN,
      treeMul,
      vs,
    });

    const duv = orbUv.div(u.p_radius);

    // orthographic camera, viewport sized to the bound so the treetops fit
    let ro = d.vec3f(duv.x * bound, duv.y * bound, 2.9);
    let rd = d.vec3f(0, 0, -1);

    // rotate the RAY into object space (inverse tumble) — the grid stays
    // axis-aligned, the planet appears to spin. The light rotates along.
    const tiltM = rot2(u.p_tilt);
    const spinM = rot2(-u.p_spin);
    const roYZ = std.mul(tiltM, d.vec2f(ro.y, ro.z));
    ro = d.vec3f(ro.x, roYZ.x, roYZ.y);
    const roXZ = std.mul(spinM, d.vec2f(ro.x, ro.z));
    ro = d.vec3f(roXZ.x, ro.y, roXZ.y);
    const rdYZ = std.mul(tiltM, d.vec2f(rd.y, rd.z));
    rd = d.vec3f(rd.x, rdYZ.x, rdYZ.y);
    const rdXZ = std.mul(spinM, d.vec2f(rd.x, rd.z));
    rd = d.vec3f(rdXZ.x, rd.y, rdXZ.y);
    let Lo = std.normalize(d.vec3f(-0.5, 0.7, 0.55));
    const loYZ = std.mul(tiltM, d.vec2f(Lo.y, Lo.z));
    Lo = d.vec3f(Lo.x, loYZ.x, loYZ.y);
    const loXZ = std.mul(spinM, d.vec2f(Lo.x, Lo.z));
    Lo = d.vec3f(loXZ.x, Lo.y, loXZ.y);

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
    const p0 = ro.add(rd.mul(-b - sq + vs * 0.001));
    const tSpan = 2 * sq;

    // Amanatides & Woo init
    let vp = std.floor(p0.div(vs));
    const tDelta = d.vec3f(vs).div(std.abs(rd));
    let tMax = vp.add(std.step(d.vec3f(), rd)).mul(vs).sub(p0).div(rd);

    let mat = d.f32();
    let mask = d.vec3f(0, 0, 1);
    let tCur = d.f32();

    for (const _i of std.range(STEPS)) {
      const m = ckVoxel(vp.add(0.5).mul(vs), world);
      if (m > 0.5) {
        mat = m;
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

    if (mat < 0.5) {
      return d.vec4f();
    }

    const cc = vp.add(0.5).mul(vs);
    const r = std.length(cc);
    const dir = cc.div(std.max(r, 1e-4));
    const n = mask.mul(sgn).mul(-1);
    const hp = p0.add(rd.mul(tCur));

    const vseed = d.vec2f(
      std.dot(vp, d.vec3f(1, 57, 113)),
      std.dot(vp, d.vec3f(27, 7, 91))
    );
    const h1 = hash(vseed.mul(0.013));
    const h2 = hash(vseed.mul(0.029).add(5.7));

    let uvFace = d.vec2f();
    if (mask.x > 0.5) {
      uvFace = hp.yz;
    } else if (mask.y > 0.5) {
      uvFace = hp.xz;
    } else {
      uvFace = hp.xy;
    }
    const grain = hash(
      std
        .floor(std.fract(uvFace.div(vs)).mul(4))
        .mul(0.37)
        .add(vseed.mul(0.11))
    );
    let texMul = std.mix(1, 0.72 + 0.55 * grain, u.p_texture);

    const lam = std.clamp(std.dot(n, Lo), 0, 1);
    const wrap = std.clamp(std.dot(dir, Lo) * 0.5 + 0.5, 0, 1);
    const ao = 0.55 + 0.45 * std.clamp(std.dot(n, dir) * 0.5 + 0.5, 0, 1);
    const shade = (0.32 + 0.5 * wrap * wrap + 0.85 * lam * lightNow) * ao;

    let col = d.vec3f();
    if (mat < 1.5) {
      const f = ckField(dir, world);
      const h = 1 + u.p_rough * std.max(f - seaN, 0) * 1.2;
      const depth = h - r;
      const topF = std.step(depth, vs * 1.15);

      const snow = d.vec3f(0.92, 0.95, 1);
      const layer = hash(d.vec2f(std.floor(r / (vs * 2)) * 0.371, 5.3));
      const mesaBand = std.select(
        std.select(
          std.select(
            std.select(
              d.vec3f(0.4, 0.25, 0.18),
              d.vec3f(0.84, 0.65, 0.27),
              layer < 0.9
            ),
            d.vec3f(0.88, 0.79, 0.67),
            layer < 0.8
          ),
          d.vec3f(0.63, 0.26, 0.15),
          layer < 0.68
        ),
        d.vec3f(0.74, 0.42, 0.21),
        layer < 0.5
      );
      const mesaTop = std.mix(
        d.vec3f(0.72, 0.38, 0.2),
        mesaBand,
        std.step(1 + u.p_rough * 0.1, h)
      );
      const climGrass = u.c_grass
        .mul(clim.x)
        .add(u.c_sand.mul(clim.y))
        .add(snow.mul(clim.z))
        .add(mesaTop.mul(clim.w))
        .add(std.mix(u.c_grass, d.vec3f(0.62, 0.85, 0.3), 0.6).mul(cherry));
      const climDirt = u.c_dirt
        .mul(clim.x + clim.y + cherry)
        .add(u.c_dirt.mul(d.vec3f(0.75, 0.85, 1.05)).mul(clim.z))
        .add(mesaBand.mul(clim.w));
      const climSand = u.c_sand
        .mul(clim.x + clim.y + cherry)
        .add(std.mix(u.c_sand, snow, 0.9).mul(clim.z))
        .add(d.vec3f(0.72, 0.35, 0.2).mul(clim.w));
      const climWater = u.c_water
        .mul(clim.x + clim.y + cherry)
        .add(d.vec3f(0.62, 0.82, 0.92).mul(clim.z))
        .add(std.mix(u.c_water, d.vec3f(0.42, 0.3, 0.22), 0.4).mul(clim.w));

      if (topF > 0.5 && f < seaN) {
        const deep = std.clamp((seaN - f) / 0.12, 0, 1) * (1 - 0.55 * clim.z);
        const wc = climWater.mul(std.mix(1.3, 0.55, deep));
        let shim =
          0.85 + 0.25 * std.sin(u.anim * 2.5 + grain * 6.2831 + dir.x * 4);
        shim = std.mix(shim, 1.02, clim.z);
        col = wc
          .mul(0.45 + 0.55 * wrap)
          .mul(shim)
          .add(wc.mul(lam * 0.35));
      } else {
        const dirtF = std.step(depth, vs * 2.4);
        const up = std.clamp(std.dot(n, dir), 0, 1);

        let albedo = std.mix(u.c_stone, climDirt, dirtF);
        albedo = std.mix(
          albedo,
          u.c_stone,
          dirtF * (1 - topF) * std.step(h2, 0.3)
        );

        const bio = ckBiome(dir, world);
        const desertF = std.step(bio, 0.3);
        albedo = std.mix(
          albedo,
          climGrass,
          topF * std.step(0.45, up) * (1 - desertF)
        );
        albedo = std.mix(albedo, climSand, desertF * dirtF);
        albedo = std.mix(
          albedo,
          climDirt,
          topF * std.step(1 + u.p_rough * 0.28, h) * 0.85 * (1 - 0.9 * clim.z)
        );
        albedo = std.mix(
          albedo,
          u.c_stone,
          topF * std.step(1 + u.p_rough * 0.45, h) * (1 - 0.85 * clim.z)
        );
        albedo = std.mix(
          albedo,
          climSand,
          topF * std.step(std.abs(f - seaN - 0.017), 0.018)
        );

        const oc = std.floor(cc.div(2.5 * vs));
        const oseed = d.vec2f(
          std.dot(oc, d.vec3f(1, 57, 113)),
          std.dot(oc, d.vec3f(27, 7, 91))
        );
        const fleck = std.step(
          0.5,
          hash(
            std
              .floor(std.fract(uvFace.div(vs)).mul(4))
              .mul(0.53)
              .add(oseed.mul(0.19))
          )
        );

        const icePatch =
          clim.z *
          std.step(hash(oseed.mul(0.023).add(9.1)), 0.5) *
          std.step(1 + u.p_rough * 0.06, h);
        albedo = std.mix(
          albedo,
          d.vec3f(0.55, 0.7, 0.92),
          icePatch * (0.45 + 0.4 * fleck)
        );

        const veinF =
          (1 - dirtF) *
          std.step(1 - u.p_ore, hash(oseed.mul(0.017))) *
          std.step(h1, 0.8);
        const oreType = hash(oseed.mul(0.041).add(2.9));
        const oreHue = std.select(
          std.select(
            d.vec3f(0.16),
            u.c_ore.mul(d.vec3f(0.25, 0.45, 1.2)),
            oreType < 0.75
          ),
          u.c_ore,
          oreType < 0.4
        );
        const oreLit = std.select(0, 1, oreType < 0.75);
        albedo = std.mix(albedo, oreHue, veinF * (0.2 + 0.65 * fleck));
        const twinkle =
          0.55 + 0.45 * std.sin(u.p_shuffle + hash(oseed.mul(0.013)) * 37);

        const depthDim = std.mix(
          1,
          0.62,
          std.clamp(depth / std.max(u.p_rough * 0.9, 0.05), 0, 1)
        );

        const coreR = 1 - u.p_rough * 0.6;
        const coreF = u.p_core * std.smoothstep(coreR + 0.15, coreR - 0.05, r);

        const emis = oreHue
          .mul(veinF * fleck * oreLit * glowNow * twinkle)
          .add(
            u.c_lava
              .mul(coreF * (0.9 + 0.4 * std.sin(u.p_shuffle * 1.6 + h1 * 51)))
              .mul(0.6 + 1.4 * u.outputVol)
          );

        col = albedo.mul(shade * depthDim).add(emis);
      }
    } else if (mat < 2.5) {
      col = u.c_dirt.mul(0.5 * shade);
    } else {
      const climLeaf = u.c_leaf
        .mul(clim.x + clim.y * 0.9)
        .add(d.vec3f(0.62, 0.76, 0.95).mul(clim.z))
        .add(std.mix(u.c_leaf, d.vec3f(0.45, 0.62, 0.25), 0.5).mul(clim.w))
        .add(d.vec3f(0.93, 0.7, 0.82).mul(cherry));
      col = climLeaf.mul(shade);
      const leafGrain = std.mix(0.5 + 0.9 * grain, 0.85 + 0.3 * grain, clim.z);
      texMul = std.mix(1, leafGrain, u.p_texture);
    }

    col = col.mul(texMul * gainNow);
    col = std.pow(std.max(col, d.vec3f()), d.vec3f(u.p_contrast));

    return d.vec4f(col, 1);
  })
  .$name("orb24Fragment");

export const orb24Shader = tgpu.resolve([orb24Fragment]);

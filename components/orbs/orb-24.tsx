"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const CHUNK_FRAG = `
const STEPS: i32 = 160;
// Per-fragment state, resolved once in main() before the march.
var<private> ckDrift: vec3f;
var<private> ckVs: f32;
var<private> ckMaxH: f32;
var<private> ckSeaN: f32;
// Climate weights (lush, desert, ice, mesa) plus the cherry grove — a
// partition of unity driven by the integrated season clock — and the tree
// density they imply.
var<private> ckClim: vec4f;
var<private> ckCherry: f32;
var<private> ckTreeMul: f32;

// Tree-cell lookup results (GLSL ES 1.0 has no out-struct ergonomics).
var<private> ckTreeDir: vec3f;
var<private> ckTreeH1: f32;
var<private> ckTreeH2: f32;

fn ckRot(a: f32) -> mat2x2f {
  var c: f32 =cos(a);
  var s: f32 =sin(a);
  return mat2x2f(vec2f(c, -s), vec2f(s, c));
}

// Seam-free noise on the direction sphere: tri-planar sum of the prelude's
// 2D value noise, range-stretched (see the header) and clamped so the
// terrain bound stays a true bound.
fn ckN3(p: vec3f) -> f32 {
  var v: f32 =(noise(p.xy) + noise(p.yz + 19.1) + noise(p.zx + 47.3)) / 3.0;
  return clamp(0.5 + (v - 0.5) * 1.9, 0.0, 1.0);
}

// The raw terrain field for a surface direction, 0..1. Two octaves only —
// the voxel grid quantizes away anything finer.
fn ckField(dir: vec3f) -> f32 {
  var q: vec3f = dir * uP_scale + ckDrift;
  return ckN3(q) * 0.65 + ckN3(q * 2.6 + 31.7) * 0.35;
}

// Local terrain radius. Relief is strictly ADDITIVE above the unit sphere:
// oceans and plains sit exactly on it, mountains climb from the shoreline.
// Under the mesa climate the relief terraces into three-block steps —
// flat-topped buttes and benches, the badlands profile.
fn ckTerrain(dir: vec3f) -> f32 {
  // the mesa amplifies its relief into big banded towers
  var h: f32 =1.0 + uP_rough * max(ckField(dir) - ckSeaN, 0.0) * 1.2
    * (1.0 + ckClim.w * 0.8);
  var stepH: f32 =3.0 * ckVs;
  var hq: f32 =1.0 + floor((h - 1.0) / stepH) * stepH;
  return mix(h, hq, ckClim.w * 0.85);
}

// The continent-scale biome field: below 0.3 desert, above 0.58 forest,
// plains between. Drifts with the terrain so biomes move with their land.
fn ckBiome(dir: vec3f) -> f32 {
  return ckN3(dir * 1.3 + ckDrift + 57.9);
}

/*
  Which tree cell does this direction fall in? The direction is projected
  onto its dominant cube face and quantized there — every voxel along a
  radial line lands in the same cell, which is what keeps a tree's trunk
  and canopy agreeing across grid levels. The anchor direction is rebuilt
  from the jittered cell centre.
*/
fn ckTreeCell(dir: vec3f) {
  var ad: vec3f = abs(dir);
  var fuv: vec2f;
  var face: f32;
  if (ad.x >= ad.y && ad.x >= ad.z) {
    fuv = dir.yz / ad.x;
    face = select(1.0, 0.0, dir.x > 0.0);
  } else if (ad.y >= ad.z) {
    fuv = dir.xz / ad.y;
    face = select(3.0, 2.0, dir.y > 0.0);
  } else {
    fuv = dir.xy / ad.z;
    face = select(5.0, 4.0, dir.z > 0.0);
  }
  var grid: f32 =max(uP_blocks / 6.0, 2.0);
  var cell: vec2f = floor((fuv * 0.5 + 0.5) * grid);
  ckTreeH1 = hash(cell * 1.17 + face * 19.3);
  ckTreeH2 = hash(cell * 0.71 + face * 7.7 + 9.3);
  var jit: vec2f = vec2f(hash(cell + 7.1 + face), hash(cell + 13.7 + face)) - 0.5;
  var auv: vec2f = ((cell + 0.5 + jit * 0.3) / grid) * 2.0 - 1.0;
  var cp: vec3f;
  if (face < 1.5) { cp = vec3f(select(-1.0, 1.0, face < 0.5), auv.x, auv.y); }
  else if (face < 3.5) { cp = vec3f(auv.x, select(-1.0, 1.0, face < 2.5), auv.y); }
  else { cp = vec3f(auv.x, auv.y, select(-1.0, 1.0, face < 4.5)); }
  ckTreeDir = normalize(cp);
}

/*
  The world function: what fills this voxel?
    0 air   1 ground   2 trunk   3 leaves
  Ground is the terrain sphere; caves are carved ONLY where the ground has
  risen above the base sphere, so the smooth lowlands stay pristine. Water
  is not a voxel here — ocean surface blocks are painted as water in the
  material pass. Trees grow radially from dry anchors below the tree line,
  dense where the biome says forest.
*/
fn ckVoxel(cc: vec3f) -> f32 {
  var r: f32 =length(cc);
  var dir: vec3f = cc / max(r, 1.0e-4);
  if (r < ckMaxH) {
    var h: f32 =ckTerrain(dir);
    if (r < h) {
      // carve caves into risen ground only — mountainsides get entrances,
      // the perfect lowland sphere keeps its silhouette
      if (h > 1.0 + 1.5 * ckVs) {
        var cv: f32 =ckN3(cc * (uP_scale * 1.9) + 71.3);
        var cw: f32 =uP_cave * 0.16 * smoothstep(ckMaxH, ckMaxH - 0.45, r);
        if (abs(cv - 0.5) < cw) { return 0.0; }
      }
      return 1.0;
    }
  }
  // trees live in a thin shell above the tallest terrain
  if (r < ckMaxH + 8.0 * ckVs && uP_trees > 0.001) {
    ckTreeCell(dir);
    var thrMax: f32 =clamp(uP_trees, 0.0, 1.0) * 0.8;
    if (ckTreeH1 > 1.0 - thrMax) {
      // forest density comes from the biome at the ANCHOR, so a whole
      // tree agrees with itself about existing
      var bioA: f32 =ckBiome(ckTreeDir);
      var dens: f32 =select(select(0.0, 0.25, bioA > 0.3), 1.0, bioA > 0.58);
      dens *= ckTreeMul; // forests thin out under desert, ice and mesa skies
      if (ckTreeH1 > 1.0 - thrMax * dens) {
        var fA: f32 =ckField(ckTreeDir);
        var ha: f32 =1.0 + uP_rough * max(fA - ckSeaN, 0.0) * 1.2;
        // dry land only, below the stone tree line
        if (fA > ckSeaN + 0.015 && ha < 1.0 + uP_rough * 0.42) {
          var lat: f32 =length(cc - dot(cc, ckTreeDir) * ckTreeDir);
          if (ckClim.z > 0.5) {
            // ICE SPIKES: the lattice grows tapering packed-ice spires in
            // place of trees. Squaring the height hash makes many stubs
            // and a few tall spires, the ice-plains skyline.
            var spikeH: f32 =(2.0 + 6.0 * ckTreeH2 * ckTreeH2) * ckVs;
            var w: f32 =mix(1.15, 0.3, clamp((r - ha) / spikeH, 0.0, 1.0)) * ckVs;
            if (lat < w && r > ha - ckVs && r < ha + spikeH) { return 3.0; }
          } else if (ckClim.w > 0.5) {
            // CACTI: short green columns dotting the badlands flats
            var cacH: f32 =(1.5 + 2.0 * ckTreeH2) * ckVs;
            if (lat < 0.6 * ckVs && r > ha - ckVs && r < ha + cacH) { return 3.0; }
          } else if (ckCherry > 0.5) {
            // CHERRY GROVE: broad flat blossom puffs on short dark trunks —
            // the radial component of the canopy test is stretched, which
            // squashes the puff wide and flat like the cherry grove trees
            var trunkTop: f32 =ha + (2.0 + 1.5 * ckTreeH2) * ckVs;
            if (lat < 0.75 * ckVs && r > ha - ckVs && r < trunkTop) { return 2.0; }
            var dd: vec3f = cc - ckTreeDir * (trunkTop + 0.6 * ckVs);
            dd += ckTreeDir * dot(dd, ckTreeDir) * 0.8;
            var lv: vec3f = floor(cc / ckVs);
            var rag: f32 =hash(lv.xy * 0.61 + lv.z * 2.23);
            if (length(dd) < (2.2 + 0.5 * rag) * ckVs) { return 3.0; }
          } else {
            var trunkTop: f32 =ha + (2.5 + 2.0 * ckTreeH2) * ckVs;
            if (lat < 0.75 * ckVs && r > ha - ckVs && r < trunkTop) { return 2.0; }
            var dd: vec3f = cc - ckTreeDir * (trunkTop + 0.7 * ckVs);
            // canopy radius re-hashed per voxel — ragged blocky foliage
            var lv: vec3f = floor(cc / ckVs);
            var rag: f32 =hash(lv.xy * 0.61 + lv.z * 2.23);
            if (length(dd) < (1.7 + 0.5 * rag) * ckVs) { return 3.0; }
          }
        }
      }
    }
  }
  return 0.0;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: agent output stokes the glow, the gain and the molten
  // core; user input brightens the key light.
  var glowNow: f32 =uP_glow * (0.7 + 1.0 * uOutput);
  var gainNow: f32 =uP_gain * (0.9 + 0.3 * uOutput);
  var lightNow: f32 =uP_light * (1.0 + 0.3 * uInput);

  // the terrain field drifts on its own integrated clock — in the thinking
  // state it streams, and blocks pop in and out like chunks loading
  ckDrift = vec3f(uP_drift * 0.31, uP_drift * 0.17, -uP_drift * 0.23);

  /*
    CLIMATE: the integrated season clock carries the planet through four
    worlds — lush, desert, ice, mesa — on a cycle. The triangular weights
    overlap so exactly two adjacent climates crossfade at any moment, and
    because the clock integrates, changing the season rate never snaps the
    phase: the world just weathers faster or slower.
  */
  // five worlds in crossfade order: lush, cherry, ice, mesa, desert —
  // blossom thaws into snow, terracotta dries into sand
  var t5: f32 =fract(uP_season * 0.05) * 5.0;
  ckClim = vec4f(
    clamp(1.0 - min(abs(t5), abs(t5 - 5.0)), 0.0, 1.0), // lush (wraps)
    clamp(1.0 - abs(t5 - 4.0), 0.0, 1.0),               // desert
    clamp(1.0 - abs(t5 - 2.0), 0.0, 1.0),               // ice
    clamp(1.0 - abs(t5 - 3.0), 0.0, 1.0)                // mesa
  );
  ckCherry = clamp(1.0 - abs(t5 - 1.0), 0.0, 1.0);      // cherry grove
  // ice and cherry run HIGH (dense spikes / dense groves); mesa keeps cacti
  ckTreeMul = dot(ckClim, vec4f(1.0, 0.15, 0.9, 0.3)) + ckCherry * 0.9;

  ckVs = 2.0 / clamp(uP_blocks, 8.0, 96.0);   // voxel size, planet radius 1
  // sea level in FIELD space: 0.5 puts about half the sphere under water
  ckSeaN = 0.25 + clamp(uP_sea, 0.0, 1.0) * 0.5;
  // tallest possible terrain — sized for the mesa's amplified towers so
  // the viewport holds steady while the seasons turn
  ckMaxH = 1.0 + uP_rough * (1.0 - ckSeaN) * 1.2 * 1.8 + 0.001;
  var bound: f32 =ckMaxH + 8.5 * ckVs;          // ...plus the tree shell

  var duv: vec2f = orbUV() / uP_radius;

  // orthographic camera, viewport sized to the bound so the treetops fit
  var ro: vec3f = vec3f(duv * bound, 2.9);
  var rd: vec3f = vec3f(0.0, 0.0, -1.0);

  // rotate the RAY into object space (inverse tumble) — the grid stays
  // axis-aligned, the planet appears to spin. The light rotates along,
  // keeping the sun fixed relative to the viewer.
  let tiltM: mat2x2f = ckRot(uP_tilt); // positive tilt looks DOWN at the north pole
  let spinM: mat2x2f = ckRot(-uP_spin); // integrated clock
  var roYZ: vec2f = tiltM * ro.yz;
  ro.y = roYZ.x;
  ro.z = roYZ.y;
  var roXZ: vec2f = spinM * ro.xz;
  ro.x = roXZ.x;
  ro.z = roXZ.y;
  var rdYZ: vec2f = tiltM * rd.yz;
  rd.y = rdYZ.x;
  rd.z = rdYZ.y;
  var rdXZ: vec2f = spinM * rd.xz;
  rd.x = rdXZ.x;
  rd.z = rdXZ.y;
  var Lo: vec3f = normalize(vec3f(-0.5, 0.7, 0.55));
  var loYZ: vec2f = tiltM * Lo.yz;
  Lo.y = loYZ.x;
  Lo.z = loYZ.y;
  var loXZ: vec2f = spinM * Lo.xz;
  Lo.x = loXZ.x;
  Lo.z = loXZ.y;

  // DDA needs nonzero direction components — nudge, keep the sign
  var sgn: vec3f = vec3f(
    select(-1.0, 1.0, rd.x >= 0.0),
    select(-1.0, 1.0, rd.y >= 0.0),
    select(-1.0, 1.0, rd.z >= 0.0)
  );
  rd = normalize(sgn * max(abs(rd), vec3f(1.0e-4)));

  // analytic bounding sphere: empty pixels exit here, and the march below
  // only ever walks the chord inside the bound
  var b: f32 =dot(rd, ro);
  var c: f32 =dot(ro, ro) - bound * bound;
  var disc: f32 =b * b - c;
  if (disc < 0.0) {
    return vec4f(0.0);
  }
  var sq: f32 =sqrt(disc);
  var p0: vec3f = ro + rd * (-b - sq + ckVs * 0.001);
  var tSpan: f32 =2.0 * sq;

  // Amanatides & Woo init: current voxel, per-axis distance to the next
  // grid plane, per-axis crossing stride
  var vp: vec3f = floor(p0 / ckVs);
  var tDelta: vec3f = ckVs / abs(rd);
  var tMax: vec3f = ((vp + step(vec3f(0.0), rd)) * ckVs - p0) / rd;

  var mat: f32 =0.0;
  var mask: vec3f = vec3f(0.0, 0.0, 1.0); // first-voxel fallback: face the viewer
  var tCur: f32 =0.0;

  for (var i: i32 =0; i < STEPS; i = i + 1) {
    var m: f32 =ckVoxel((vp + 0.5) * ckVs);
    if (m > 0.5) {
      mat = m;
      break;
    }
    // step to the next voxel across the nearest grid plane
    if (tMax.x < tMax.y && tMax.x < tMax.z) {
      tCur = tMax.x;
      tMax.x += tDelta.x;
      vp.x += sgn.x;
      mask = vec3f(1.0, 0.0, 0.0);
    } else if (tMax.y < tMax.z) {
      tCur = tMax.y;
      tMax.y += tDelta.y;
      vp.y += sgn.y;
      mask = vec3f(0.0, 1.0, 0.0);
    } else {
      tCur = tMax.z;
      tMax.z += tDelta.z;
      vp.z += sgn.z;
      mask = vec3f(0.0, 0.0, 1.0);
    }
    if (tCur > tSpan) { break; } // left the bound: miss
  }

  if (mat < 0.5) {
    return vec4f(0.0);
  }

  // the hit voxel, its radial "up", and the face that was struck
  var cc: vec3f = (vp + 0.5) * ckVs;
  var r: f32 =length(cc);
  var dir: vec3f = cc / max(r, 1.0e-4);
  var n: vec3f = -mask * sgn;
  var hp: vec3f = p0 + rd * tCur;

  // per-voxel hashes: core phase and material variety
  var vseed: vec2f = vec2f(dot(vp, vec3f(1.0, 57.0, 113.0)), dot(vp, vec3f(27.0, 7.0, 91.0)));
  var h1: f32 =hash(vseed * 0.013);
  var h2: f32 =hash(vseed * 0.029 + 5.7);

  // block-texture grain: a 4x4 hash grid on the struck face
  var uvFace: vec2f;
  if (mask.x > 0.5) { uvFace = hp.yz; }
  else if (mask.y > 0.5) { uvFace = hp.xz; }
  else { uvFace = hp.xy; }
  var grain: f32 =hash(floor(fract(uvFace / ckVs) * 4.0) * 0.37 + vseed * 0.11);
  var texMul: f32 =mix(1.0, 0.72 + 0.55 * grain, uP_texture);

  // flat face lambert + radial wrap for roundness + crevice AO
  var lam: f32 =clamp(dot(n, Lo), 0.0, 1.0);
  var wrap: f32 =clamp(dot(dir, Lo) * 0.5 + 0.5, 0.0, 1.0);
  var ao: f32 =0.55 + 0.45 * clamp(dot(n, dir) * 0.5 + 0.5, 0.0, 1.0);
  var shade: f32 =(0.32 + 0.5 * wrap * wrap + 0.85 * lam * lightNow) * ao;

  var col: vec3f;
  if (mat < 1.5) {
    var f: f32 =ckField(dir);
    var h: f32 =1.0 + uP_rough * max(f - ckSeaN, 0.0) * 1.2;
    var depth: f32 =h - r;
    var topF: f32 =step(depth, ckVs * 1.15);

    /*
      The climate palette. Every material the strata paint with is a
      blend over the four climate weights: snow caps the ice world, the
      mesa runs banded terracotta hashed per RADIAL LAYER (the same band
      wraps the whole planet, the badlands look), desert bleaches the
      land to sand, and lush keeps the tunable colours.
    */
    var snow: vec3f = vec3f(0.92, 0.95, 1.0);
    /*
      Mesa strata: two-block-tall bands hashed per radial layer, weighted
      the way real badlands run — long terracotta stretches broken by
      thin red, white, yellow and dark-brown accent stripes. The same
      band circles the whole planet at its height.
    */
    var layer: f32 =hash(vec2f(floor(r / (ckVs * 2.0)) * 0.371, 5.3));
    var mesaBand: vec3f = select(
      select(
        select(
          select(vec3f(0.4, 0.25, 0.18), vec3f(0.84, 0.65, 0.27), layer < 0.9),
          vec3f(0.88, 0.79, 0.67), layer < 0.8),
        vec3f(0.63, 0.26, 0.15), layer < 0.68),
      vec3f(0.74, 0.42, 0.21), layer < 0.5);
    // mesa tops: red-sand flats low down, banded rock on the risen buttes
    var mesaTop: vec3f = mix(vec3f(0.72, 0.38, 0.2), mesaBand, step(1.0 + uP_rough * 0.1, h));
    var climGrass: vec3f = uC_grass * ckClim.x + uC_sand * ckClim.y
      + snow * ckClim.z + mesaTop * ckClim.w
      + mix(uC_grass, vec3f(0.62, 0.85, 0.3), 0.6) * ckCherry; // vivid meadow
    var climDirt: vec3f = uC_dirt * (ckClim.x + ckClim.y + ckCherry)
      + uC_dirt * vec3f(0.75, 0.85, 1.05) * ckClim.z + mesaBand * ckClim.w;
    var climSand: vec3f = uC_sand * (ckClim.x + ckClim.y + ckCherry)
      + mix(uC_sand, snow, 0.9) * ckClim.z + vec3f(0.72, 0.35, 0.2) * ckClim.w;
    var climWater: vec3f = uC_water * (ckClim.x + ckClim.y + ckCherry)
      + vec3f(0.62, 0.82, 0.92) * ckClim.z
      + mix(uC_water, vec3f(0.42, 0.3, 0.22), 0.4) * ckClim.w;

    if (topF > 0.5 && f < ckSeaN) {
      // OCEAN: the surface of the perfect sphere painted as water —
      // lighter over coastal shallows, deep blue mid-ocean, with a sun
      // glint and a shimmer on the flow clock. The ice world stills the
      // shimmer and pales the depths: a frozen sheet.
      var deep: f32 =clamp((ckSeaN - f) / 0.12, 0.0, 1.0) * (1.0 - 0.55 * ckClim.z);
      var wc: vec3f = climWater * mix(1.3, 0.55, deep);
      var shim: f32 =0.85 + 0.25 * sin(uAnim * 2.5 + grain * 6.2831 + dir.x * 4.0);
      shim = mix(shim, 1.02, ckClim.z);
      col = wc * (0.45 + 0.55 * wrap) * shim + wc * lam * 0.35;
    } else {
      /*
        LAND. Strata by radial depth below the local surface — grass or
        desert sand on the outward faces of surface blocks, mud with
        hashed stone patches beneath, then ore-seamed stone. Elevation
        overrides the biome: rising ground bares brown hillsides, peaks
        stand as naked stone, and every shore gets a sand band.
      */
      var dirtF: f32 =step(depth, ckVs * 2.4);
      var up: f32 =clamp(dot(n, dir), 0.0, 1.0);

      var albedo: vec3f = mix(uC_stone, climDirt, dirtF);
      // stone patches in the exposed mud, below the grass line
      albedo = mix(albedo, uC_stone, dirtF * (1.0 - topF) * step(h2, 0.3));

      var bio: f32 =ckBiome(dir);
      var desertF: f32 =step(bio, 0.3);
      albedo = mix(albedo, climGrass, topF * step(0.45, up) * (1.0 - desertF));
      albedo = mix(albedo, climSand, desertF * dirtF); // desert sand runs deep
      // elevation bands: brown hillsides, then bare stone peaks — both
      // buried under snow when the ice climate holds (frozen peaks stay
      // white with only crevice shadow, not brown or gray)
      albedo = mix(albedo, climDirt,
        topF * step(1.0 + uP_rough * 0.28, h) * 0.85 * (1.0 - 0.9 * ckClim.z));
      albedo = mix(albedo, uC_stone,
        topF * step(1.0 + uP_rough * 0.45, h) * (1.0 - 0.85 * ckClim.z));
      // beach: a narrow field-space band above the shoreline turns to sand
      albedo = mix(albedo, climSand, topF * step(abs(f - ckSeaN - 0.017), 0.018));

      // the coarse cluster cells serve ore veins AND glacier patches
      var oc: vec3f = floor(cc / (2.5 * ckVs));
      var oseed: vec2f = vec2f(dot(oc, vec3f(1.0, 57.0, 113.0)), dot(oc, vec3f(27.0, 7.0, 91.0)));
      var fleck: f32 =step(0.5, hash(floor(fract(uvFace / ckVs) * 4.0) * 0.53 + oseed * 0.19));

      // ICE climate: packed-ice blue patches cluster over the risen
      // ground — glacier faces streaking the snowy mountainsides
      var icePatch: f32 =ckClim.z * step(hash(oseed * 0.023 + 9.1), 0.5)
        * step(1.0 + uP_rough * 0.06, h);
      albedo = mix(albedo, vec3f(0.55, 0.7, 0.92), icePatch * (0.45 + 0.4 * fleck));

      /*
        Ore veins: a coarse cell grid hashes veins into the deep stone, so
        ore comes in multi-block clusters like the cross-section dioramas.
        Each vein rolls a type — diamond (the tunable ore colour), lapis
        (a deep-blue remap of it), or coal (unlit) — and each ore block is
        stone FLECKED with the hue on its texture grain, the way the
        actual ore tile is drawn. Only the flecks glow.
      */
      var veinF: f32 =(1.0 - dirtF) * step(1.0 - uP_ore, hash(oseed * 0.017)) * step(h1, 0.8);
      var oreType: f32 =hash(oseed * 0.041 + 2.9);
      var oreHue: vec3f = select(
        select(vec3f(0.16), uC_ore * vec3f(0.25, 0.45, 1.2), oreType < 0.75),
        uC_ore, oreType < 0.4);
      var oreLit: f32 =select(0.0, 1.0, oreType < 0.75);
      albedo = mix(albedo, oreHue, veinF * (0.2 + 0.65 * fleck));
      var twinkle: f32 =0.55 + 0.45 * sin(uP_shuffle + hash(oseed * 0.013) * 37.0); // integrated clock

      // depth below the surface darkens: cave interiors and cleft walls
      // sink into shadow, which makes the glow read as underground
      var depthDim: f32 =mix(1.0, 0.62, clamp(depth / max(uP_rough * 0.9, 0.05), 0.0, 1.0));

      // the deeper the rock, the closer to the molten core
      var coreR: f32 =1.0 - uP_rough * 0.6;
      var coreF: f32 =uP_core * smoothstep(coreR + 0.15, coreR - 0.05, r);

      var emis: vec3f = oreHue * veinF * fleck * oreLit * glowNow * twinkle
        + uC_lava * coreF * (0.9 + 0.4 * sin(uP_shuffle * 1.6 + h1 * 51.0))
          * (0.6 + 1.4 * uOutput);

      col = albedo * shade * depthDim + emis;
    }
  } else if (mat < 2.5) {
    // trunk: dark wood, derived from the mud so the palette stays small
    col = uC_dirt * 0.5 * shade;
  } else {
    // leaves: heavier grain reads as foliage clumps. Under the ice climate
    // this material IS the spikes, so it turns packed-ice blue and the
    // grain smooths toward faceted ice.
    var climLeaf: vec3f = uC_leaf * (ckClim.x + ckClim.y * 0.9)
      + vec3f(0.62, 0.76, 0.95) * ckClim.z
      + mix(uC_leaf, vec3f(0.45, 0.62, 0.25), 0.5) * ckClim.w // cactus green
      + vec3f(0.93, 0.7, 0.82) * ckCherry; // blossom pink
    col = climLeaf * shade;
    var leafGrain: f32 =mix(0.5 + 0.9 * grain, 0.85 + 0.3 * grain, ckClim.z);
    texMul = mix(1.0, leafGrain, uP_texture);
  }

  col *= texMul * gainNow;
  col = pow(max(col, vec3f(0.0)), vec3f(uP_contrast));

  // Surface-lit orb bounded by the hit test: alpha IS coverage, and a hit
  // is fully opaque — premultiplied output, trivially (see orb-28).
  return vec4f(col, 1.0);
}
`;

export const orb24Orb: OrbVariant = {
  key: "orb-24",
  label: "ORB-24",
  note: "a Minecraft Earth — a perfect voxel sphere whose seasons cycle it through lush, cherry-grove, ice, mesa and desert worlds",
  frag: CHUNK_FRAG,
  params: [
    {
      default: 0.22,
      integrate: true,
      key: "spin",
      label: "Spin",
      max: 5,
      min: 0,
      step: 0.03,
    },
    { default: 0.45, key: "tilt", label: "Tilt", max: 4, min: 0, step: 0.02 },
    {
      default: 0.12,
      integrate: true,
      key: "drift",
      label: "Terrain drift",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.3,
      integrate: true,
      key: "season",
      label: "Season rate",
      max: 10,
      min: 0,
      step: 0.05,
    },
    {
      default: 0.8,
      integrate: true,
      key: "shuffle",
      label: "Ember rate",
      max: 20,
      min: 0,
      step: 0.1,
    },
    {
      default: 1.15,
      key: "radius",
      label: "Radius",
      max: 3,
      min: 0.15,
      step: 0.015,
    },
    { default: 64, key: "blocks", label: "Blocks", max: 96, min: 16, step: 1 },
    {
      default: 0.45,
      key: "rough",
      label: "Mountains",
      max: 0.8,
      min: 0,
      step: 0.01,
    },
    {
      default: 2.4,
      key: "scale",
      label: "Terrain scale",
      max: 8,
      min: 0.5,
      step: 0.05,
    },
    {
      default: 0.5,
      key: "sea",
      label: "Sea level",
      max: 1,
      min: 0,
      step: 0.01,
    },
    { default: 0.75, key: "trees", label: "Trees", max: 1, min: 0, step: 0.01 },
    { default: 0.4, key: "cave", label: "Caves", max: 1, min: 0, step: 0.01 },
    {
      default: 0.12,
      key: "ore",
      label: "Ore density",
      max: 0.6,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.9,
      key: "glow",
      label: "Ore glow",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 0.5,
      key: "core",
      label: "Molten core",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.6,
      key: "texture",
      label: "Texture grain",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 1,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    { default: 1, key: "gain", label: "Gain", max: 5, min: 0.05, step: 0.05 },
    {
      default: 1,
      key: "contrast",
      label: "Contrast",
      max: 10,
      min: 0.15,
      step: 0.05,
    },
  ],
  colors: [
    { default: "#6abe30", key: "grass", label: "Grass" },
    { default: "#6f4a2f", key: "dirt", label: "Mud" },
    { default: "#8a8a90", key: "stone", label: "Stone" },
    { default: "#dbcf9c", key: "sand", label: "Sand" },
    { default: "#2f66d0", key: "water", label: "Water" },
    { default: "#3e8f27", key: "leaf", label: "Leaves" },
    { default: "#4de3ff", key: "ore", label: "Ore" },
    { default: "#ff7b26", key: "lava", label: "Lava" },
  ],
  /*
    Each state animates DIFFERENTLY on the integrated clocks — same palette
    and biomes throughout (no stateColors on purpose):

      idle DRIFTS      lazy spin, terrain barely morphing, embers twinkling
      thinking LOADS   the spin all but stops while the terrain field
                       streams — continents morph and blocks pop in and out
                       like chunks loading — and the ore twinkle races
      speaking ERUPTS  the planet turns fast to answer, the molten core
                       blazes through the caves, ore glow flares
  */
  statePresets: {
    idle: {
      core: 0.5,
      drift: 0.12,
      gain: 1,
      glow: 0.9,
      light: 1,
      season: 0.3,
      shuffle: 0.8,
      spin: 0.22,
    },
    // thinking races the seasons as well as the terrain: the planet cycles
    // through its worlds while it considers
    thinking: {
      core: 0.35,
      drift: 1.7,
      gain: 0.95,
      glow: 1.3,
      light: 0.9,
      season: 1.8,
      shuffle: 4.5,
      spin: 0.04,
    },
    speaking: {
      core: 1,
      drift: 0.35,
      gain: 1.1,
      glow: 1.6,
      light: 1.15,
      season: 0.6,
      shuffle: 1.6,
      spin: 0.85,
    },
  },
};

export type Orb24Props = Omit<ShaderOrbProps, "variant">;

export function Orb24({ size = 280, ...rest }: Orb24Props) {
  return <ShaderOrb variant={orb24Orb} size={size} {...rest} />;
}

export default Orb24;

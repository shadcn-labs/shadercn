"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const BRICK_FRAG = `
const STEPS: i32 = 96;
// Per-fragment constants, resolved once in main().
var<private> lgCell: vec3f;  // cell sizes: (stud pitch, brick height, stud pitch)
var<private> lgGap: f32;

// Brick-lookup results (GLSL ES 1.0 has no out-struct ergonomics).
var<private> lgBid: vec3f;     // unique id of the owning brick
var<private> lgOff: f32;    // long-axis stagger offset of its course, in studs
var<private> lgOrient: f32; // 0: long axis runs along x, 1: along z

fn lgRot(a: f32) -> mat2x2f {
  var c: f32 =cos(a);
  var s: f32 =sin(a);
  return mat2x2f(vec2f(c, -s), vec2f(s, c));
}

/*
  Which 2x4 brick owns this stud cell? Layers alternate their long axis
  and every (layer, row) course staggers by a hashed offset — brickwork
  bonding, so vertical seams never stack.
*/
fn lgBrick(cellIdx: vec3f) {
  lgOrient = cellIdx.y - 2.0 * floor(cellIdx.y / 2.0);
  var lc: f32 =select(cellIdx.z, cellIdx.x, lgOrient < 0.5);
  var sc: f32 =select(cellIdx.x, cellIdx.z, lgOrient < 0.5);
  var srow: f32 =floor(sc / 2.0);
  lgOff = floor(hash(vec2f(cellIdx.y * 3.17, srow * 7.31)) * 4.0);
  lgBid = vec3f(floor((lc + lgOff) / 4.0), cellIdx.y, srow + lgOrient * 913.0);
}

/*
  The world function: inside the ball, minus bricks currently blinked out
  of the outer two courses. Interior cells answer with a single length —
  the brick lookup only runs in the shell.
*/
fn lgSolid(cc: vec3f) -> f32 {
  var r: f32 =length(cc);
  if (r >= 1.0) { return 0.0; }
  if (r > 1.0 - 2.2 * lgCell.y) {
    lgBrick(floor(cc / lgCell));
    var blink: f32 =fract(hash(lgBid.xy * 0.173 + lgBid.z * 0.089) + uP_rebuild * 0.03);
    if (blink < lgGap) { return 0.0; } // this brick is off the build right now
  }
  return 1.0;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: agent output stokes the sheen and the gain; user
  // input brightens the key light.
  var glossNow: f32 =uP_gloss * (0.7 + 0.9 * uOutput);
  var gainNow: f32 =uP_gain * (0.92 + 0.25 * uOutput);
  var lightNow: f32 =uP_light * (1.0 + 0.3 * uInput);

  var pitch: f32 =2.0 / clamp(uP_studs, 8.0, 48.0);
  lgCell = vec3f(pitch, pitch * 1.2, pitch); // real brick proportion
  lgGap = clamp(uP_gap, 0.0, 0.9);

  var bound: f32 =1.0 + length(lgCell) * 0.5 + 0.001;

  var duv: vec2f = uv / uP_radius;
  var ro: vec3f = vec3f(duv * bound, 2.6);
  var rd: vec3f = vec3f(0.0, 0.0, -1.0);

  // rotate the RAY into object space (inverse tumble) — the lattice stays
  // axis-aligned and the studs stay up while the ball turns. Light and
  // view rotate along, keeping the sun fixed relative to the viewer.
  let tiltM = lgRot(uP_tilt); // positive tilt looks DOWN at the studs
  let spinM = lgRot(-uP_spin); // integrated clock
  let roT = tiltM * vec2f(ro.y, ro.z);
  ro.y = roT.x;
  ro.z = roT.y;
  let roS = spinM * vec2f(ro.x, ro.z);
  ro.x = roS.x;
  ro.z = roS.y;
  let rdT = tiltM * vec2f(rd.y, rd.z);
  rd.y = rdT.x;
  rd.z = rdT.y;
  let rdS = spinM * vec2f(rd.x, rd.z);
  rd.x = rdS.x;
  rd.z = rdS.y;
  var Lo: vec3f = normalize(vec3f(-0.5, 0.7, 0.55));
  let loT = tiltM * vec2f(Lo.y, Lo.z);
  Lo.y = loT.x;
  Lo.z = loT.y;
  let loS = spinM * vec2f(Lo.x, Lo.z);
  Lo.x = loS.x;
  Lo.z = loS.y;
  var Vo: vec3f = vec3f(0.0, 0.0, 1.0);
  let voT = tiltM * vec2f(Vo.y, Vo.z);
  Vo.y = voT.x;
  Vo.z = voT.y;
  let voS = spinM * vec2f(Vo.x, Vo.z);
  Vo.x = voS.x;
  Vo.z = voS.y;

  // DDA needs nonzero direction components — nudge, keep the sign
  var sgn: vec3f = vec3f(
    select(-1.0, 1.0, rd.x >= 0.0),
    select(-1.0, 1.0, rd.y >= 0.0),
    select(-1.0, 1.0, rd.z >= 0.0)
  );
  rd = normalize(sgn * max(abs(rd), vec3f(1.0e-4)));

  // analytic bounding sphere: empty pixels exit here
  var b: f32 =dot(rd, ro);
  var c: f32 =dot(ro, ro) - bound * bound;
  var disc: f32 =b * b - c;
  if (disc < 0.0) {
    return vec4f(0.0);
  }
  var sq: f32 =sqrt(disc);
  var p0: vec3f = ro + rd * (-b - sq + pitch * 0.001);
  var tSpan: f32 =2.0 * sq;

  // Amanatides & Woo, anisotropic cells: per-axis sizes throughout
  var vp: vec3f = floor(p0 / lgCell);
  var tDelta: vec3f = lgCell / abs(rd);
  var tMax: vec3f = ((vp + step(vec3f(0.0), rd)) * lgCell - p0) / rd;

  var hitF: f32 =0.0;
  var mask: vec3f = vec3f(0.0, 0.0, 1.0); // first-voxel fallback: face the viewer
  var tCur: f32 =0.0;

  for (var i: i32 =0; i < STEPS; i = i + 1) {
    if (lgSolid((vp + 0.5) * lgCell) > 0.5) {
      hitF = 1.0;
      break;
    }
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

  if (hitF < 0.5) {
    return vec4f(0.0);
  }

  // the hit cell, its brick, and the struck face
  var cc: vec3f = (vp + 0.5) * lgCell;
  var r: f32 =length(cc);
  var dir: vec3f = cc / max(r, 1.0e-4);
  lgBrick(vp);
  var n: vec3f = -mask * sgn;
  var hp: vec3f = p0 + rd * tCur;

  /*
    Brick colour: a per-brick hash picks one of the five plastic colours.
    The patch parameter slides the pick toward a smooth field over the
    sphere, so 0 is per-brick confetti and 1 is big moulded colour
    regions; the field is range-stretched so all five colours appear.
  */
  var cph: f32 =hash(lgBid.xy * 1.37 + lgBid.z * 0.91);
  var rn: f32 =noise(dir.xy * 2.6 + 7.0) * 0.5 + noise(dir.yz * 2.6 + 13.0) * 0.5;
  rn = clamp(0.5 + (rn - 0.5) * 2.2, 0.0, 0.999);
  var idx: f32 =floor(clamp(mix(cph, rn, clamp(uP_patch, 0.0, 1.0)), 0.0, 0.999) * 5.0);
  var albedo: vec3f = select(
    select(
      select(
        select(uC_brickE, uC_brickD, idx < 3.5),
        uC_brickC, idx < 2.5),
      uC_brickB, idx < 1.5),
    uC_brickA, idx < 0.5);
  albedo *= 0.93 + 0.14 * hash(lgBid.xy * 0.53 + lgBid.z * 1.7); // mold variance

  /*
    Seams: distance to the nearest BRICK boundary along each lattice axis,
    from the continuous within-brick coordinates. Only the two axes
    tangent to the struck face draw — stud grid lines never do.
  */
  var sp: vec3f = hp / lgCell;
  var lcC: f32 =select(sp.z, sp.x, lgOrient < 0.5);
  var scC: f32 =select(sp.x, sp.z, lgOrient < 0.5);
  var u4: f32 =fract((lcC + lgOff) / 4.0);
  var v2: f32 =fract(scC / 2.0);
  var wY: f32 =fract(sp.y);
  var dL: f32 =min(u4, 1.0 - u4) * 4.0 * pitch;
  var dS: f32 =min(v2, 1.0 - v2) * 2.0 * pitch;
  var dY: f32 =min(wY, 1.0 - wY) * lgCell.y;
  var seamD: f32 = 0.0;
  if (mask.y > 0.5) {
    seamD = min(dL, dS);
  } else if (mask.x > 0.5) {
    seamD = min(dY, select(dL, dS, lgOrient < 0.5));
  } else {
    seamD = min(dY, select(dS, dL, lgOrient < 0.5));
  }
  var seam: f32 =(1.0 - smoothstep(0.0, 0.07 * pitch, seamD)) * clamp(uP_seam, 0.0, 1.0);

  /*
    Studs, embossed the way the real brick photographs: the normal tilts
    hard around the stud shoulder so the light wraps it like a cylinder
    edge, the cap lifts, a contact shadow falls on the side facing away
    from the light, and a faint ring engraved into the cap stands in for
    the moulded logo.
  */
  var nEff: vec3f = n;
  var studF: f32 =0.0;
  var shadowF: f32 =0.0;
  var engrave: f32 =0.0;
  var studAmt: f32 =clamp(uP_stud, 0.0, 1.0);
  if (mask.y > 0.5 && n.y > 0.5) {
    var cuv: vec2f = fract(hp.xz / pitch) - 0.5;
    var sd: f32 =length(cuv);
    var rim: f32 =smoothstep(0.14, 0.29, sd) * (1.0 - smoothstep(0.29, 0.335, sd));
    var tiltN: vec3f = normalize(vec3f(cuv.x, 0.42, cuv.y));
    nEff = normalize(mix(n, tiltN, rim * studAmt));
    studF = 1.0 - smoothstep(0.285, 0.33, sd);
    var lxz: vec2f = normalize(Lo.xz + vec2f(1.0e-5));
    var away: f32 =clamp(dot(normalize(cuv + vec2f(1.0e-5)), -lxz), 0.0, 1.0);
    shadowF = smoothstep(0.47, 0.335, sd) * (1.0 - studF) * (0.35 + 0.65 * away);
    engrave = smoothstep(0.11, 0.135, sd) * (1.0 - smoothstep(0.155, 0.18, sd)) * studF;
  }

  // plastic shading: lambert + wrap for roundness + white Blinn sheen,
  // dimmed toward the interior so revealed under-bricks read as inside
  var lam: f32 =clamp(dot(nEff, Lo), 0.0, 1.0);
  var wrap: f32 =clamp(dot(dir, Lo) * 0.5 + 0.5, 0.0, 1.0);
  var depthDim: f32 =mix(1.0, 0.55, clamp((1.0 - r) / (3.0 * lgCell.y), 0.0, 1.0));
  var shade: f32 =(0.34 + 0.42 * wrap * wrap + 0.8 * lam * lightNow) * depthDim;

  var col: vec3f = albedo * shade * (1.0 + 0.1 * studF);
  col *= 1.0 - shadowF * 0.38 * studAmt; // stud contact shadow
  col *= 1.0 - engrave * 0.14 * studAmt; // moulded logo ring

  // chamfered edge: a thin bright bevel line just inside the dark joint,
  // catching the light the way the real brick's edges do
  var bevel: f32 =smoothstep(0.05 * pitch, 0.085 * pitch, seamD)
    * (1.0 - smoothstep(0.085 * pitch, 0.16 * pitch, seamD));
  col += albedo * bevel * (0.18 + 0.5 * lam) * clamp(uP_seam, 0.0, 1.0);
  col *= 1.0 - seam * 0.8; // dark joints

  // two-lobe plastic sheen: a sharp hotspot over a broad soft gloss
  var ndh: f32 =clamp(dot(nEff, normalize(Lo + Vo)), 0.0, 1.0);
  var spec: f32 =pow(ndh, 48.0) + 0.22 * pow(ndh, 8.0);
  col += vec3f(1.0) * spec * glossNow * (1.0 - seam) * depthDim;

  col *= gainNow;
  col = pow(max(col, vec3f(0.0)), vec3f(uP_contrast));

  // Surface-lit orb bounded by the hit test: alpha IS coverage, and a hit
  // is fully opaque — premultiplied output, trivially (see orb-28).
  return vec4f(col, 1.0);
}
`;

export const orb12Orb: OrbVariant = {
  colors: [
    { key: "brickA", label: "Red", default: "#c4281c" },
    { key: "brickB", label: "Yellow", default: "#f2cd37" },
    { key: "brickC", label: "Blue", default: "#1e5aa8" },
    { key: "brickD", label: "Green", default: "#00852b" },
    { key: "brickE", label: "White", default: "#f4f4f4" },
  ],
  frag: BRICK_FRAG,
  key: "orb-12",
  label: "ORB-12",
  note: "a ball of glossy toy bricks, studs up — it rebuilds itself while it thinks",
  params: [
    {
      key: "spin",
      label: "Spin",
      min: 0,
      max: 5,
      step: 0.03,
      default: 0.25,
      integrate: true,
    },
    { key: "tilt", label: "Tilt", min: 0, max: 4, step: 0.02, default: 0.55 },
    {
      key: "rebuild",
      label: "Rebuild rate",
      min: 0,
      max: 20,
      step: 0.1,
      default: 0.4,
      integrate: true,
    },
    {
      key: "gap",
      label: "Missing bricks",
      min: 0,
      max: 0.8,
      step: 0.01,
      default: 0.07,
    },
    { key: "studs", label: "Studs", min: 8, max: 48, step: 1, default: 18 },
    {
      key: "radius",
      label: "Radius",
      min: 0.15,
      max: 3,
      step: 0.015,
      default: 0.95,
    },
    {
      key: "patch",
      label: "Colour patches",
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.35,
    },
    {
      key: "stud",
      label: "Stud relief",
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.85,
    },
    { key: "seam", label: "Seams", min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: "gloss", label: "Gloss", min: 0, max: 3, step: 0.02, default: 1 },
    {
      key: "light",
      label: "Key light",
      min: 0,
      max: 3,
      step: 0.015,
      default: 1,
    },
    { key: "gain", label: "Gain", min: 0.05, max: 5, step: 0.05, default: 1 },
    {
      key: "contrast",
      label: "Contrast",
      min: 0.15,
      max: 10,
      step: 0.05,
      default: 1,
    },
  ],
  stateColors: {
    speaking: {
      brickA: "#ff3b6b",
      brickB: "#ffc93c",
      brickC: "#21d4fd",
      brickD: "#7af5a0",
      brickE: "#ffffff",
    },
  },
  statePresets: {
    idle: {
      gain: 1,
      gap: 0.07,
      gloss: 1,
      light: 1,
      rebuild: 0.4,
      spin: 0.25,
    },
    speaking: {
      contrast: 0.95,
      gain: 1.25,
      gap: 0,
      gloss: 2.4,
      light: 1.35,
      rebuild: 0.5,
      seam: 0.3,
      spin: 1.6,
      stud: 0.6,
      tilt: 0.42,
    },
    thinking: {
      contrast: 1.05,
      gain: 1.05,
      gap: 0.55,
      gloss: 0.55,
      light: 1.15,
      rebuild: 9,
      seam: 0.95,
      spin: 0.03,
      stud: 1,
      tilt: 0.9,
    },
  },
};

export type Orb12Props = Omit<ShaderOrbProps, "variant">;

export function Orb12({ size = 280, ...rest }: Orb12Props) {
  return <ShaderOrb variant={orb12Orb} size={size} {...rest} />;
}

export default Orb12;

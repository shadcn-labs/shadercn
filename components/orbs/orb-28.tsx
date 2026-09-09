"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const BITDUMB_FRAG = `
const LEVELS: i32 = 20;
// Volume-reactive values, resolved once per fragment in main().
var<private> bitdumbGain: f32;
var<private> bitdumbBody: f32;

fn bdRot(a: f32) -> mat2x2f {
  var c: f32 =cos(a);
  var s: f32 =sin(a);
  return mat2x2f(vec2f(c, -s), vec2f(s, c));
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  bitdumbGain = uP_gain * (1.0 + 0.6 * uInput);
  bitdumbBody = uP_body * (1.0 + 0.8 * uOutput);

  var duv: vec2f = uv / uP_radius;
  var r2: f32 =dot(duv, duv);

  // analytic disc silhouette — this orb is parameterised on the dome, so
  // the exact edge is just the unit circle, with the same tunable band as
  // the raymarched orbs
  var band: f32 =mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  var mask: f32 =1.0 - smoothstep(1.0 - band, 1.005, length(duv));

  // front dome point and its normal (view space)
  var zc: f32 =sqrt(max(1.0 - r2, 0.0));
  var n: vec3f = vec3f(duv, zc);

  // tumble the sphere point with real rotations, then project. abs() on z
  // mirror-wraps the hemisphere the tumble turns away, avoiding the
  // stereographic pole blow-up.
  var sp: vec3f = n;
  let tilted = bdRot(uP_tilt) * vec2f(sp.y, sp.z);
  sp.y = tilted.x;
  sp.z = tilted.y;
  let spun = bdRot(uP_spin) * vec2f(sp.x, sp.z); // integrated clock
  sp.x = spun.x;
  sp.z = spun.y;
  var p: vec2f = sp.xy / (abs(sp.z) + 1.0) * uP_gridScale;

  /*
    Analytic pixel footprint in grid space, in place of fwidth(): one
    screen pixel in uv units, through the radius scale, the dome stretch
    (grids compress toward the rim, so a pixel covers more of them there),
    and the grid scale. Doubled alongside p every level.
  */
  var px: f32 =(2.0 / min(uRes.x, uRes.y)) / uP_radius / max(zc, 0.2) * uP_gridScale;

  var acc: vec4f = vec4f(0.0);
  var phase: f32 =uP_speed * 0.2; // integrated clock, additive phase

  for (var i: i32 =0; i < LEVELS; i = i + 1) {
    var fi: f32 =f32(i) + 1.0;
    if (fi > uP_levels) { break; }

    // the listing's engine, kept verbatim: binary zoom
    p += p;
    px += px;

    var v: vec2f = ceil(p);
    var f: vec2f = fract(p);

    // distance to the nearest cell line, against this level's footprint —
    // the extension-free fwidth. Deep levels saturate to solid planes,
    // exactly like the original's aliasing.
    var e2: vec2f = 1.0 - smoothstep(vec2f(0.0), vec2f(px * uP_lineW), min(f, 1.0 - f));

    // x-lines and y-lines separately tintable — the original's .xyy
    var edgeCol: vec3f = uC_lineA * e2.x + uC_lineB * e2.y;

    // the per-cell shutter value, and the under-compositing that makes
    // level i occlude level i+1 — both straight from the listing
    var aBit: f32 =fract(length(v) / fi - phase) * uP_shutter;
    acc += vec4f(edgeCol, aBit) * (1.0 - acc.a);

    if (acc.a > 0.996) { break; }
  }

  var col: vec3f = acc.rgb * bitdumbGain;

  // the ball body: a lambert-shaded base under the lattice, so the orb
  // reads as a solid object rather than lines floating on nothing
  var L: vec3f = normalize(vec3f(-0.4, 0.5, 0.75));
  var shade: f32 =0.25 + 0.75 * clamp(dot(n, L), 0.0, 1.0);
  col += uC_base * shade * bitdumbBody;

  // fresnel rim to sell the sphere
  col += uC_rim * pow(1.0 - zc, uP_rimPow) * uP_rim;

  col = pow(max(col, vec3f(0.0)), vec3f(uP_contrast));

  // coverage alpha; safety taper fades colour AND alpha, as always
  var fade: f32 =1.0 - smoothstep(uP_edgeFade, 1.0, length(uv));
  var a: f32 =mask * fade;

  // Surface-lit orb bounded by a mask: alpha IS coverage, so premultiply —
  // the opposite of the emissive orbs (see the note in orb-31).
  return vec4f(col * a, a);
}
`;

export const orb28Orb: OrbVariant = {
  key: "orb-28",
  label: "ORB-28",
  note: "nested binary grids shuttering on a tumbling bit-sphere",
  frag: BITDUMB_FRAG,
  params: [
    {
      default: 0.5,
      integrate: true,
      key: "speed",
      label: "Shutter drift",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.15,
      integrate: true,
      key: "spin",
      label: "Tumble rate",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 0.5,
      key: "tilt",
      label: "Tumble tilt",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.9,
      key: "radius",
      label: "Radius",
      max: 3,
      min: 0.1,
      step: 0.015,
    },
    {
      default: 2,
      key: "gridScale",
      label: "Grid scale",
      max: 20,
      min: 0.5,
      step: 0.1,
    },
    // 12 levels / wider lines: past ~12 the deep grids alias into solid white
    // planes that swallow the line palette — the state staging below depends
    // on the coarse lines and body actually carrying their colours
    {
      default: 12,
      key: "levels",
      label: "Bit depth",
      max: 20,
      min: 4,
      step: 1,
    },
    {
      default: 2,
      key: "lineW",
      label: "Line width",
      max: 15,
      min: 0.5,
      step: 0.1,
    },
    {
      default: 1,
      key: "shutter",
      label: "Shutter",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 1,
      key: "gain",
      label: "Line gain",
      max: 10,
      min: 0.05,
      step: 0.05,
    },
    { default: 1, key: "body", label: "Body glow", max: 5, min: 0, step: 0.03 },
    {
      default: 0.6,
      key: "rim",
      label: "Rim light",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 3,
      key: "rimPow",
      label: "Rim tightness",
      max: 20,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 1,
      key: "contrast",
      label: "Contrast",
      max: 10,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 1,
      key: "edge",
      label: "Edge sharpness",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.98,
      key: "edgeFade",
      label: "Halo falloff",
      max: 3,
      min: 0.1,
      step: 0.015,
    },
  ],
  colors: [
    { default: "#ff5a4d", key: "lineA", label: "X lines" },
    { default: "#59d8ff", key: "lineB", label: "Y lines" },
    { default: "#101528", key: "base", label: "Body" },
    { default: "#bcd8ff", key: "rim", label: "Rim" },
  ],
  /*
    The states are staged on the two integrated clocks: thinking runs the
    shutter cascade hot AND sets the sphere tumbling — the bits computing
    furiously while the orb turns them over — and speaking tumbles harder
    still while the flicker stays moderate: the orb turning to answer. Both
    clocks integrate, so every rate change glides without a phase jump.
  */
  statePresets: {
    /*
      calm: a steady flicker at double the old rate, lazy tumble. Two bits
      shallower and the lines a quarter wider, so the grid reads bolder
      and coarser; the body glow eased down and the rim pulled tight —
      red and white lines on black, no halo.
    */
    idle: {
      body: 0.9,
      contrast: 1.2,
      gain: 1,
      levels: 10,
      lineW: 2.5,
      rim: 0.6,
      rimPow: 5.2,
      shutter: 1.02,
      speed: 1,
      spin: 0.1,
    },
    // computing: the shutter cascade races (2.4x idle) and the tumble goes
    // with it, eight times idle, on wider lines and a lifted gain; the body
    // dims so the flickering cells carry the light
    thinking: {
      body: 0.85,
      gain: 1.2,
      lineW: 2.9,
      rim: 0.7,
      shutter: 0.94,
      speed: 2.4,
      spin: 0.81,
    },
    /*
      answering: hard fast tumble on a grid five times finer and seven bits
      deeper, so the sphere goes dense with cells; the body is all but cut
      and the rim brought up hard and pulled tight, so the light sits on
      the limb and the circuitry, not the ball.

      gain stays LOW on purpose: the shader multiplies it by (1 + 0.6 *
      input volume), and speaking synthesizes input around 0.65 — a 1.35
      preset lands near x1.9 effective, which clamps the lines to white
      and reads as a pale wash. 0.95 keeps the effective gain near 1.3,
      where the red survives.
    */
    speaking: {
      body: 0.27,
      contrast: 1.45,
      gain: 0.95,
      gridScale: 10.3,
      levels: 17,
      rim: 1.53,
      rimPow: 10,
      shutter: 1.2,
      speed: 3,
      spin: 1.1,
    },
  },
  /*
    Four stageable colours, and one palette across all three states: red
    and white circuitry on pure black. The states are told apart by the
    tumble, the grid and the line weight, not the colour.
  */
  stateColors: {
    idle: {
      base: "#000000",
      lineA: "#ff1100",
      lineB: "#ffffff",
      rim: "#000000",
    },
    speaking: {
      base: "#000000",
      lineA: "#ff0000",
      lineB: "#ffffff",
      rim: "#000000",
    },
    thinking: {
      base: "#000000",
      lineA: "#ff0000",
      lineB: "#ffffff",
      rim: "#000000",
    },
  },
};

export type Orb28Props = Omit<ShaderOrbProps, "variant">;

export function Orb28({ size = 280, ...rest }: Orb28Props) {
  return <ShaderOrb variant={orb28Orb} size={size} {...rest} />;
}

export default Orb28;

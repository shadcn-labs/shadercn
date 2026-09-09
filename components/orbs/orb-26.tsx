"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const KNOT_REST = {
  bulge: 3.28,
  contrast: 1.35,
  core: 2.235,
  drift: 0.18,
  floor: 0.26,
  gain: 1,
  light: 0.705,
  pole: 0.13,
  poleSoft: 0.001,
  pulse: 0.35,
  sharp: 4.5,
  speed: 0.42,
  split: 0.045,
  swirl: 0.075,
  warp: 2,
};

const KNOT_PALETTE = {
  deep: "#111a2e",
  hot: "#fff4d6",
  line: "#3fd2ff",
  sheen: "#a9d8ff",
};

const LATTICE_FRAG = `
const OCTAVES: i32 = 9;
const AA: i32 = 3;
const TAU: f32 = 6.28318530718;

// Volume-reactive values, resolved once per fragment in main().
var<private> latticePole: f32;
var<private> latticeSharp: f32;
var<private> latticeGain: f32;

fn latticeRender(fragCoord: vec2f) -> vec3f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var R: f32 =max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  var pl: vec2f = uv / R;
  var z: f32 =sqrt(max(1.0 - dot(pl, pl), 0.0));
  var n: vec3f = vec3f(pl, z);

  var t: f32 =uP_speed; // integrated clock

  /*
    Stereographic projection of the UNROTATED dome.

    This orb was built on the abs(sp.z) form first — the one orb-28
    and orb-29 use, which survives a 3D roll because the divisor can
    only fall TO zero at the terminator, never through it. It renders, but
    every quarter turn it makes the visible hemisphere an EXACT mirror
    image about the view axis: at a roll of 90 degrees sp becomes
    (-n.z, n.y, n.x), so the projected coordinate depends on n.z and on
    abs(n.x), and both of those are even in screen x. A cellular grid
    hides that. A web of long threads does not — the ball turns into a
    Rorschach blot for a quarter of every revolution.

    So the dome stays put, as in orb-08, and all the motion below is
    projection-safe 2D.
  */
  var p: vec2f = n.xy / (n.z + 1.0 + uP_bulge) * uP_scale;

  // the plane turns while the lattice drifts across it, so the crazing
  // migrates over the glaze instead of sitting welded to it
  var sw: f32 =uP_swirl; // integrated clock
  p = mat2x2f(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;
  p.x += uP_drift;     // integrated clock

  /*
    A fractional offset off the pattern origin. The listing carries the
    resolution here; it cancels out of the pole term exactly (see the
    header) but it does keep the lattice off centre, and without something
    in its place a cell corner sits pinned at the dead middle of the ball.
  */
  p += vec2f(0.37, 0.21);

  // the cell the sample starts in, fixed before the warp — everything the
  // pole term does is relative to THIS corner, not to wherever c wanders
  var cell: vec2f = floor(p);

  /*
    Each cell knots on its own hashed phase, so the grid breathes instead
    of pulsing as one sheet. The rate is a constant, not a slider: this
    multiplies the integrated clock, and a slider there would jump the
    phase of every cell on a state change.
  */
  var breathe: f32 =1.0 + uP_pulse * sin(TAU * hash(cell) + t * 0.35);

  var c: vec2f = p;
  for (var j: i32 =0; j < OCTAVES; j = j + 1) {
    var i: f32 =f32(j) + 1.0;

    /*
      The lattice pole, softened. d/(d*d+g) tracks 1/d away from the cell
      corner and rolls over to a finite peak at it, so the phase stays
      band-limited and the knot has a SIZE — uP_poleSoft is that size, and
      it is the difference between crisp cell knots and a corner full of
      aliased noise.
    */
    var d: vec2f = cell - c;
    var pole: vec2f = latticePole * breathe * d / (d * d + vec2f(uP_poleSoft));

    c += uP_warp * cos(i * c.yx + pole + t) / i;
  }

  /*
    The listing's tone map: a thin ridge every PI with an exponential
    falloff. The per-channel offsets are kept as their original ratio
    (0, 2, 1) so one slider widens the whole split, and against a ridge
    this thin they separate the thread into three coloured filaments.
  */
  var x: vec3f = vec3f(c.y) + vec3f(0.0, 2.0, 1.0) * uP_split;
  var thread: vec3f = exp(-latticeSharp * abs(sin(x)));

  var lev: f32 =dot(thread, vec3f(1.0 / 3.0));

  /*
    The exp() floor never reaches zero, so the shell is lit between the
    threads by construction — the body colour is added under it rather
    than filling a hole. The thread term stays PER-CHANNEL through the
    palette multiply; collapsing it to lev first would throw away the
    filament split, which is the only thing the vec4f phase was for.
  */
  var col: vec3f = uC_deep * uP_floor;
  /*
    The ramp between the two thread colours runs nearly the whole range of
    lev deliberately. Started at 0.35 it reached uC_hot — which is near-white in
    every state — across most of the visible web, and the state palettes,
    which ride on uC_line, never got to the eye at all.

    The other half of that fix is in the presets: the chromatic split makes
    the three channels independent, so at a wide split THREAD sets the hue
    and no palette can. It is staged with the rest — widest while
    searching, nearly closed while answering, which is when the warm
    palette has to carry.
  */
  col += thread * mix(uC_line, uC_hot, smoothstep(0.12, 1.0, lev)) * latticeGain;

  /*
    A tight second read of the same ridge, added on top: raising a value
    that is already exp(-k*|sin|) to a high power is the same ridge at a
    fraction of the width, which lands as a hot core inside each thread.
    Taken from lev — the MEAN of the three channels — deliberately, so the
    core is achromatic and lands only where all three filaments coincide.
    Read per-channel it would just be a fourth colour-separated ridge, and
    the web would stay a scatter of green and magenta flecks instead of
    resolving into white threads with coloured shoulders. Squared twice
    rather than pow() — pow is undefined for a negative base and this is
    cheaper anyway (see the README).
  */
  var core: f32 =lev * lev;
  core = core * core;
  col += uC_hot * core * uP_core;

  col = pow(max(col, vec3f(0.0)), vec3f(uP_contrast));

  // dome shading keeps the ball a ball under the web
  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.72))), 0.0, 1.0);
  col *= 0.35 + uP_light * lambert;

  // fresnel sheen: the glaze the threads are crazed into, and the thing
  // that keeps the limb reading as a surface where the cells have
  // compressed past resolving
  var fres: f32 =1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: the user's voice tightens the knots, the agent's
  // thickens the threads and brightens them.
  latticePole = uP_pole * (1.0 + 0.8 * uInput);
  latticeSharp = uP_sharp * (1.0 - 0.25 * uOutput);
  latticeGain = uP_gain * (0.85 + 0.4 * uOutput);

  var mask: f32 = smoothstep(0.012, -0.012, length(uv) - max(uP_radius, 0.001));

  // Nothing outside the silhouette is ever visible, so skip AA * AA warps
  // for it rather than shading transparent sky.
  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  var col: vec3f = vec3f(0.0);
  col = latticeRender(fragCoord);

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see orb-31).
  var a: f32 = mask;
  return vec4f(max(col, vec3f(0.0)) * a, a);
}
`;

export const orb26Orb: OrbVariant = {
  key: "orb-26",
  label: "ORB-26",
  note: "a crazed web of coloured threads knotted to a cell grid",
  frag: LATTICE_FRAG,
  params: [
    {
      default: 0.4,
      integrate: true,
      key: "speed",
      label: "Boil",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.07,
      integrate: true,
      key: "swirl",
      label: "Swirl",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.18,
      integrate: true,
      key: "drift",
      label: "Crazing drift",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 0.9,
      key: "radius",
      label: "Radius",
      max: 3,
      min: 0.15,
      step: 0.015,
    },
    {
      default: 9,
      key: "scale",
      label: "Cell scale",
      max: 20,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.25,
      key: "bulge",
      label: "Dome bulge",
      max: 4,
      min: 0,
      step: 0.02,
    },
    { default: 0.85, key: "warp", label: "Warp", max: 3, min: 0, step: 0.02 },
    {
      default: 0.25,
      key: "pole",
      label: "Knot strength",
      max: 2,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.012,
      key: "poleSoft",
      label: "Knot size",
      max: 1,
      min: 0.001,
      step: 0.001,
    },
    {
      default: 0.35,
      key: "pulse",
      label: "Cell breathing",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 4.5,
      key: "sharp",
      label: "Thread width",
      max: 20,
      min: 0.3,
      step: 0.05,
    },
    {
      default: 0.045,
      key: "split",
      label: "Chromatic split",
      max: 1,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.45,
      key: "core",
      label: "Hot core",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.9,
      key: "floor",
      label: "Body fill",
      max: 3,
      min: 0,
      step: 0.01,
    },
    {
      default: 1,
      key: "gain",
      label: "Brightness",
      max: 5,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1.35,
      key: "contrast",
      label: "Contrast",
      max: 10,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 0.7,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.45,
      key: "rim",
      label: "Rim sheen",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  /*
   * Four stops: the glaze the web is crazed into, the two ends of the thread
   * ramp, and the fresnel sheen. The chromatic split runs the threads apart
   * into three filaments on its own, so the palette only has to set the mood.
   */
  colors: [
    { default: "#111a2e", key: "deep", label: "Glaze" },
    { default: "#3fd2ff", key: "line", label: "Thread" },
    { default: "#fff4d6", key: "hot", label: "Hot thread" },
    { default: "#a9d8ff", key: "sheen", label: "Sheen" },
  ],
  /*
    Staged on the pole, which is this orb's loudest control: knot strength
    decides whether the field flows past the lattice or tears itself around
    it. Thread width is the second lever, and the two integrated clocks —
    boil and roll — carry the tempo.
  */
  statePresets: {
    /*
      at rest: slow boil, threads fine — on a dome bulged nearly all the
      way and the warp pushed to more than double, so the field wraps hard
      around the ball. The knots are halved in strength and pinched to the
      smallest size, the hot core is run up five times and the body fill
      cut to a third: a dark ball with a fierce centre.
    */
    idle: KNOT_REST,
    /*
      searching: the rest look, set MOVING. The boil runs at nearly two and
      a half times idle, the swirl four times and the drift three, so the
      web migrates over the glaze instead of sitting on it. The knots come
      up a third but breathe less, the threads soften a touch on a tighter
      split, and the contrast is pushed — busier, but no brighter.
    */
    thinking: {
      ...KNOT_REST,
      contrast: 1.6,
      drift: 0.51,
      floor: 0.28,
      pole: 0.18,
      pulse: 0.22,
      sharp: 3.6,
      speed: 1,
      split: 0.03,
      swirl: 0.3,
    },
    /*
      answering: the web goes FAST and FLOODS. The boil runs at six times
      thinking and the drift more than three, the knots breathe at their
      deepest, and the threads spread to their softest, so the ridges bloom
      into broad light. The dome is flattened back toward the default and
      the warp relaxed to a third of rest, with the cell scale nudged up;
      the core is halved from rest, but the fill, gain and contrast all
      come up — the brightest, busiest state.
    */
    speaking: {
      bulge: 0.78,
      contrast: 1.95,
      core: 1.08,
      drift: 1.74,
      floor: 0.48,
      gain: 1.3,
      pole: 0.195,
      poleSoft: 0.001,
      pulse: 1.39,
      scale: 11,
      sharp: 2.1,
      speed: 6.45,
      split: 0.045,
      swirl: 0.555,
      warp: 0.76,
    },
  },
  // one palette, cold cyan porcelain, across all three states — unlike the
  // sibling orbs, this one tells its states apart by the knots and the
  // tempo alone, not by colour
  stateColors: {
    idle: KNOT_PALETTE,
    speaking: KNOT_PALETTE,
    thinking: KNOT_PALETTE,
  },
};

export type Orb26Props = Omit<ShaderOrbProps, "variant">;

export function Orb26({ size = 280, ...rest }: Orb26Props) {
  return <ShaderOrb variant={orb26Orb} size={size} {...rest} />;
}

export default Orb26;

"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const CREASE_FRAG = `
const OCTAVES: i32 = 8;
const AA: i32 = 2;
// Volume-reactive values, resolved once per fragment in main().
var<private> creaseWarp: f32;
var<private> creaseGain: f32;

/*
  The whole chain for one pixel centre: dome, stereographic wrap, then the
  eight-octave warp. Called three times per sample so the derivative below
  can be differenced — see the header for why fwidth is unavailable.
*/
fn creaseField(fragCoord: vec2f, t: f32, drift: f32, sw: f32) -> vec2f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var pl: vec2f = uv / max(uP_radius, 0.001);
  var z: f32 =sqrt(max(1.0 - dot(pl, pl), 0.0));

  var p: vec2f = pl / (z + 1.0 + uP_bulge) * uP_scale;
  p = mat2x2f(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;
  p += drift;

  /*
    The listing's matrix, decomposed. mat2x2f(vec2f(6, -8), vec2f(8, 6))/9 is exactly
    (10/9) * mat2x2f(vec2f(.6, -.8), vec2f(.8, .6)), and that second factor is a true rotation
    because 6-8-10 is a Pythagorean triple — so the octave transform is a
    rotation through the 3-4-5 angle times a clean zoom, with the zoom
    pulled out as a slider.
  */
  for (var i: i32 =0; i < OCTAVES; i = i + 1) {
    var fi: f32 =f32(i) + 1.0;
    p += sin(p + t + fi) * creaseWarp;
    p = uP_zoom * (mat2x2f(vec2f(0.6, -0.8), vec2f(0.8, 0.6)) * p);
  }

  return p;
}

fn creaseRender(fragCoord: vec2f) -> vec3f {
  var t: f32 =uP_speed;      // integrated clock: the boil
  var drift: f32 =uP_drift;  // integrated clock: the slow travel
  var sw: f32 =uP_swirl;     // integrated clock

  /*
    The three taps the difference needs. uP_blur is how far apart they sit:
    at one pixel this is fwidth exactly, and wider is a deliberate blur —
    the derivative of a folded field is a hairline, and a rim wants width.
  */
  var p0: vec2f = creaseField(fragCoord, t, drift, sw);
  var px: vec2f = creaseField(fragCoord + vec2f(uP_blur, 0.0), t, drift, sw);
  var py: vec2f = creaseField(fragCoord + vec2f(0.0, uP_blur), t, drift, sw);

  /*
    fwidth, by hand and once per channel. The sum of the absolute
    differences on each axis is exactly what the built-in returns — but
    taking it three times at slightly offset ripple phases puts each
    channel's rim in a slightly different place, which is where the warm
    and cool fringes on the edges come from. One field evaluation still
    serves all three.
  */
  var e: vec3f;
  for (var c: i32 =0; c < 3; c = c + 1) {
    var ph: f32 =f32(c) * uP_fringe;
    var v0: vec2f = sin(p0 * uP_ripple + ph);
    var d: vec2f = abs(sin(px * uP_ripple + ph) - v0)
           + abs(sin(py * uP_ripple + ph) - v0);
    var m: f32 =tanh1(length(d) * creaseGain / max(uP_exposure, 0.001));
    if (c == 0) { e.r = m; }
    else if (c == 1) { e.g = m; }
    else { e.b = m; }
  }

  e = pow(clamp(e, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  var col: vec3f = uC_tint * e;

  // a dark body under the filigree, so the flat regions read as the ball
  col += uC_body * uP_floorLevel;

  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);

  // dome shading keeps the ball a ball under the folds
  var pl: vec2f = ((2.0 * fragCoord - uRes) / min(uRes.x, uRes.y)) / max(uP_radius, 0.001);
  var z: f32 =sqrt(max(1.0 - dot(pl, pl), 0.0));
  var n: vec3f = vec3f(pl, z);
  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.72))), 0.0, 1.0);
  col *= 0.62 + uP_light * lambert;

  var fres: f32 =1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: the user's voice folds the field harder, the agent's
  // steepens what counts as a crease.
  creaseWarp = uP_warp * (1.0 + 0.4 * uInput);
  creaseGain = uP_edgeGain * (1.0 + 0.5 * uOutput);

  var duv: vec2f = orbUV();
  var mask: f32 =smoothstep(0.012, -0.012, length(duv) - max(uP_radius, 0.001));

  // Twenty-four warp steps per sample — none of them worth paying for
  // outside the silhouette.
  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  var col: vec3f = vec3f(0.0);
  col = creaseRender(fragCoord);

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(max(col, vec3f(0.0)) * a, a);
}
`;

export const orb25Orb: OrbVariant = {
  key: "orb-25",
  label: "ORB-25",
  note: "the folds of a warped field, drawn by their own steepness",
  frag: CREASE_FRAG,
  params: [
    {
      default: 3,
      integrate: true,
      key: "speed",
      label: "Boil",
      max: 20,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.6,
      integrate: true,
      key: "drift",
      label: "Drift",
      max: 8,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.05,
      integrate: true,
      key: "swirl",
      label: "Swirl",
      max: 3,
      min: 0,
      step: 0.015,
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
      default: 7.5,
      key: "scale",
      label: "Cell scale",
      max: 60,
      min: 0.3,
      step: 0.1,
    },
    {
      default: 0.3,
      key: "bulge",
      label: "Dome bulge",
      max: 4,
      min: 0,
      step: 0.02,
    },
    { default: 0.4, key: "warp", label: "Fold", max: 2, min: 0, step: 0.01 },
    {
      default: 1.111,
      key: "zoom",
      label: "Octave zoom",
      max: 2,
      min: 0.6,
      step: 0.005,
    },
    {
      default: 0.3,
      key: "ripple",
      label: "Ripple",
      max: 3,
      min: 0.02,
      step: 0.01,
    },
    {
      default: 10,
      key: "edgeGain",
      label: "Edge gain",
      max: 60,
      min: 0.5,
      step: 0.5,
    },
    {
      default: 2.5,
      key: "blur",
      label: "Rim width",
      max: 12,
      min: 0.5,
      step: 0.25,
    },
    {
      default: 0.09,
      key: "fringe",
      label: "Chromatic fringe",
      max: 1.5,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.8,
      key: "exposure",
      label: "Exposure",
      max: 40,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1.15,
      key: "contrast",
      label: "Contrast",
      max: 8,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 1.5,
      key: "saturation",
      label: "Saturation",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.16,
      key: "floorLevel",
      label: "Body fill",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.35,
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
  colors: [
    { default: "#dbe8f7", key: "tint", label: "Rim" },
    { default: "#0d1118", key: "body", label: "Body" },
    { default: "#a8c8f0", key: "sheen", label: "Sheen" },
  ],
  /*
    Staged on the FOLD, which is what makes creases exist at all, and on
    edge gain, which decides how steep a slope has to be to count as one.
    Cell scale moves only for the answer — it sets how much pattern is on
    the ball, and as it glides in the ball reads as inflating; that is the
    answer's entrance.
  */
  statePresets: {
    // at rest: a slow boil, folds moderate, rims clean — the octave zoom
    // pulled in a touch under the default and the edge gain a quarter up,
    // so slightly gentler slopes count as creases
    idle: {
      contrast: 1.15,
      drift: 0.6,
      edgeGain: 12.5,
      exposure: 0.8,
      speed: 3,
      swirl: 0.05,
      warp: 0.4,
      zoom: 1.07,
    },
    /*
      searching: the folds RELAX a touch below idle, but the edge gain
      nearly triples so even the shallowest slope lights up as a crease,
      on a boil half again idle's. The ripple tightens, the rim widens with
      more than double the chromatic fringe, and the saturation, key light
      and rim sheen all come up — every cell rims at once in colour, and
      none of it settles.
    */
    thinking: {
      blur: 2.75,
      bulge: 0.38,
      contrast: 1.5,
      drift: 0.15,
      edgeGain: 33,
      exposure: 0.55,
      fringe: 0.2,
      light: 0.525,
      rim: 0.69,
      ripple: 0.18,
      saturation: 2,
      speed: 4.7,
      swirl: 0.02,
      warp: 0.34,
      zoom: 1.12,
    },
    /*
      answering: the field FOLDS hardest of the three and the gain drops to
      under a sixth of the thinking state, so the creases are deep but only
      the steepest rims light. The cell scale is pushed past idle's and the
      dome bulged to near a hemisphere, the swirl opened an order of
      magnitude, the ripple widened — a slow, heavy, swirling boil, with
      the exposure tripled so what does light, burns.
    */
    speaking: {
      blur: 2,
      bulge: 2.22,
      contrast: 1.35,
      drift: 0.8,
      edgeGain: 5,
      exposure: 2.35,
      fringe: 0.23,
      ripple: 1.18,
      scale: 11.5,
      speed: 1.4,
      swirl: 0.6,
      warp: 1.55,
      zoom: 0.945,
    },
  },
  // cool steel at rest, cold indigo for both working states — the answer
  // is told apart by its fold and scale, not its colour
  stateColors: {
    idle: { body: "#0d1118", sheen: "#a8c8f0", tint: "#dbe8f7" },
    speaking: { body: "#090d1c", sheen: "#8fb4f2", tint: "#c2d6f5" },
    thinking: { body: "#090d1c", sheen: "#8fb4f2", tint: "#c2d6f5" },
  },
};

export type Orb25Props = Omit<ShaderOrbProps, "variant">;

export function Orb25({ size = 280, ...rest }: Orb25Props) {
  return <ShaderOrb variant={orb25Orb} size={size} {...rest} />;
}

export default Orb25;

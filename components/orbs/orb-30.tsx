"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const DROSTE_FRAG = `
const AA: i32 = 2;
// Volume-reactive values, resolved once per fragment in main().
var<private> drosteHaze: f32;
var<private> drosteCloud: f32;
var<private> drosteBloom: f32;

/*
  Arc length around the unit square, in [0,8), counter-clockwise from the
  bottom-right corner — two units per face. Continuous everywhere except
  its single wrap, which lands on a corner.
*/
fn squareArc(q: vec2f) -> f32 {
  if (abs(q.x) >= abs(q.y)) {
    if (q.x > 0.0) { return q.y + 1.0; }
    return 5.0 - q.y;
  }
  if (q.y > 0.0) { return 3.0 - q.x; }
  return 7.0 + q.x;
}

/*
  Flower colour by hash: mostly white daisies, then the planted warm, then
  the cornflower blues — which reuse the SKY colour rather than adding a
  sixth stop, because that is what keeps them reading as part of the same
  picture instead of as confetti thrown over it.
*/
fn drosteFlower(h: f32) -> vec3f {
  var c: vec3f = uC_cloud;
  c = mix(c, uC_bloom, step(0.52, h));
  c = mix(c, uC_sky, step(0.86, h));
  return c;
}

fn drosteRender(fragCoord: vec2f) -> vec3f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var R: f32 =max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  var pl: vec2f = uv / R;
  var z: f32 =sqrt(max(1.0 - dot(pl, pl), 0.0));

  var fall: f32 =uP_fall;   // integrated clock: the flight inward
  var drift: f32 =uP_drift; // integrated clock: weather

  /*
    The frame tilt is a STATIC angle, not an integrated clock like the roll
    every other orb here gets. Those clocks seed at a random phase per
    mount, which is exactly right for a field with no preferred direction
    and exactly wrong for a picture: it lands the sky down one side of the
    ball and the meadow up the other. This one has an up.
  */
  var sw: f32 =uP_tilt;

  // stereographic wrap — the tunnel is inside the ball, and compresses
  // toward the limb the way a texture on a sphere does
  var p: vec2f = pl / (z + 1.0 + uP_bulge) * uP_scale;
  p = mat2x2f(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;

  /*
    The Chebyshev norm makes the level sets SQUARES. The floor on it is
    what keeps the logarithm finite at the dead centre; the haze below
    covers that last pixel anyway.
  */
  var m: f32 =max(max(abs(p.x), abs(p.y)), 0.002);

  var K: f32 =max(uP_ratio, 1.05);
  var L: f32 =log2(m) / log2(K) + fall;

  var q: vec2f = p / m;                 // direction, on the unit square boundary
  var sm: f32 =pow(K, fract(L));    // this fragment's radius in base-frame units
  var P: vec2f = q * sm;                // where it lands in the base picture

  var Yn: f32 =P.y / K;             // picture height, about -1 at the bottom edge
  var arc: f32 =squareArc(q);       // distance around the frame

  // ---- sky -----------------------------------------------------------
  var col: vec3f = mix(uC_sky * 0.72, uC_sky, clamp(Yn * 1.3, 0.0, 1.0));

  /*
    Cloud and land are both read in BASE-PICTURE coordinates, so every
    frame carries the same weather at its own scale — which is the whole
    point of a picture that contains itself.
  */
  var skyMask: f32 =smoothstep(uP_horizon - 0.3, uP_horizon + 0.2, Yn);
  var cl: f32 =fbm(P * uP_cloudScale + vec2f(drift, drift * 0.3));
  cl = smoothstep(drosteCloud, drosteCloud + 0.16, cl);
  col = mix(col, uC_cloud, cl * (0.2 + 0.8 * skyMask));

  // ---- land ----------------------------------------------------------
  /*
    The smear. Sampled on (distance around the frame, frame index) with a
    low frequency on the second axis, so features run LONG in the
    direction the recursion stretches them — the streaked walls of the
    reference, straight out of the geometry.
  */
  var streak: f32 =fbm(vec2f(arc * uP_streakFreq, L * uP_streakRad));

  var land: vec3f = mix(uC_canopy, uC_meadow, smoothstep(0.02, -0.62, Yn));
  land *= 0.42 + 1.25 * streak;

  // water: the low ground holds it where the streak field pools
  var water: f32 =smoothstep(0.42, 0.16, streak) * smoothstep(0.05, -0.3, Yn);
  land = mix(land, uC_water, water * uP_water);

  /*
    Flowers, hashed one to a cell on the same (around, index) grid, jittered
    inside it. Densest low in the picture and gone by the horizon.
  */
  var fg: vec2f = vec2f(arc * uP_flowerScale, L * uP_flowerScale * 0.3);
  var fc: vec2f = floor(fg);
  var ff: vec2f = fract(fg) - 0.5;
  var dcv: vec2f = ff - (vec2f(hash(fc + 3.7), hash(fc + 19.1)) - 0.5) * 0.6;
  var petal: f32 =smoothstep(uP_flowerSize, uP_flowerSize * 0.35, length(dcv));
  var present: f32 =step(1.0 - drosteBloom, hash(fc + 51.3));
  var meadow: f32 =smoothstep(0.13, -0.38, Yn);
  land = mix(land, drosteFlower(hash(fc + 7.9)), petal * present * meadow);

  var landMask: f32 =1.0 - smoothstep(uP_horizon - 0.12, uP_horizon + 0.16, Yn);
  col = mix(col, land, landMask);

  /*
    The picture's own edge. Darkening across the frame and resetting hard
    at its boundary is not an artefact to smooth away — it draws the
    nested borders the reference is built out of.
  */
  col *= mix(1.0, uP_frameShade, fract(L));

  /*
    Aerial perspective, from the SCREEN radius. Every frame has the same
    fractional part, so depth cannot come from inside a frame — it has to
    come from how far in the fragment sits. This is what makes the middle
    read as far away instead of merely small.
  */
  var deep: f32 =1.0 - smoothstep(0.0, uP_hazeRange, m);
  col = mix(col, uC_sky, deep * drosteHaze);

  col = pow(max(col, vec3f(0.0)), vec3f(uP_contrast)) * uP_gain;

  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);

  // dome shading, kept light — this is a window, not a lit surface
  var n: vec3f = vec3f(pl, z);
  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.72))), 0.0, 1.0);
  col *= 0.72 + uP_light * lambert;

  // the glass: a strong fresnel is what turns a picture into a sphere
  // with a world inside it
  var fres: f32 =1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: the user's voice thickens the weather, the agent's
  // clears the haze and brings the meadow into flower.
  drosteCloud = clamp(uP_cloudCover - 0.12 * uInput, 0.02, 0.98);
  drosteHaze = uP_haze * (1.0 - 0.25 * uOutput);
  drosteBloom = clamp(uP_flowerDensity * (1.0 + 0.5 * uOutput), 0.0, 1.0);

  var mask: f32 = smoothstep(0.012, -0.012, length(uv) - max(uP_radius, 0.001));

  // Two fbm evaluations and a flower grid per sample — none of it worth
  // paying for outside the silhouette.
  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  var col: vec3f = vec3f(0.0);
  col = drosteRender(fragCoord);

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see orb-31).
  var a: f32 = mask;
  return vec4f(max(col, vec3f(0.0)) * a, a);
}
`;

export const orb30Orb: OrbVariant = {
  key: "orb-30",
  label: "ORB-30",
  note: "a meadow folding into itself toward a blue vanishing point",
  frag: DROSTE_FRAG,
  params: [
    {
      default: 0.12,
      integrate: true,
      key: "fall",
      label: "Fall speed",
      max: 4,
      min: 0,
      step: 0.01,
    },
    {
      default: 0,
      key: "tilt",
      label: "Frame tilt",
      max: 1.6,
      min: -1.6,
      step: 0.01,
    },
    {
      default: 0.2,
      integrate: true,
      key: "drift",
      label: "Weather drift",
      max: 4,
      min: 0,
      step: 0.02,
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
      default: 4.5,
      key: "scale",
      label: "Tunnel scale",
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
    {
      default: 1.8,
      key: "ratio",
      label: "Frame ratio",
      max: 6,
      min: 1.1,
      step: 0.02,
    },
    {
      default: 0.14,
      key: "horizon",
      label: "Horizon",
      max: 0.9,
      min: -0.9,
      step: 0.01,
    },
    {
      default: 1.6,
      key: "cloudScale",
      label: "Cloud scale",
      max: 8,
      min: 0.1,
      step: 0.05,
    },
    {
      default: 0.46,
      key: "cloudCover",
      label: "Cloud cover",
      max: 0.98,
      min: 0.02,
      step: 0.01,
    },
    {
      default: 5,
      key: "streakFreq",
      label: "Wall detail",
      max: 20,
      min: 0.2,
      step: 0.1,
    },
    {
      default: 0.5,
      key: "streakRad",
      label: "Smear",
      max: 4,
      min: 0.02,
      step: 0.02,
    },
    { default: 0.7, key: "water", label: "Water", max: 1, min: 0, step: 0.01 },
    {
      default: 44,
      key: "flowerScale",
      label: "Flower scale",
      max: 120,
      min: 2,
      step: 1,
    },
    {
      default: 0.55,
      key: "flowerDensity",
      label: "Flower density",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.26,
      key: "flowerSize",
      label: "Flower size",
      max: 0.6,
      min: 0.05,
      step: 0.01,
    },
    {
      default: 0.62,
      key: "frameShade",
      label: "Frame shading",
      max: 1.4,
      min: 0.2,
      step: 0.01,
    },
    {
      default: 0.85,
      key: "haze",
      label: "Aerial haze",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.09,
      key: "hazeRange",
      label: "Haze reach",
      max: 1.5,
      min: 0.005,
      step: 0.005,
    },
    {
      default: 1.05,
      key: "gain",
      label: "Brightness",
      max: 4,
      min: 0.05,
      step: 0.02,
    },
    {
      default: 1.05,
      key: "contrast",
      label: "Contrast",
      max: 10,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 1.1,
      key: "saturation",
      label: "Saturation",
      max: 4,
      min: 0,
      step: 0.02,
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
      default: 0.55,
      key: "rim",
      label: "Rim sheen",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  /*
   * Six stops, and they are the picture rather than a palette: the sky the
   * recursion closes on, its cloud, the dark canopy, the meadow under the
   * flowers, the planted warm colour, and the glass.
   */
  colors: [
    { default: "#4a92e0", key: "sky", label: "Sky" },
    { default: "#f7fbff", key: "cloud", label: "Cloud" },
    { default: "#12401f", key: "canopy", label: "Canopy" },
    { default: "#5aa63a", key: "meadow", label: "Meadow" },
    { default: "#156f6a", key: "water", label: "Water" },
    { default: "#ff6a3a", key: "bloom", label: "Bloom" },
    { default: "#cfe6ff", key: "sheen", label: "Sheen" },
  ],
  /*
    Staged on the fall, which is the orb's whole subject, and on the haze,
    which decides how far into the recursion the eye can see. Frame ratio
    sets how many frames land on the ball; it differs only for idle, and
    the glide out of rest reads as the tunnel breathing once.
  */
  statePresets: {
    /*
      at rest: a slow fall, deep haze, weather barely moving — on a frame
      ratio nearly double the working states, so fewer, larger frames land
      on the ball, with the horizon dropped below centre. The wall detail
      is coarsened to a broad smear, the water drained entirely, and the
      meadow thinned to sparse, oversized flowers; brighter, and more
      saturated, than the states it falls into.
    */
    idle: {
      bulge: 0.2,
      cloudCover: 0.42,
      cloudScale: 1.2,
      drift: 0.2,
      fall: 0.12,
      flowerDensity: 0.27,
      flowerScale: 24,
      flowerSize: 0.43,
      gain: 1.38,
      haze: 0.8,
      hazeRange: 0.09,
      horizon: -0.11,
      light: 0.345,
      ratio: 3.06,
      rim: 0.555,
      saturation: 1.56,
      streakFreq: 2.9,
      streakRad: 0.54,
      water: 0,
    },
    /*
      searching: the fall QUINTUPLES and the haze closes in over three
      times as far, so the recursion is swallowed within a frame or two of
      the middle — the eye is pulled down a tunnel it cannot see the end
      of. The weather thickens and the meadow goes out of flower. Lit hard
      against that: the key light nearly triples, and the gain, contrast
      and saturation all come up, so what the haze leaves is vivid.
    */
    thinking: {
      cloudCover: 0.3,
      contrast: 1.45,
      drift: 0.5,
      fall: 0.6,
      flowerDensity: 0.28,
      gain: 1.42,
      haze: 1,
      hazeRange: 0.3,
      light: 0.96,
      saturation: 2,
    },
    /*
      answering: the fall goes FASTEST of the three — twelve times idle —
      on a drift five times as quick and a tunnel nearly doubled in scale,
      with the frames given a slight tilt. The haze lifts to less than half
      idle over a longer reach, opening the recursion to the vanishing
      point; the walls go to fine, wide-smeared detail, the clouds scale up
      threefold, and the meadow comes fully into flower on larger blooms.
      Lit and saturated hardest of the three.
    */
    speaking: {
      cloudCover: 0.44,
      cloudScale: 3.65,
      contrast: 1.45,
      drift: 1.54,
      fall: 1.47,
      flowerDensity: 0.95,
      flowerScale: 32,
      gain: 1.36,
      haze: 0.38,
      hazeRange: 0.315,
      horizon: 0.03,
      light: 0.57,
      saturation: 2.32,
      scale: 8.7,
      streakFreq: 11,
      streakRad: 1.48,
      tilt: 0.03,
    },
  },
  // the picture keeps its own colours; the states move the weather and the
  // light, cooling toward overcast while searching and warming while
  // answering
  stateColors: {
    idle: {
      bloom: "#ff6a3a",
      canopy: "#12401f",
      cloud: "#f7fbff",
      meadow: "#5aa63a",
      sheen: "#cfe6ff",
      sky: "#4a92e0",
      water: "#156f6a",
    },
    speaking: {
      bloom: "#ffb02e",
      canopy: "#204a16",
      cloud: "#fff6e8",
      meadow: "#7cc23f",
      sheen: "#ffe3c4",
      sky: "#6fb0ec",
      water: "#1d8a76",
    },
    thinking: {
      bloom: "#7d8cff",
      canopy: "#0e2c2e",
      cloud: "#dde8f4",
      meadow: "#3f7f5c",
      sheen: "#b6cdf0",
      sky: "#3f6fa8",
      water: "#12525f",
    },
  },
};

export type Orb30Props = Omit<ShaderOrbProps, "variant">;

export function Orb30({ size = 280, ...rest }: Orb30Props) {
  return <ShaderOrb variant={orb30Orb} size={size} {...rest} />;
}

export default Orb30;

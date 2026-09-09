"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const NACRE_FRAG = `
const OCTAVES: i32 = 10;
const AA: i32 = 2;
const TAU: f32 = 6.28318530718;

// The listing's +r, minus the resolution dependence (see the header).
const SEED: vec2f = vec2f(4.7, 2.3);

// Volume-reactive values, resolved once per fragment in main().
var<private> nacreWarp: f32;
var<private> nacreThick: f32;
var<private> nacreGain: f32;

/*
  The listing's entire tone map: o = tanh(.2 / tan(x)); o *= o.

  The square folds the sign, so abs() on the denominator is not an
  approximation here — it is exact, and it removes the branch.
*/
fn cotBands(x: vec3f, k: f32) -> vec3f {
  var b: vec3f = tanh3(k * cos(x) / max(abs(sin(x)), vec3f(1e-4)));
  return b * b;
}

fn nacreRender(fragCoord: vec2f) -> vec3f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var R: f32 =max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  var pl: vec2f = uv / R;
  var z: f32 =sqrt(max(1.0 - dot(pl, pl), 0.0));
  var n: vec3f = vec3f(pl, z);

  var t: f32 =uP_speed; // integrated clock: the boil

  /*
    Stereographic projection, on the UNROTATED dome. Equal steps in screen
    space map to ever-larger steps in pattern space toward the rim, which
    is the foreshortening that sells a flat field as wrapped geometry.
    uP_bulge softens the divisor — higher flattens the shell back toward a
    disc, lower crowds the layers into the limb.
  */
  var p: vec2f = n.xy / (n.z + 1.0 + uP_bulge) * uP_scale;

  // projection-safe 2D motion, in place of a dome spin: the plane turns,
  // and the bands travel across themselves
  var sw: f32 =uP_swirl; // integrated clock
  p = mat2x2f(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;
  p.y -= uP_flow;      // integrated clock

  /*
    The ten-octave feedback warp. q is fed back into itself with the
    components swapped, so each octave curls what the last one drew.
  */
  var q: vec2f = p;
  for (var j: i32 =0; j < OCTAVES; j = j + 1) {
    var i: f32 =f32(j) + 1.0;
    q += nacreWarp * sin(q.yx * i + i * i + t * i + SEED) / i;
  }

  // the bands, with the listing's uneven per-channel phase kept as a ratio
  // so one slider widens the whole split
  var band: vec3f = cotBands(vec3f(q.y) + vec3f(0.0, 1.0, 3.0) * uP_split, nacreThick);
  var lev: f32 =dot(band, vec3f(1.0 / 3.0));

  /*
    A dark body colour under the bands, so the valleys read as the shell
    itself rather than as holes punched through the ball. The band term
    stays PER-CHANNEL through the palette multiply — that is what carries
    the colour fringing; collapsing it to lev first would throw away the
    only thing the vec4f phase was for.
  */
  var col: vec3f = uC_deep * uP_floor;
  col += band * mix(uC_low, uC_crest, smoothstep(0.1, 0.9, lev)) * nacreGain;

  /*
    Thin-film interference. The cosine palette is keyed to the band
    coordinate, so every layer carries its own hue — the inside of a shell
    — and uP_view rotates that hue with the viewing angle through 1 - z,
    which means the sphere's curvature is doing the colouring. Multiplied
    in rather than mixed to, so it bends hues without erasing the palette.
  */
  var irid: vec3f = 0.5 + 0.5 * cos(TAU * (q.y * uP_irisScale + (1.0 - z) * uP_view + t * 0.03 + vec3f(0.0, 0.33, 0.67)));
  col = mix(col, col * (0.25 + 1.9 * irid), uP_iris);

  col = pow(max(col, vec3f(0.0)), vec3f(uP_contrast));

  // dome shading keeps the ball a ball under the pattern
  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.72))), 0.0, 1.0);
  col *= 0.35 + uP_light * lambert;

  // fresnel sheen: the wet gloss of a shell, and the thing that keeps the
  // limb reading as a surface where the bands have compressed to a blur
  var fres: f32 =1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  /*
    The BEAT: warp driven between 0.6 and 1.8 on a slow, unbroken cycle —
    one full swing every second and a third — with nothing held at either
    end. Warp is the amplitude of the octave loop that folds the bands, so
    sweeping it three to one makes the whole field draw in and open again
    rather than change colour or brightness — a swell, not a flash.

    Absolute bounds, so the range is exactly the range; that is why the mix
    sits outside the volume term below. At beat zero nothing here applies
    and the dialled warp stands, so a state that does not ask for it is
    untouched.

    Well under 3Hz, which matters: above that a full-field oscillation is
    in the band photosensitivity guidance warns about, and this one covers
    the whole ball. The rate is the constant below — raising it much past
    18 walks back into that range.
  */
  var beat: f32 =0.5 - 0.5 * cos(uAnim * 5.0);

  // Volume coupling: the user's voice churns the warp harder, the agent's
  // widens the crests and brightens them.
  nacreWarp = mix(uP_warp * (1.0 + 0.45 * uInput), mix(0.6, 1.8, beat), uP_beat);
  nacreThick = uP_thick * (1.0 + 0.6 * uOutput);
  nacreGain = uP_gain * (0.85 + 0.4 * uOutput);

  // the mask uses the orb-space uv handed in by the entry point
  var mask: f32 =smoothstep(0.012, -0.012, length(uv) - max(uP_radius, 0.001));

  // Nothing outside the silhouette is ever visible, so skip AA * AA warps
  // for it rather than shading transparent sky.
  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  var col: vec3f = vec3f(0.0);
  col = nacreRender(fragCoord);

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(max(col, vec3f(0.0)) * a, a);
}
`;

export const orb08Orb: OrbVariant = {
  colors: [
    { default: "#0d1430", key: "deep", label: "Shell body" },
    { default: "#2fb8c6", key: "low", label: "Dim layer" },
    { default: "#fff1de", key: "crest", label: "Bright layer" },
    { default: "#bfe4ff", key: "sheen", label: "Sheen" },
  ],
  frag: NACRE_FRAG,
  key: "orb-08",
  label: "ORB-08",
  note: "mother-of-pearl contour bands, each layer its own hue",
  params: [
    {
      default: 0.35,
      integrate: true,
      key: "speed",
      label: "Boil",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.25,
      integrate: true,
      key: "flow",
      label: "Band drift",
      max: 5,
      min: 0,
      step: 0.03,
    },
    {
      default: 0.06,
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
      default: 5.5,
      key: "scale",
      label: "Pattern scale",
      max: 20,
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
    { default: 1, key: "warp", label: "Warp", max: 3, min: 0, step: 0.02 },
    { default: 0, key: "beat", label: "Warp beat", max: 1, min: 0, step: 0.01 },
    {
      default: 0.2,
      key: "thick",
      label: "Band width",
      max: 2,
      min: 0.02,
      step: 0.01,
    },
    {
      default: 0.1,
      key: "split",
      label: "Chromatic split",
      max: 1,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.7,
      key: "iris",
      label: "Iridescence",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.315,
      key: "irisScale",
      label: "Iridescence scale",
      max: 2,
      min: 0,
      step: 0.005,
    },
    {
      default: 1.34,
      key: "view",
      label: "Angle shift",
      max: 3,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.8,
      key: "floor",
      label: "Body fill",
      max: 3,
      min: 0,
      step: 0.01,
    },
    {
      default: 1.1,
      key: "gain",
      label: "Brightness",
      max: 5,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1.15,
      key: "contrast",
      label: "Contrast",
      max: 10,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 0.75,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.5,
      key: "rim",
      label: "Rim sheen",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  stateColors: {
    idle: {
      crest: "#fff1de",
      deep: "#0d1430",
      low: "#2fb8c6",
      sheen: "#bfe4ff",
    },
    speaking: {
      crest: "#fff0c9",
      deep: "#2a0f22",
      low: "#ff7a4d",
      sheen: "#ffc9a8",
    },
    thinking: {
      crest: "#dfe8ff",
      deep: "#0a0f2c",
      low: "#6f7cff",
      sheen: "#9fd0ff",
    },
  },

  statePresets: {
    idle: {
      bulge: 0.8,
      contrast: 1.65,
      floor: 0.57,
      flow: 0.24,
      gain: 2.45,
      iris: 1.02,
      rim: 0.495,
      speed: 0.37,
      split: 0.1,
      swirl: 0.06,
      thick: 0.54,
      warp: 0.96,
    },
    speaking: {
      beat: 1,
      contrast: 0.78,
      flow: 2.49,
      gain: 1.75,
      iris: 0.45,
      speed: 2,
      split: 0.3,
      swirl: 0.18,
      thick: 0.27,
      warp: 1.84,
    },
    thinking: {
      contrast: 1.65,
      floor: 0.77,
      flow: 0.06,
      gain: 0.85,
      iris: 1.89,
      irisScale: 0.26,
      rim: 0.495,
      speed: 1.61,
      split: 0.3,
      swirl: 0.015,
      thick: 0.54,
      view: 1.21,
      warp: 1.56,
    },
  },
};

export type Orb08Props = Omit<ShaderOrbProps, "variant">;

export const Orb08 = ({ size = 280, ...rest }: Orb08Props) => (
  <ShaderOrb variant={orb08Orb} size={size} {...rest} />
);

export default Orb08;

"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from "./orbkit-core-wgpu";
import type { OrbVariant, ShaderOrbProps } from "./orbkit-core-wgpu";

const FOAM_FRAG = `
const AA: i32 = 2;
// Volume-reactive values, resolved once per fragment in main().
var<private> foamGrow: f32;
var<private> foamJitter: f32;
var<private> foamGain: f32;

fn foamRender(fragCoord: vec2f) -> vec3f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var R: f32 =max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  var pl: vec2f = uv / R;
  var z: f32 =sqrt(max(1.0 - dot(pl, pl), 0.0));

  var t: f32 =uP_speed; // integrated clock

  // stereographic wrap of the unrotated dome, as in orb-08
  var p: vec2f = pl / (z + 1.0 + uP_bulge) * uP_scale;

  // projection-safe 2D motion: the packing turns and drifts
  var sw: f32 =uP_swirl; // integrated clock
  p = mat2x2f(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;
  p += vec2f(uP_slide, uP_slide * 0.7); // integrated clock

  var cell: vec2f = ceil(p);
  var f: vec2f = p - cell; // in (-1, 0], the fragment's place in its own cell

  /*
    The 3x3 walk, keyed on the ABSOLUTE cell index so a bead is one bead —
    see the header. Tracking the winner as well as the max costs nothing
    and is what makes the shading below possible.
  */
  var cover: f32 =0.0;
  var bestRel: f32 =1e9;
  var bestDelta: vec2f = vec2f(0.0);
  var bestRad: f32 =1.0;
  var bestId: vec2f = vec2f(0.0);

  for (var gy: i32 =-1; gy <= 1; gy = gy + 1) {
    for (var gx: i32 =-1; gx <= 1; gx = gx + 1) {
      var g: vec2f = vec2f(f32(gx), f32(gy));
      var id: vec2f = cell + g;

      /*
        The listing's generator: a dot of a cosine against a detuned,
        swizzled sine of the cell index, both carrying the clock. Mind the
        range — a dot of two 2-vectors of unit-bounded components spans
        FOUR, not two, so the listing's /6 puts radii within a third of a
        cell of the mean. Read it as half that and the largest discs
        overlap their neighbours, which is what turns a dot screen into a
        litter of merged blobs.
      */
      var rad: f32 =dot(cos(id - t), sin(id.yx * uP_skew + t)) * uP_vary + foamGrow;
      /*
        Fragment to feature point, and the signs matter more than they
        look. The disc labelled id sits at id + jitter in absolute
        coordinates, so delta = p - (id + jitter) = f - g - jitter. Write
        it as f + g and the disc's IDENTITY and its POSITION end up using
        opposite offsets: every fragment then draws disc id in a different
        place, and the field comes out as clumps of half-agreeing circles
        rather than circles.
      */
      var jit: vec2f = cos(id.yx + t) * foamJitter;
      var delta: vec2f = f - g - jit;
      var dist: f32 =length(delta);

      /*
        The union is taken over COVERAGE, not over the signed distance the
        listing maxes. Those differ exactly where two discs overlap: max of
        (radius - distance) hands the whole overlap to whichever disc wins
        and bites a straight edge out of the other, so the field comes out
        a litter of crescents and pinwheels. Max of the clamped coverage
        keeps every disc whole and merely lets overlapping ones merge.

        The x50 ramp is the listing's, and it is an edge width rather than
        a brightness: a signed distance scaled that hard and clamped is a
        hard-edged disc with about a pixel of feather.
      */
      cover = max(cover, clamp((rad - dist) * uP_edge, 0.0, 1.0));

      /*
        The winner is tracked separately, by RELATIVE depth rather than
        absolute — which disc this fragment is furthest inside, in units of
        that disc's own radius. Only the optional bead shading reads it,
        and relative depth is what keeps a small disc from being shaded as
        though it were the large one beside it.
      */
      var rel: f32 =dist / max(rad, 1e-4);
      if (rel < bestRel) {
        bestRel = rel;
        bestDelta = delta;
        bestRad = rad;
        bestId = id;
      }
    }
  }

  /*
    The bead. The winning cell's own distance and radius give the height of
    a hemisphere over the disc, and that is a normal — so the flat decal
    becomes a lit piece of glass without a second field being evaluated.
  */
  var rr: f32 =max(bestRad, 1e-4);
  var dome: f32 =clamp(1.0 - dot(bestDelta, bestDelta) / (rr * rr), 0.0, 1.0);
  var bn: vec3f = normalize(vec3f(bestDelta / rr, sqrt(dome) + 0.001));

  var key: vec3f = normalize(vec3f(-0.45, 0.55, 0.72));
  var beadLam: f32 =clamp(dot(bn, key), 0.0, 1.0);

  // per-disc colour, hashed on the cell index — near-flat at the defaults,
  // which is what keeps the field reading as a dot screen
  var beadCol: vec3f = mix(uC_low, uC_high, hash(bestId + 0.5));

  // uP_bead at 0 leaves the listing's flat disc, which is the default
  var shade: f32 =mix(1.0, 0.45 + 0.85 * beadLam, uP_bead);
  var col: vec3f = beadCol * shade * foamGain * cover;

  // a dark body under the packing, so the gaps read as the ball rather
  // than as holes in it
  col += uC_body * uP_floorLevel;

  col = pow(max(col, vec3f(0.0)), vec3f(uP_contrast));

  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);

  // dome shading keeps the ball a ball under the packing
  var n: vec3f = vec3f(pl, z);
  var lambert: f32 =clamp(dot(n, key), 0.0, 1.0);
  col *= 0.55 + uP_light * lambert;

  var fres: f32 =1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: the user's voice shakes the beads off their centres,
  // the agent's swells them and brightens the packing.
  foamGrow = uP_grow * (1.0 + 0.35 * uOutput);
  foamJitter = uP_jitter * (1.0 + 0.5 * uInput);
  foamGain = uP_gain * (0.85 + 0.4 * uOutput);

  var mask: f32 =smoothstep(0.012, -0.012, length(uv) - max(uP_radius, 0.001));

  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  var col: vec3f = vec3f(0.0);
  col = foamRender(fragCoord);

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(max(col, vec3f(0.0)) * a, a);
}
`;

export const orb19Orb: OrbVariant = {
  /*
   * Four stops: the two ends of the per-bead hash, the body the packing
   * sits on, and the glass.
   */
  colors: [
    { default: "#ffffff", key: "low", label: "Dot" },
    { default: "#eef5ff", key: "high", label: "Dot accent" },
    { default: "#05070c", key: "body", label: "Body" },
    { default: "#9dbfe4", key: "sheen", label: "Sheen" },
  ],
  frag: FOAM_FRAG,
  key: "orb-19",
  label: "ORB-19",
  note: "beads swelling and shrinking in their cells, packed over the ball",
  params: [
    {
      default: 0.5,
      integrate: true,
      key: "speed",
      label: "Anim speed",
      max: 10,
      min: 0.015,
      step: 0.05,
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
      default: 0.1,
      integrate: true,
      key: "slide",
      label: "Drift",
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
      default: 10,
      key: "scale",
      label: "Packing scale",
      max: 30,
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
    {
      default: 0.185,
      key: "grow",
      label: "Dot size",
      max: 1.2,
      min: -0.2,
      step: 0.005,
    },
    {
      default: 0.13,
      key: "vary",
      label: "Size variation",
      max: 0.4,
      min: 0,
      step: 0.005,
    },
    {
      default: 0.62,
      key: "skew",
      label: "Generator detune",
      max: 3,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.1,
      key: "jitter",
      label: "Dot wander",
      max: 1.5,
      min: 0,
      step: 0.01,
    },
    {
      default: 50,
      key: "edge",
      label: "Rim hardness",
      max: 200,
      min: 1,
      step: 1,
    },
    {
      default: 0,
      key: "bead",
      label: "Bead shading",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 1,
      key: "gain",
      label: "Brightness",
      max: 4,
      min: 0.05,
      step: 0.02,
    },
    {
      default: 1,
      key: "contrast",
      label: "Contrast",
      max: 6,
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
      default: 0.06,
      key: "floorLevel",
      label: "Body fill",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.3,
      key: "light",
      label: "Key light",
      max: 3,
      min: 0,
      step: 0.015,
    },
    {
      default: 0.35,
      key: "rim",
      label: "Rim sheen",
      max: 3,
      min: 0,
      step: 0.015,
    },
  ],
  // cool glass at rest, then pure white on black for both working states —
  // the answering one keeps the faintly warm body
  stateColors: {
    idle: {
      body: "#05070c",
      high: "#eef5ff",
      low: "#ffffff",
      sheen: "#9dbfe4",
    },
    speaking: {
      body: "#140a06",
      high: "#ffffff",
      low: "#ffffff",
      sheen: "#ffffff",
    },
    thinking: {
      body: "#000000",
      high: "#ffffff",
      low: "#dae6ff",
      sheen: "#ffffff",
    },
  },
  /*
    Staged on BEAD SIZE, which decides whether the ball is a scatter of
    separate beads or a packed foam, and on wander, which decides how far
    each one strays from its cell. Packing scale never moves between
    states — it sets the bead count, and a gliding count reads as the ball
    inflating rather than as a change of mood.
  */
  statePresets: {
    idle: {
      bulge: 0.08,
      contrast: 2.6,
      edge: 51,
      gain: 2.28,
      grow: 0.12,
      jitter: 0.74,
      rim: 0.345,
      skew: 0.63,
      slide: 0.1,
      speed: 0.52,
      swirl: 0.045,
      vary: 0.19,
    },
    speaking: {
      bulge: 0.28,
      contrast: 3.2,
      edge: 141,
      floorLevel: 0,
      gain: 1.35,
      grow: 0.22,
      jitter: 0.17,
      saturation: 2.04,
      skew: 0,
      slide: 0.55,
      speed: 2.85,
      swirl: 0.585,
      vary: 0.365,
    },
    thinking: {
      bulge: 0.14,
      contrast: 0.55,
      gain: 1.04,
      grow: 0.19,
      jitter: 0.37,
      light: 0.585,
      rim: 0.24,
      skew: 1.13,
      slide: 0.84,
      speed: 2.55,
      swirl: 0.57,
      vary: 0.165,
    },
  },
};

export type Orb19Props = Omit<ShaderOrbProps, "variant">;

export const Orb19 = ({ size = 280, ...rest }: Orb19Props) => (
  <ShaderOrb variant={orb19Orb} size={size} {...rest} />
);

export default Orb19;

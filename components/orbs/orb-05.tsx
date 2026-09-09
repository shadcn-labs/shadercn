"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const CAUSTIC_FRAG = `
const AA: i32 = 3;
// Volume-reactive values, resolved once per fragment in main().
var<private> causticSoft: f32;
var<private> causticGain: f32;
var<private> causticSpread: f32;

/*
  Softened tangent. Equal to sin/cos wherever cos is not near zero, capped
  at 1/(2*sqrt(g)) where it is — see the header for why the raw pole cannot
  be supersampled away.
*/
fn tanSoft(x: vec2f, g: f32) -> vec2f {
  var s: vec2f = sin(x);
  var c: vec2f = cos(x);
  return s * c / (c * c + g);
}

fn causticRender(fragCoord: vec2f) -> vec3f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var R: f32 =max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  var pl: vec2f = uv / R;
  var z: f32 =sqrt(max(1.0 - dot(pl, pl), 0.0));

  var ring: f32 =uP_ring; // integrated clock: the rings travel

  // stereographic wrap of the unrotated dome, as in orb-08 — the lens
  // lattice compresses toward the limb the way a texture on a sphere does
  var p: vec2f = pl / (z + 1.0 + uP_bulge) * uP_scale;

  // projection-safe 2D motion: the lattice turns and slides
  var sw: f32 =uP_swirl; // integrated clock
  p = mat2x2f(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;
  p += vec2f(uP_slide, uP_slide * 0.6); // integrated clock

  /*
    The lens lattice. Adding p back to its own tangent is what gives every
    cell a different view instead of tiling one image — see the header.
  */
  var L: f32 =length(tanSoft(p, causticSoft) * uP_lens + p);

  /*
    One cosine, three phases. The listing's (0, .7, 1) sit well under a
    radian apart, so the channels overlap through most of a band and only
    separate at its shoulders — white cores with coloured edges, not three
    independent rainbows.
  */
  var col: vec3f = cos(L * uP_freq - ring + vec3f(0.0, 0.7, 1.0) * causticSpread);

  // the listing's clamp: half of every period is hard black, and that is
  // what makes these read as bands rather than as a gradient
  col = max(col, vec3f(0.0)) * causticGain;

  col = pow(col, vec3f(uP_contrast));

  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  // a dark body under the bands, so the black half of the cosine reads as
  // the ball rather than as a hole in it
  col += uC_body * uP_floorLevel;

  // dome shading keeps the ball a ball under the lattice
  var n: vec3f = vec3f(pl, z);
  var lambert: f32 =clamp(dot(n, normalize(vec3f(-0.45, 0.55, 0.72))), 0.0, 1.0);
  col *= 0.6 + uP_light * lambert;

  var fres: f32 =1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // Volume coupling: the user's voice lets the walls crowd tighter, the
  // agent's brightens the bands and opens the colour split.
  causticSoft = max(uP_poleSoft * (1.0 - 0.5 * uInput), 0.0008);
  causticGain = uP_gain * (0.85 + 0.45 * uOutput);
  causticSpread = uP_spread * (1.0 + 0.5 * uOutput);

  var mask: f32 =smoothstep(0.012, -0.012, length(uv) - max(uP_radius, 0.001));

  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  var col: vec3f = vec3f(0.0);
  col = causticRender(fragCoord);

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see orb-31).
  var a: f32 =mask;
  return vec4f(max(col, vec3f(0.0)) * a, a);
}
`;

export const orb05Orb: OrbVariant = {
  key: "orb-05",
  label: "ORB-05",
  note: "rainbow rings travelling through a lattice of lenses",
  frag: CAUSTIC_FRAG,
  params: [
    {
      default: 0.9,
      integrate: true,
      key: "ring",
      label: "Ring speed",
      max: 8,
      min: 0,
      step: 0.03,
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
      default: 0.12,
      integrate: true,
      key: "slide",
      label: "Lattice slide",
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
      default: 5,
      key: "scale",
      label: "Lattice scale",
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
    {
      default: 1,
      key: "lens",
      label: "Lens strength",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.02,
      key: "poleSoft",
      label: "Wall softness",
      max: 0.5,
      min: 0.0008,
      step: 0.0008,
    },
    {
      default: 1,
      key: "freq",
      label: "Ring frequency",
      max: 8,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1,
      key: "spread",
      label: "Colour split",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 1.1,
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
      default: 1.15,
      key: "saturation",
      label: "Saturation",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.12,
      key: "floorLevel",
      label: "Body fill",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.4,
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
    { default: "#ffffff", key: "tint", label: "Tint" },
    { default: "#141a30", key: "body", label: "Body" },
    { default: "#bcd8ff", key: "sheen", label: "Sheen" },
  ],
  /*
    Staged on WALL SOFTNESS, which decides how tightly the rings are
    allowed to crowd before a cell wall stops them, and on ring frequency,
    which decides how many bands are on the ball at all. Lattice scale
    never moves between states — it sets the cell count, and a gliding cell
    count reads as the ball inflating rather than as a change of mood.

    Dome bulge and lens strength are staged too, so the SHAPE moves with the
    mood as well as the lattice: resting flattens both, and the two busy
    states drive them up — answering hardest, which puts bulge at 0 through
    0.36 to 0.96 across the three. They are continuous geometry rather than
    a quantizer, so gliding them is safe.
  */
  statePresets: {
    /*
      at rest: a plain sphere of drifting bands. Dome bulge is at zero and
      the lens down to under half its default — the only state that flattens
      both — so the ball is read straight rather than through a lens, which
      is what lets resting look settled even though the rings never stop
      moving.

      The walls are the TIGHTEST of the three here, under a third of
      searching's and a fifth of answering's, so the rings crowd hard
      against them; the colour split narrows to 0.7 with the key light
      raised well over its default to put back the separation the narrower
      split gives away.
    */
    idle: {
      bulge: 0,
      contrast: 1,
      freq: 1.05,
      gain: 1.1,
      lens: 0.38,
      light: 0.66,
      poleSoft: 0.012,
      ring: 0.9,
      saturation: 1.14,
      slide: 0.26,
      spread: 0.7,
      swirl: 0.195,
    },
    /*
      searching: the ball comes UP. Where resting is flat and read straight,
      this bulges the dome and drives the lens past one, so the bands are
      magnified through the middle — and the drift roughly triples, swirl
      and lattice slide together, on a ring clock three times as fast.

      It is also the hardest-looking of the three by some way: contrast more
      than triples over resting and saturation doubles, on a body fill three
      times as deep and with the rim sheen switched off entirely, so nothing
      softens the edge. The walls open to three times resting's, which stops
      the rings being hairlines — this state reads through colour and shape
      now, not through fineness.
    */
    thinking: {
      bulge: 0.36,
      contrast: 3.2,
      floorLevel: 0.4,
      freq: 1.3,
      gain: 0.88,
      lens: 1.28,
      poleSoft: 0.042,
      rim: 0,
      ring: 3,
      saturation: 2.36,
      slide: 0.88,
      spread: 1.82,
      swirl: 0.57,
    },
    /*
      answering: the FINEST banding of the three by a long way — ring
      frequency near five times resting's and nearly four times searching's
      — laid over the most strongly domed ball, bulge pushed almost to one
      against resting's flat zero. Many tight bands, spread across a surface
      curving away from you.

      The walls open to five times resting's, which is what keeps banding
      that fine from crowding into a solid field, and the drift is the
      highest of the three on both controls. Colour split comes back to
      about where resting holds it, so it is the fineness that carries this
      state rather than the split.
    */
    speaking: {
      bulge: 0.96,
      contrast: 0.75,
      freq: 4.8,
      gain: 1.6,
      lens: 1.2,
      poleSoft: 0.064,
      ring: 1.4,
      slide: 1,
      spread: 0.68,
      swirl: 0.6,
    },
  },
  // the ring phases supply the colour, so the tint only shifts temperature
  // and the body carries the mood: neutral at rest, cold while searching,
  // warm while answering
  stateColors: {
    idle: { body: "#141a30", sheen: "#bcd8ff", tint: "#ffffff" },
    speaking: { body: "#2e1408", sheen: "#ffb277", tint: "#ffc492" },
    thinking: { body: "#080c26", sheen: "#7ea9ff", tint: "#a6c0ff" },
  },
};

export type Orb05Props = Omit<ShaderOrbProps, "variant">;

export function Orb05({ size = 280, ...rest }: Orb05Props) {
  return <ShaderOrb variant={orb05Orb} size={size} {...rest} />;
}

export default Orb05;

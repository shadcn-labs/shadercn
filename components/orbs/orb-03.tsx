"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const ECLIPTIC_FRAG = `
const STEPS: i32 = 80;
const TURB: i32 = 8;
const AA: i32 = 1;
// Volume-reactive values, resolved once per fragment in main().
var<private> eclipticTurb: f32;
var<private> eclipticPlane: f32;
var<private> eclipticExposure: f32;
var<private> eclipticWidth: f32;

fn eclipticRender(fragCoord: vec2f) -> vec3f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var ro: vec3f = vec3f(0.0, 0.0, uP_camDist);
  var rd: vec3f = normalize(vec3f(uv, -uP_focal));

  var animTime: f32 =uP_speed; // integrated clock: the warp
  var wander: f32 =uP_wander;  // integrated clock: the belt's tilt

  var acc: vec3f = vec3f(0.0);

  // transmittance carried front-to-back — the near belt veils the far one
  var T: f32 =1.0;

  // march only the span the envelope can light, as in orb-01
  var z: f32 =max(uP_camDist - uP_envRadius * 1.3, 0.0);
  var zEnd: f32 =uP_camDist + uP_envRadius * 1.3;

  /*
    The listing's feedback variable, explicit. On the first iteration the
    axis below reads this before anything has written it — zero is what the
    golfed version gets, so zero is what it gets here.
  */
  var d: f32 =0.0;

  for (var it: i32 =0; it < STEPS; it = it + 1) {
    var p: vec3f = ro + rd * z;

    /*
      The axis, steered by the PREVIOUS step's density: the belt's tilt
      settles as the ray closes on the surface and swings away from it out
      in the open. The three phases are far enough apart that the cosines
      can never null together, so the normalize is safe without a guard.
    */
    var axis: vec3f = normalize(cos(wander + vec3f(4.0, 2.0, 0.0) - d * uP_feedback));

    // the exact minus-90-degree rotation about that axis
    var a: vec3f = dot(axis, p) * axis - cross(axis, p);

    // eight octaves of plain feedback warp — no lattice quantizer here,
    // unlike its cousins orb-22 and orb-04
    for (var j: i32 =0; j < TURB; j = j + 1) {
      var f: f32 =f32(j) + 2.0;
      a += eclipticTurb * sin(a * f + animTime).yzx / f;
    }

    /*
      Sphere plus plane. The shell reads the RAW point so the ball stays a
      ball; the plane reads the WARPED one so the belt writhes across it.
      uP_plane at zero drops the belt and lights the whole shell, which is
      worth being able to see once.
    */
    d = uP_shellW * abs(length(p) - uP_shellR) + eclipticPlane * abs(a.y);
    d = max(d, eclipticWidth);

    /*
      Hue from the DENSITY — the belt contoured in rainbow along its own
      distance field — and the listing's z in the numerator, which burns
      the far limb hotter than the near one.
    */
    var w: vec3f = cos(d * uP_hue + vec3f(0.0, 2.0, 4.0) * uP_spread) + 1.0;
    w *= z / d;
    w = min(w, vec3f(uP_stepClamp));

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    var env: f32 =smoothstep(uP_envRadius * 1.12, uP_envRadius * uP_envCore, length(p));
    w = (w + uP_fill) * env;

    acc += T * w;
    T *= exp(-dot(w, vec3f(0.299, 0.587, 0.114)) * uP_scatter);

    z += d;
    if (T < 0.004 || z > zEnd) { break; }
  }

  return acc;
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  /*
    The SURGE: tightness and warp swept together on one phase, so the belt
    gathers into a hard warped girdle and then opens back into a smooth
    shell. Two params, one gesture — swept apart they read as two unrelated
    things happening at once.

    Absolute bounds rather than a swing around what was dialled, so the range
    is exactly the range: tightness 0.1 to 0.3, warp 0.5 to 1.6. That is why
    the mix sits OUTSIDE the volume terms below — folding the surge under
    them would shave the top of both ranges by whatever the agent happened to
    be doing. At surge zero those terms are all that is left, so a state that
    does not ask for this is untouched.
  */
  var surge: f32 =0.5 - 0.5 * cos(uAnim * 4.0);

  eclipticTurb = mix(uP_turb * (1.0 + 0.4 * uInput), mix(0.5, 1.6, surge), uP_surge);
  // the belt broadens toward a full shell while the agent speaks
  eclipticPlane = mix(uP_plane * (1.0 - 0.35 * uOutput), mix(0.1, 0.3, surge), uP_surge);
  eclipticExposure = uP_exposure * (1.0 - 0.3 * uOutput);

  /*
    The belt BREATHES. At pulse zero the width is exactly what was dialled,
    so a state that does not ask for this is untouched; at one it sweeps the
    whole way from nothing to that width and back, once every few seconds.

    It cannot truly reach zero. Belt width is the march's step floor — see
    the port note above — and a zero step stalls the ray on one point, which
    with no scatter to close the transmittance accumulates the clamp eighty
    times into a white flare. The floor is the param's own minimum, four
    times finer than what the resting belt uses, so it reads as gone.

    Off uAnim rather than a raw clock, so the breath quickens with the agent
    like every other motion in the engine.
  */
  eclipticWidth = max(uP_width * (1.0 - uP_pulse * (0.5 + 0.5 * cos(uAnim * 3.0))), 5e-4);

  var acc: vec3f = vec3f(0.0);
  acc = eclipticRender(fragCoord);

  // tanh tone map per channel — the envelope and transmittance change the
  // accumulator's scale, so the golfed /1e4 knee is a tunable here
  var col: vec3f = tanh3(acc / max(eclipticExposure, 1.0));
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  // saturation about luminance, then the tint
  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a deep blue contour
  // has low luminance but must not go transparent
  var peak: f32 =max(col.r, max(col.g, col.b));
  var a: f32 =clamp(peak * uP_alphaGain, 0.0, 1.0);

  // Analytic silhouette — identical construction to orb-01: exact
  // ray-to-centre distance against the radius, colour AND alpha.
  var mrd: vec3f = normalize(vec3f(orbUV(), -uP_focal));
  var closest: f32 =length(cross(vec3f(0.0, 0.0, uP_camDist), mrd));
  var band: f32 =mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  var mask: f32 =1.0 - smoothstep(uP_envRadius * (1.0 - band), uP_envRadius * 1.005, closest);
  col *= mask;
  a *= mask;

  // safety taper at the frame boundary — colour as well as alpha
  var r2d: f32 =length(orbUV());
  var fade: f32 =1.0 - smoothstep(uP_edgeFade, 1.0, r2d);
  col *= fade;
  a *= fade;

  // Emitted light, so rgb is already premultiplied — do NOT scale by alpha
  // again (see the same note in orb-31).
  return vec4f(col, a);
}
`;

export const orb03Orb: OrbVariant = {
  key: "orb-03",
  label: "ORB-03",
  note: "a turbulent belt of light girdling the ball, contoured in rainbow",
  frag: ECLIPTIC_FRAG,
  params: [
    {
      default: 0.6,
      integrate: true,
      key: "speed",
      label: "Anim speed",
      max: 10,
      min: 0.015,
      step: 0.05,
    },
    {
      default: 0.3,
      integrate: true,
      key: "wander",
      label: "Belt tilt drift",
      max: 5,
      min: 0,
      step: 0.02,
    },
    {
      default: 1.5,
      key: "feedback",
      label: "Tilt feedback",
      max: 40,
      min: 0,
      step: 0.1,
    },
    {
      default: 5,
      key: "camDist",
      label: "Camera distance",
      max: 50,
      min: 1,
      step: 0.3,
    },
    {
      default: 1.05,
      key: "focal",
      label: "Lens",
      max: 15,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 3,
      key: "shellR",
      label: "Shell radius",
      max: 20,
      min: 0.2,
      step: 0.1,
    },
    {
      default: 0.12,
      key: "shellW",
      label: "Shell weight",
      max: 1,
      min: 0.005,
      step: 0.005,
    },
    {
      default: 0.15,
      key: "plane",
      label: "Belt tightness",
      max: 1,
      min: 0,
      step: 0.005,
    },
    { default: 0.55, key: "turb", label: "Warp", max: 4, min: 0, step: 0.02 },
    {
      default: 0.004,
      key: "width",
      label: "Belt width",
      max: 0.4,
      min: 0.0005,
      step: 0.0005,
    },
    {
      default: 0,
      key: "pulse",
      label: "Belt breathing",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0,
      key: "surge",
      label: "Belt surge",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 25,
      key: "hue",
      label: "Contour hue",
      max: 60,
      min: 0,
      step: 0.1,
    },
    {
      default: 1,
      key: "spread",
      label: "Colour spread",
      max: 3,
      min: 0,
      step: 0.02,
    },
    {
      default: 3.3,
      key: "envRadius",
      label: "Envelope radius",
      max: 20,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 0.92,
      key: "envCore",
      label: "Envelope core",
      max: 1.02,
      min: 0.3,
      step: 0.01,
    },
    {
      default: 0.1,
      key: "fill",
      label: "Body fill",
      max: 40,
      min: 0,
      step: 0.05,
    },
    {
      default: 1500,
      key: "stepClamp",
      label: "Step clamp",
      max: 20000,
      min: 5,
      step: 25,
    },
    {
      default: 0.0006,
      key: "scatter",
      label: "Diffusion",
      max: 0.1,
      min: 0,
      step: 0.0002,
    },
    {
      default: 1500,
      key: "exposure",
      label: "Exposure",
      max: 100000,
      min: 20,
      step: 50,
    },
    {
      default: 1.2,
      key: "contrast",
      label: "Contrast",
      max: 15,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 1.25,
      key: "saturation",
      label: "Saturation",
      max: 4,
      min: 0,
      step: 0.02,
    },
    {
      default: 2,
      key: "alphaGain",
      label: "Alpha gain",
      max: 15,
      min: 0.05,
      step: 0.1,
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
  colors: [{ default: "#ffffff", key: "tint", label: "Tint" }],
  /*
    Staged on BELT TIGHTNESS, which is the only control that changes what
    the object is: high and the light is a single girdle, low and it opens
    out into the whole shell. Warp and belt width carry the rest.
  */
  statePresets: {
    /*
      at rest: a hairline thread on a small, thin shell. The belt is left
      loose — a twentieth of the way to thinking's wire — so it is the WARP,
      more than double what searching carries and the highest steady value of
      the three, that gives the light its shape rather than the plane
      confining it. Hue is pushed warm and the
      envelope opened to its ceiling, which is what lets so fine a line still
      read as a body.
    */
    idle: {
      alphaGain: 2,
      envCore: 1.02,
      exposure: 1450,
      feedback: 2,
      hue: 39.8,
      plane: 0.085,
      scatter: 0.0006,
      shellR: 2,
      shellW: 0.085,
      speed: 0.6,
      spread: 0.94,
      stepClamp: 1475,
      turb: 1.54,
      wander: 0.3,
      width: 0.001,
    },
    /*
      searching: the belt BREATHES. Width is on `pulse` at full depth, so the
      band swells from nothing to fifty times the resting belt and closes
      again every few seconds — the state's whole tell, and the reason warp
      drops to under half of idle's: the shape comes from the breathing now,
      not from the plane confining it.

      Under it the belt is also four times tighter than at rest and hunting
      hard — the tilt three times as fast, the axis feedback near quadrupled
      — on a shell pulled small and thin inside a much wider envelope, so
      what pulses is a broad band on a small ball rather than a girdle.
    */
    thinking: {
      alphaGain: 2,
      envCore: 0.84,
      envRadius: 7.4,
      exposure: 2300,
      feedback: 7.5,
      focal: 1.9,
      hue: 28.3,
      plane: 0.345,
      pulse: 1,
      scatter: 0,
      shellR: 1.9,
      shellW: 0.005,
      speed: 2,
      spread: 1.02,
      turb: 0.7,
      wander: 1.1,
      width: 0.048,
    },
    /*
      answering: the belt SURGES. Tightness and warp are both on the surge at
      full depth, sweeping 0.1 to 0.3 and 0.5 to 1.6 together about every
      second and a half — from a loose, lightly warped band to a tight warped
      girdle and back. Where thinking pulses one control, this one swings the
      two that decide what the object is, which is why it reads as the
      loudest of the three.

      Tightness starts the sweep at exactly what is dialled here, so the
      preset value is the loose end of the swing; warp does not, and its 0.14
      is only what you would see with the surge turned off. What the preset
      carries either way is the body under them — a broad shell, tilt
      drifting near three times idle's, the axis feedback almost off — plus
      eighteen times the resting belt width to keep the girdle solid at the
      tight end.
    */
    speaking: {
      alphaGain: 2.7,
      envRadius: 3.4,
      exposure: 650,
      feedback: 0.3,
      plane: 0.1,
      scatter: 0.0003,
      shellR: 1.8,
      shellW: 0.19,
      speed: 0.9,
      spread: 1.04,
      surge: 1,
      turb: 0.14,
      wander: 0.84,
      width: 0.018,
    },
  },
  // the contour ramp supplies the colour, so the tint only shifts its
  // temperature: neutral at rest, cooled while searching, warmed while
  // answering
  stateColors: {
    idle: { tint: "#ffffff" },
    speaking: { tint: "#ffc492" },
    thinking: { tint: "#9db8ff" },
  },
};

export type Orb03Props = Omit<ShaderOrbProps, "variant">;

export function Orb03({ size = 280, ...rest }: Orb03Props) {
  return <ShaderOrb variant={orb03Orb} size={size} {...rest} />;
}

export default Orb03;

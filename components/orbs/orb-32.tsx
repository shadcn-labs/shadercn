"use client";
/*
 * Ported from orbkit (WebGL/GLSL) to WebGPU/WGSL for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */
import { ShaderOrb } from './orbkit-core-wgpu';
import type { OrbVariant, ShaderOrbProps } from './orbkit-core-wgpu';

const GALAXY_FRAG = `
const STEPS: i32 = 56;
const TURB_OCT: i32 = 4;
// Volume-reactive values, resolved once per fragment in main().
var<private> galDensity: f32;
var<private> galCore: f32;
var<private> galFalloff: f32;

/*
  The galactic density at a point in the galaxy's own frame: the disc lies
  in xz, the normal is y. Returns the density; writes the arm weight and the
  cylindrical radius for the colour.
*/
struct GalaxySample {
  dens: f32,
  arm: f32,
  rho: f32
}

fn galaxy(p: vec3f, t: f32) -> GalaxySample {
  var rho: f32 = length(p.xz);
  var h: f32 =p.y;
  // atan(0, 0) is undefined; the exact axis is all bulge anyway
  var phi: f32 = select(0.0, atan2(p.z, p.x), rho > 1e-4);
  var lr: f32 =log(max(rho, 0.02));
  var armPhase: f32 =phi * uP_arms - uP_wind * lr;

  // feedback curl turbulence, shared phase
  var q: vec3f = p * uP_turbScale;
  var f: f32 =1.0;
  for (var k: i32 =0; k < TURB_OCT; k = k + 1) {
    q += cos(q.yzx * f + t) / f;
    f *= 1.9;
  }
  var n: f32 =(sin(q.x) + sin(q.y) + sin(q.z)) / 3.0 * 0.5 + 0.5;
  var clump: f32 =smoothstep(uP_threshold, 1.0, n);

  var arm: f32 = 0.5 + 0.5 * cos(armPhase + (n - 0.5) * uP_ragged);
  arm = pow(arm, uP_armSharp);

  var scaleH: f32 =uP_thick * (0.12 + rho);
  var disc: f32 =exp(-rho * galFalloff) * exp(-abs(h) / scaleH);
  var bulge: f32 =exp(-dot(p, p) * uP_bulge);

  var dens: f32 =disc * (0.08 + 1.6 * arm) * (0.25 + 0.75 * clump) + bulge * galCore;
  return GalaxySample(dens * galDensity, arm, rho);
}

/*
  One lattice of hashed stars. Each cell either carries a star or not, at a
  hashed position, with its own twinkle rate; the 3x3 neighbourhood is
  gathered so a star near a cell wall is not clipped.
*/
fn starField(p: vec2f, density: f32, size: f32, twinkleT: f32) -> f32 {
  var id: vec2f = floor(p);
  var f: vec2f = fract(p);
  var acc: f32 =0.0;
  for (var j: i32 =-1; j <= 1; j = j + 1) {
    for (var i: i32 =-1; i <= 1; i = i + 1) {
      var o: vec2f = vec2f(f32(i), f32(j));
      var cid: vec2f = id + o;
      var h: f32 =hash(cid);
      if (h > density) { continue; }
      var sp: vec2f = o + vec2f(hash(cid + 1.3), hash(cid + 2.7));
      var dd: f32 =length(f - sp);
      var tw: f32 =0.55 + 0.45 * sin(twinkleT * (1.5 + 5.0 * hash(cid + 5.1)) + h * 40.0);
      var sz: f32 =size * (0.5 + 1.2 * hash(cid + 8.9) * hash(cid + 8.9));
      acc += tw * exp(-dd * dd / (sz * sz)) * (0.4 + 0.6 * h / max(density, 0.001));
    }
  }
  return acc;
}

fn galaxyRender(fragCoord: vec2f) -> vec4f {
  var uv: vec2f = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  var ro: vec3f = vec3f(0.0, 0.0, uP_camDist);
  var rd: vec3f = normalize(vec3f(uv, -uP_focal));

  var t: f32 =uP_churn; // integrated clock: the turbulence boils
  var spin: f32 =uP_spin; // integrated clock: the disc turns

  // the galaxy frame: tip about x by the tilt, then turn about the disc's
  // own normal
  var ct: f32 =cos(uP_tilt);
  var st: f32 =sin(uP_tilt);
  var cs: f32 =cos(spin);
  var sn: f32 =sin(spin);

  var acc: vec3f = vec3f(0.0);
  var T: vec3f = vec3f(1.0);
  // extinction weighted to blue, so thick gas reddens what is behind it
  var absorb: vec3f = vec3f(0.7, 1.0, 1.5) * uP_absorb;

  // march only the span the envelope can light
  var z: f32 =max(uP_camDist - uP_envRadius * 1.05, 0.0);
  var zEnd: f32 =uP_camDist + uP_envRadius * 1.05;
  var dt: f32 =(zEnd - z) / f32(STEPS);
  // a hashed start offset per pixel hides the step banding
  z += dt * hash(fragCoord * 0.37);

  for (var i: i32 =0; i < STEPS; i = i + 1) {
    var p: vec3f = ro + rd * z;

    // envelope: nothing outside the ball contributes
    var env: f32 =1.0 - smoothstep(uP_envRadius * 0.92, uP_envRadius, length(p));
    if (env > 0.001) {
      // into the galaxy frame
      var g: vec3f = vec3f(p.x, p.y * ct - p.z * st, p.y * st + p.z * ct);
      g = vec3f(g.x * cs - g.z * sn, g.y, g.x * sn + g.z * cs);

      var gs: GalaxySample = galaxy(g / uP_envRadius, t);
      var arm: f32 = gs.arm;
      var rho: f32 = gs.rho;
      var d: f32 = gs.dens * env;

      // the colour ramp, keyed to radius from the core
      var ramp: vec3f = mix(uC_inner, uC_outer, smoothstep(0.12, uP_hueReach, rho));
      var coreW: f32 =exp(-rho * rho * uP_bulge * 0.6);
      var emit: vec3f = mix(ramp, uC_core, coreW) * (0.6 + 0.6 * arm);

      acc += T * d * emit * dt;
      T *= exp(-d * absorb * dt);
    }

    z += dt;
    if (T.g < 0.004 || z > zEnd) { break; }
  }

  return vec4f(acc, 1.0 - T.g);
}

fn orbMain(fragCoord: vec2f, uv: vec2f) -> vec4f {
  // The beat: one wave on the core-beat clock, shared by the core flare and
  // the disc's breathing. Both depths are amplitudes, so they stage cleanly.
  var wave: f32 =0.5 + 0.5 * cos(uP_beat);
  galDensity = uP_density * (1.0 + 0.35 * uInput);
  galCore = uP_core * (1.0 + 0.7 * uOutput) * (1.0 + uP_pulse * wave);
  // breathing: the disc's falloff relaxes on the wave, so the whole disc
  // swells outward and draws back — a smooth exponential, safe to sweep
  galFalloff = uP_falloff / (1.0 + uP_breathe * wave);

  var acc: vec4f = galaxyRender(fragCoord);

  /*
    Stars, at the ray's exact hit with the galactic plane. The plane is the
    tilted xz-plane through the origin; its world normal is the tilted y.
    The lattice lives in the disc's own turning frame, so the stars turn
    with the gas, and the march's transmittance dims them through the dust.
  */
  {
    var ro: vec3f = vec3f(0.0, 0.0, uP_camDist);
    var rd: vec3f = normalize(vec3f(orbUV(), -uP_focal));
    var ct: f32 =cos(uP_tilt);
    var st: f32 =sin(uP_tilt);
    var N: vec3f = vec3f(0.0, ct, st);
    var denom: f32 =dot(N, rd);
    if (abs(denom) > 1e-4) {
      var th: f32 =-dot(N, ro) / denom;
      var q: vec3f = ro + rd * th;
      if (th > 0.0 && dot(q, q) < uP_envRadius * uP_envRadius * 0.9) {
        var g: vec3f = vec3f(q.x, q.y * ct - q.z * st, q.y * st + q.z * ct) / uP_envRadius;
        var cs: f32 =cos(uP_spin);
        var sn: f32 =sin(uP_spin);
        var gp: vec2f = vec2f(g.x * cs - g.z * sn, g.x * sn + g.z * cs);
        var rho: f32 =length(gp);
        var phi: f32 = select(0.0, atan2(gp.y, gp.x), rho > 1e-4);
        var armW: f32 =0.5 + 0.5 * cos(phi * uP_arms - uP_wind * log(max(rho, 0.02)));
        var sf: f32 =starField(gp * uP_starScale, uP_starDensity * (0.3 + 0.7 * armW), 0.12, uP_twinkle);
        var veil: f32 =1.0 - acc.a; // what the march let through
        var starLight: vec3f = vec3f(1.0, 0.97, 0.9) * sf * uP_stars * exp(-rho * 1.5) * (0.25 + 0.75 * veil);
        acc = vec4f(acc.rgb + starLight, acc.a);
      }
    }
  }

  // tanh tone map per channel, tunable knee
  var col: vec3f = tanh3(acc.rgb / max(uP_exposure, 0.01));
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(uP_contrast));

  // saturation about luminance, then the tint
  var lum: f32 =dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel — emitted light (see orb-18)
  var peak: f32 =max(col.r, max(col.g, col.b));
  var a: f32 =clamp(peak * uP_alphaGain, 0.0, 1.0);

  // the night behind: a fill so the ball is a solid sphere, not a cut-out
  col += uC_deep * uP_fill;
  a = max(a, uP_fill);

  // Analytic silhouette — identical construction to orb-01: exact
  // ray-to-centre distance against the radius, colour AND alpha.
  var mrd: vec3f = normalize(vec3f(orbUV(), -uP_focal));
  var closest: f32 =length(cross(vec3f(0.0, 0.0, uP_camDist), mrd));
  var band: f32 =mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  var mask: f32 =1.0 - smoothstep(uP_envRadius * (1.0 - band), uP_envRadius * 1.005, closest);
  col *= mask;
  a *= mask;

  // a fresnel rim on the glass, inside the mask
  var fres: f32 =smoothstep(uP_envRadius * 0.7, uP_envRadius, closest);
  col += uC_rim * uP_rim * fres * fres * mask;

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

export const orb32Orb: OrbVariant = {
  key: "orb-32",
  label: "ORB-32",
  note: "a galaxy marched as gas and dust inside the ball",
  frag: GALAXY_FRAG,
  params: [
    {
      default: 0.06,
      integrate: true,
      key: "spin",
      label: "Disc turn",
      max: 3,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.25,
      integrate: true,
      key: "churn",
      label: "Gas churn",
      max: 5,
      min: 0,
      step: 0.02,
    },
    {
      default: 0.8,
      integrate: true,
      key: "beat",
      label: "Core beat",
      max: 12,
      min: 0,
      step: 0.05,
    },
    {
      default: 1.2,
      integrate: true,
      key: "twinkle",
      label: "Twinkle rate",
      max: 12,
      min: 0,
      step: 0.05,
    },
    {
      default: 7,
      key: "camDist",
      label: "Camera distance",
      max: 50,
      min: 1,
      step: 0.3,
    },
    {
      default: 2.25,
      key: "focal",
      label: "Lens",
      max: 15,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 2.6,
      key: "envRadius",
      label: "Envelope radius",
      max: 15,
      min: 0.15,
      step: 0.1,
    },
    {
      default: 0.85,
      key: "tilt",
      label: "Tilt (0 edge-on)",
      max: 1.5,
      min: 0,
      step: 0.01,
    },
    { default: 2, key: "arms", label: "Arm count", max: 6, min: 1, step: 1 },
    {
      default: 3.4,
      key: "wind",
      label: "Arm winding",
      max: 8,
      min: 0,
      step: 0.05,
    },
    {
      default: 3,
      key: "ragged",
      label: "Arm fray",
      max: 12,
      min: 0,
      step: 0.05,
    },
    {
      default: 2.2,
      key: "armSharp",
      label: "Arm sharpness",
      max: 8,
      min: 0.3,
      step: 0.05,
    },
    {
      default: 1.7,
      key: "falloff",
      label: "Disc falloff",
      max: 12,
      min: 0.3,
      step: 0.05,
    },
    {
      default: 0.035,
      key: "thick",
      label: "Disc thickness",
      max: 1,
      min: 0.01,
      step: 0.005,
    },
    {
      default: 40,
      key: "bulge",
      label: "Core tightness",
      max: 200,
      min: 2,
      step: 1,
    },
    {
      default: 5,
      key: "core",
      label: "Core density",
      max: 20,
      min: 0,
      step: 0.1,
    },
    {
      default: 9,
      key: "turbScale",
      label: "Turbulence scale",
      max: 30,
      min: 0.5,
      step: 0.1,
    },
    {
      default: 0.35,
      key: "threshold",
      label: "Clumping",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 14,
      key: "density",
      label: "Gas density",
      max: 40,
      min: 0.1,
      step: 0.1,
    },
    {
      default: 3.5,
      key: "absorb",
      label: "Dust absorption",
      max: 20,
      min: 0,
      step: 0.1,
    },
    { default: 1.2, key: "stars", label: "Stars", max: 10, min: 0, step: 0.05 },
    {
      default: 0.5,
      key: "starDensity",
      label: "Star density",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 48,
      key: "starScale",
      label: "Star scale",
      max: 200,
      min: 5,
      step: 1,
    },
    {
      default: 0.6,
      key: "hueReach",
      label: "Hue reach",
      max: 1.5,
      min: 0.15,
      step: 0.01,
    },
    {
      default: 0.2,
      key: "pulse",
      label: "Beat depth",
      max: 3,
      min: 0,
      step: 0.01,
    },
    {
      default: 0,
      key: "breathe",
      label: "Disc breathing",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      default: 1.1,
      key: "exposure",
      label: "Exposure",
      max: 50,
      min: 0.05,
      step: 0.05,
    },
    {
      default: 1.15,
      key: "contrast",
      label: "Contrast",
      max: 6,
      min: 0.15,
      step: 0.05,
    },
    {
      default: 1.35,
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
      default: 0.85,
      key: "fill",
      label: "Night fill",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      default: 0.35,
      key: "rim",
      label: "Rim light",
      max: 3,
      min: 0,
      step: 0.015,
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
  /*
   * Six stops: the overall tint, the core the bulge whitens toward, the
   * inner and outer arm colours the ramp runs between, the night the ball
   * is filled with, and the glass rim.
   */
  colors: [
    { default: "#ffffff", key: "tint", label: "Tint" },
    { default: "#fff3d6", key: "core", label: "Core" },
    { default: "#7fb4ff", key: "inner", label: "Inner arms" },
    { default: "#c46bff", key: "outer", label: "Outer arms" },
    { default: "#04050f", key: "deep", label: "Night" },
    { default: "#8fb0ff", key: "rim", label: "Rim" },
  ],
  /*
    Staged on the TILT first — each state is a different view of the disc —
    and then on the clocks and amplitudes. The tilt glides, and a tipping
    disc is the biggest, most legible motion this orb has, so the state
    change itself is the tell. The arm count and winding, the turbulence
    scale and the star scale all multiply a coordinate and are pinned.
  */
  statePresets: {
    /*
      at rest: the spiral seen about halfway between edge-on and face-on.
      A slow turn, the gas barely boiling, a lazy shallow beat on the core.
    */
    idle: {
      absorb: 3.5,
      armSharp: 2.2,
      beat: 0.8,
      breathe: 0,
      churn: 0.25,
      contrast: 1.15,
      core: 5,
      density: 14,
      exposure: 1.1,
      pulse: 0.2,
      ragged: 3,
      saturation: 1.35,
      spin: 0.06,
      stars: 1.2,
      thick: 0.035,
      threshold: 0.35,
      tilt: 0.85,
      twinkle: 1.2,
    },
    /*
      searching: the disc swings FACE-ON and becomes a whirlpool. The arms
      fray to nothing and the gas boils at six times rest on a thicker
      disc, a sparser clumping and a heavier absorption, so what is left is
      filaments and shadow spinning at seven times rest — face-on, the turn
      is fully visible — with the core held down. Cold.
    */
    thinking: {
      absorb: 6,
      armSharp: 1,
      beat: 2.4,
      breathe: 0,
      churn: 1.6,
      contrast: 1.3,
      core: 3,
      density: 20,
      exposure: 1.05,
      pulse: 0.25,
      ragged: 8,
      saturation: 1.2,
      spin: 0.45,
      stars: 1.8,
      thick: 0.07,
      threshold: 0.5,
      tilt: 1.45,
      twinkle: 4.5,
    },
    /*
      answering: the disc swings FACE-ON and lights up — the full spiral,
      arms sharp and wide, the core flaring on a hard beat (depth five
      times rest on a clock six times as fast) and the whole disc swelling
      outward and drawing back on the same wave. The gas is dense but the
      dust is cleared, so all of it glows, at a lower knee. Hot.
    */
    speaking: {
      absorb: 1.6,
      armSharp: 1.8,
      beat: 4.8,
      breathe: 0.45,
      churn: 0.6,
      contrast: 1.05,
      core: 12,
      density: 18,
      exposure: 0.75,
      pulse: 1,
      ragged: 2,
      saturation: 1.6,
      spin: 0.2,
      stars: 2,
      thick: 0.04,
      threshold: 0.25,
      tilt: 1.3,
      twinkle: 2.4,
    },
  },
  // blue into violet at rest, ice into cyan while searching, gold into rose
  // while answering
  stateColors: {
    idle: {
      core: "#fff3d6",
      deep: "#04050f",
      inner: "#7fb4ff",
      outer: "#c46bff",
      rim: "#8fb0ff",
      tint: "#ffffff",
    },
    speaking: {
      core: "#fff4c8",
      deep: "#0a0508",
      inner: "#ffa63c",
      outer: "#ff3f8e",
      rim: "#ffb98a",
      tint: "#ffffff",
    },
    thinking: {
      core: "#e6f0ff",
      deep: "#030614",
      inner: "#6fb0ff",
      outer: "#4fe3ff",
      rim: "#7fa8ff",
      tint: "#ffffff",
    },
  },
};

export type Orb32Props = Omit<ShaderOrbProps, "variant">;

export function Orb32({ size = 280, ...rest }: Orb32Props) {
  return <ShaderOrb variant={orb32Orb} size={size} {...rest} />;
}

export default Orb32;

// Blackbody colour and spectra, computed (not hand-picked).
// CIE 1931 2° colour-matching functions use the multi-lobe Gaussian fit of
// Wyman, Sloan & Shirley (2013), "Simple Analytic Approximations to the CIE XYZ
// Color Matching Functions", JCGT 2(2).

const H = 6.62607015e-34;
const C = 299792458;
const KB = 1.380649e-23;

function g(x, mu, s1, s2) {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

export function cieXYZ(lambdaNm) {
  const l = lambdaNm;
  const x = 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2);
  const y = 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
  const z = 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** Spectral radiance B_lambda(T) in W / (m^2 sr m) */
export function planck(lambdaM, T) {
  const a = (2 * H * C * C) / lambdaM ** 5;
  const b = (H * C) / (lambdaM * KB * T);
  return a / Math.expm1(b);
}

/** XYZ (unnormalised) of a blackbody at T, integrated 380..780 nm */
export function blackbodyXYZ(T) {
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 2) {
    const B = planck(l * 1e-9, T);
    const [x, y, z] = cieXYZ(l);
    X += B * x; Y += B * y; Z += B * z;
  }
  const dl = 2e-9;
  return [X * dl, Y * dl, Z * dl];
}

export function xyzToLinearSRGB([X, Y, Z]) {
  return [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ];
}

/** Linear-sRGB chromaticity of a blackbody, normalised so max channel = 1. */
export function blackbodyRGB(T) {
  const rgb = xyzToLinearSRGB(blackbodyXYZ(T)).map(v => Math.max(0, v));
  const m = Math.max(...rgb) || 1;
  return rgb.map(v => v / m);
}

/** Luminance Y (cd/m^2) of a blackbody surface at T (emissivity 1). */
export function blackbodyLuminance(T) {
  return 683 * blackbodyXYZ(T)[1];
}

/** Wien peak wavelength in metres */
export function wienPeak(T) {
  return 2.897771955e-3 / T;
}

/**
 * Perceptual "inferno" ramp for thermal false colour, t in 0..1. Control points sampled from
 * matplotlib's inferno (CC0). Returned values are LINEAR (the sRGB table decoded), because the
 * renderer converts linear -> sRGB on output; thermal mode renders without tone mapping, so the
 * screen shows the true inferno colours.
 */
const INFERNO = [
  [0.0015, 0.0005, 0.0139], [0.0874, 0.0447, 0.2245], [0.2582, 0.0386, 0.4065],
  [0.4162, 0.0902, 0.4329], [0.5783, 0.148, 0.4044], [0.7357, 0.2159, 0.3302],
  [0.8650, 0.3168, 0.2261], [0.9540, 0.4692, 0.0992], [0.9876, 0.6453, 0.0399],
  [0.9640, 0.8434, 0.2730], [0.9884, 0.9984, 0.6449],
];
export function inferno(t) {
  const x = Math.min(1, Math.max(0, t)) * (INFERNO.length - 1);
  const i = Math.min(INFERNO.length - 2, Math.floor(x));
  const f = x - i;
  return INFERNO[i].map((v, k) => srgbToLinear(v + (INFERNO[i + 1][k] - v) * f));
}

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** GLSL source for the same inferno ramp, for shaders. */
export const INFERNO_GLSL = `
vec3 inferno(float t){
  t = clamp(t, 0.0, 1.0);
  const vec3 c0 = vec3(0.0002189403691192265, 0.001651004631001012, -0.01948089843709184);
  const vec3 c1 = vec3(0.1065134194856116, 0.5639564367884091, 3.932712388889277);
  const vec3 c2 = vec3(11.60249308247187, -3.972853965665698, -15.9423941062914);
  const vec3 c3 = vec3(-41.70399613139459, 17.43639888205313, 44.35414519872813);
  const vec3 c4 = vec3(77.162935699427, -33.40235894210092, -81.80730925738993);
  const vec3 c5 = vec3(-71.31942824499214, 32.62606426397723, 73.20951985803202);
  const vec3 c6 = vec3(25.13112622477341, -12.24266895238567, -23.07032500287172);
  vec3 c = clamp(c0+t*(c1+t*(c2+t*(c3+t*(c4+t*(c5+t*c6))))), 0.0, 1.0);
  return pow(c, vec3(2.2)); // linear, see inferno() above
}`;

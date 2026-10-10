// GLSL for the Earth chapter. Shaders output display-referred linear values (luminance in cd/m² times
// the eye-adaptation exposure); main.js then applies ACES tone mapping and sRGB encoding.

import { INFERNO_GLSL } from '../../util/blackbody.js';

export const COMMON = /* glsl */ `
#define PI 3.141592653589793
const vec3 LUMW = vec3(0.2126, 0.7152, 0.0722);
float log10f(float x) { return log(max(x, 1e-30)) * 0.4342944819; }

// Rod vision: below ~0.003 cd/m² colour is gone and the world reads as a slightly blue grey
// (Purkinje shift; blue tint as in Jensen et al. 2000, "A spatial post-processing algorithm for images
// of night scenes"). Full colour above ~1 cd/m² (CIE 191:2010 mesopic range 0.005–5 cd/m²).
vec3 purkinje(vec3 L) {
  float Y = dot(L, LUMW);
  float s = smoothstep(-2.5, 0.0, log10f(Y));
  vec3 tint = vec3(0.80, 0.92, 1.22);
  vec3 scot = Y * tint / dot(tint, LUMW);
  return mix(scot, L, s);
}

// Kasten & Young (1989) relative airmass, alt in radians.
float airmass(float alt) {
  float h = max(alt, -0.0087);
  float hd = max(-0.5, degrees(alt));
  return 1.0 / (sin(h) + 0.50572 * pow(hd + 6.07995, -1.6364));
}

uniform float uLnatZ, uHorGain, uHorScale, uK;
float naturalSky(float alt) {
  return uLnatZ * (1.0 + uHorGain * exp(-max(alt, 0.0) / uHorScale));
}

// Swarm light: uniform diffuse dome + Gaussian glint around the antisolar point (direct beam, extinguished).
uniform float uLdiff, uGlintL0, uGlintS2, uGain;
uniform vec3 uGlintDir;
float glintAt(vec3 d, float alt) {
  if (uGlintL0 <= 0.0) return 0.0;
  float c = clamp(dot(d, uGlintDir), -1.0, 1.0);
  float th = acos(c);
  return uGlintL0 * exp(-0.5 * th * th / uGlintS2) * pow(10.0, -0.4 * uK * airmass(alt));
}
// Sky luminance (cd/m²) that sets the naked-eye limit at direction d. Uses the true (not enlarged) swarm light.
float skyLumForStars(vec3 d) {
  float alt = asin(clamp(d.y, -1.0, 1.0));
  return naturalSky(alt) + uLdiff + glintAt(d, alt);
}

// --- value noise -------------------------------------------------------------
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.07 + 17.3; a *= 0.5; }
  return s / 0.96875;
}

// --- 8–14 µm ------------------------------------------------------------------
// Planck spectral radiance, λ in µm → W m⁻² sr⁻¹ µm⁻¹.
float planckUm(float l, float T) { return 1.191042e8 / (pow(l, 5.0) * (exp(14387.77 / (l * max(T, 1.0))) - 1.0)); }
// 4-point Gauss–Legendre over 8–14 µm (error < 0.1% for 150–600 K).
float band814(float T) {
  return 3.0 * (0.3478548451 * (planckUm(11.0 - 3.0 * 0.8611363116, T) + planckUm(11.0 + 3.0 * 0.8611363116, T))
              + 0.6521451549 * (planckUm(11.0 - 3.0 * 0.3399810436, T) + planckUm(11.0 + 3.0 * 0.3399810436, T)));
}
uniform float uInvT[65];
uniform float uLmax;
float bandTemp(float L) {
  float x = pow(clamp(L / uLmax, 0.0, 1.0), 0.2) * 64.0;
  int i = int(min(floor(x), 63.0));
  float f = x - float(i);
  return mix(uInvT[i], uInvT[i + 1], f);
}
uniform float uTau0, uBair;
// Sky in-band radiance along a direction at altitude alt, for swarm in-band radiance Lsw beyond the air.
float skyBand(float alt, float Lsw) {
  float tau = pow(uTau0, airmass(max(alt, 0.0)));
  return tau * Lsw + (1.0 - tau) * uBair;
}

${INFERNO_GLSL}

// Thermal false colour: main.js turns tone mapping off in thermal mode and the shared inferno() returns
// linear values, so the screen shows exactly the legend colour.
uniform float uTmax;
vec3 thermalColour(float T) { return inferno(T / uTmax); }
`;

// ---------------------------------------------------------------------------
// Sky dome
// ---------------------------------------------------------------------------
export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // on the far plane
}`;

export const SKY_FRAG = /* glsl */ `
${COMMON}
varying vec3 vDir;
uniform float uExp, uMode, uMW;
uniform mat3 uGal;
uniform vec3 uSwCol, uGlintCol, uNatCol;
// thermal
uniform float uLswIR, uInterior, uIntRad, uLswIRint;
uniform vec3 uSunDir;

// Milky Way surface brightness in units of the natural zenith sky, from galactic (l, b).
float milkyWay(vec3 g) {
  float l = degrees(atan(g.y, g.x));
  float b = degrees(asin(clamp(g.z, -1.0, 1.0)));
  float al = abs(l);
  float w = 5.0 + 4.0 * exp(-al * al / (2.0 * 35.0 * 35.0));              // band thickens toward the centre
  float disc = exp(-0.5 * b * b / (w * w));
  float along = 0.28 + 0.72 * exp(-al * al / (2.0 * 60.0 * 60.0))
              + 0.35 * exp(-0.5 * pow((l - 76.0) / 10.0, 2.0)) * exp(-0.5 * b * b / 16.0)   // Cygnus star cloud
              + 0.30 * exp(-0.5 * pow((l - 27.0) / 4.0, 2.0)) * exp(-0.5 * pow((b + 2.5) / 2.5, 2.0)); // Scutum cloud
  float bulge = exp(-0.5 * (l * l / 81.0 + (b + 4.0) * (b + 4.0) / 36.0));  // Sagittarius star clouds
  float clumps = 0.55 + 0.9 * fbm(g * 11.0);
  float fine = 0.75 + 0.5 * fbm(g * 38.0 + 3.0);
  // Dust: the Great Rift from Cygnus (l≈80°) to Sagittarius, a little north of the plane, and a
  // patchy mid-plane lane elsewhere.
  float rift = exp(-0.5 * pow((b - 1.2 - 0.025 * l) / 1.8, 2.0)) * smoothstep(100.0, 70.0, l) * smoothstep(-15.0, 5.0, l);
  float lane = exp(-0.5 * b * b / 1.5);
  float dust = 1.0 - 0.85 * rift * smoothstep(0.35, 0.65, fbm(g * 16.0 + 7.0)) - 0.45 * lane * smoothstep(0.4, 0.7, fbm(g * 24.0 + 1.0));
  return max(0.0, (disc * along * clumps * fine + 1.3 * bulge * clumps) * dust);
}

void main() {
  vec3 d = normalize(vDir);
  float alt = asin(clamp(d.y, -1.0, 1.0));
  float altC = max(alt, 0.0);
  if (uMode < 0.5) {
    float ext = pow(10.0, -0.4 * uK * (airmass(altC) - 1.0));
    float nat = naturalSky(altC) + uMW * uLnatZ * milkyWay(uGal * d) * ext;
    vec3 L = nat * uNatCol + uGain * (uLdiff * uSwCol + glintAt(d, altC) * uGlintCol);
    L = purkinje(L);
    gl_FragColor = vec4(min(L * uExp, vec3(14.0)), 1.0);
  } else {
    float Lsw = uLswIR;
    if (uInterior > 0.5) {
      float a = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
      Lsw = a < uIntRad ? uLswIRint : 0.0;
    }
    float T = bandTemp(skyBand(altC, Lsw * uGain));
    gl_FragColor = vec4(thermalColour(T), 1.0);
  }
}`;

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------
export const STAR_VERT = /* glsl */ `
${COMMON}
attribute float aMag, aSeed;
attribute vec3 aCol;
uniform float uExp, uPxRatio, uTime, uShow, uSigmaPx, uPsfSr;
varying vec3 vCol;
varying float vPeak, vSigma, vSize;
void main() {
  vec3 d = normalize(position);
  float alt = asin(clamp(d.y, -1.0, 1.0));
  float X = airmass(alt);
  float Lsky = skyLumForStars(d);
  float b = 12.58 - 2.5 * log10f(Lsky);
  float mlim = 7.93 - 5.0 * log10f(pow(10.0, 4.316 - b / 5.0) + 1.0);
  float mobs = aMag + uK * (X - 1.0);
  float s = 0.4 * (mlim - mobs);                     // log10 of (star flux / threshold flux)
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vPeak = 0.0; vCol = vec3(0.0); vSigma = 1.0; vSize = 1.0;
  if (s <= 0.0 || uShow < 0.5) { gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // Physical flux E = 2.54e-6 lux · 10^(-0.4 m) spread over the eye's blur (a Gaussian of solid angle
  // uPsfSr), shown as a point of fixed pixel size so zooming does not change star brightness.
  float E = 2.54e-6 * pow(10.0, -0.4 * mobs);
  float peak = E / uPsfSr * uExp;
  // Scintillation, stronger near the horizon.
  float tw = 1.0 + (0.05 + 0.3 * smoothstep(1.5, 6.0, X)) * sin(uTime * (9.0 + 7.0 * aSeed) + aSeed * 40.0) * sin(uTime * 3.1 + aSeed * 17.0);
  // Fade in over the last 0.6 mag above the limit, so stars vanish smoothly as the sky brightens.
  peak *= smoothstep(0.0, 0.24, s) * tw;
  peak = min(peak, 40.0);
  float sigma = uSigmaPx * uPxRatio;
  vPeak = peak;
  vSigma = sigma;
  // Colour shows only for bright stars (cones need ~mag 1–2 point sources at night).
  float sat = smoothstep(2.6, -0.2, mobs) * 0.9;
  float Y = dot(aCol, LUMW);
  vCol = mix(vec3(1.0), aCol / max(Y, 1e-3), sat);
  float r = sigma * sqrt(2.0 * log(max(peak / 0.004, 1.0001)));
  vSize = clamp(2.0 * r + 2.0, 2.0, 48.0 * uPxRatio);
  gl_PointSize = vSize;
}`;

export const STAR_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vPeak, vSigma, vSize;
void main() {
  vec2 p = (gl_PointCoord - 0.5) * vSize;
  float v = vPeak * exp(-0.5 * dot(p, p) / (vSigma * vSigma));
  gl_FragColor = vec4(vCol * v, 1.0);
}`;

// ---------------------------------------------------------------------------
// Landscape
// ---------------------------------------------------------------------------
export const LAND_VERT = /* glsl */ `
attribute float eps;
varying vec3 vAlb, vN, vW;
varying float vEps;
void main() {
  vAlb = color;
  vEps = eps;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const LAND_FRAG = /* glsl */ `
${COMMON}
varying vec3 vAlb, vN, vW;
varying float vEps;
uniform float uExp, uMode, uFogK;
uniform vec3 uSkyE, uGlintE, uFogCol, uCamPos;
// thermal
uniform float uTground, uRadK, uTskyHemi, uLswIR, uInterior;
void main() {
  vec3 n = normalize(vN);
  float dist = length(vW - uCamPos);
  if (uMode < 0.5) {
    // Sky dome illuminance on a tilted face: E_h · (1 + n_y)/2; the glint is a directional source.
    float view = 0.5 + 0.5 * n.y;
    vec3 E = uSkyE * view + uGlintE * max(dot(n, uGlintDir), 0.0);
    // light bounced off the meadow onto faces that look down or sideways
    E += uSkyE * 0.15 * (0.5 - 0.5 * n.y);
    vec3 L = vAlb * E / PI;
    L = purkinje(L);
    vec3 c = L * uExp;
    float fog = 1.0 - exp(-uFogK * dist);
    c = mix(c, uFogCol, fog);
    gl_FragColor = vec4(c, 1.0);
  } else {
    // Surfaces that see the sky trade heat with it: below air temperature under a cold clear sky,
    // above it under a hot swarm.
    float up = max(n.y, 0.0);
    float Ts = uTground + uRadK * up * (uTskyHemi - uTground);
    // In-band radiance: own emission + reflected sky (mirror direction; low-ε metal shows the sky).
    vec3 v = normalize(vW - uCamPos);
    vec3 rd = reflect(v, n);
    float ralt = asin(clamp(rd.y, -1.0, 1.0));
    float Lsky = rd.y > 0.0 ? skyBand(ralt, uInterior > 0.5 ? 0.0 : uLswIR * uGain) : band814(uTground);
    float Lb = vEps * band814(Ts) + (1.0 - vEps) * Lsky;
    // the air between us and distant hills
    float tauPath = exp(-dist / 9000.0);
    Lb = tauPath * Lb + (1.0 - tauPath) * uBair;
    gl_FragColor = vec4(thermalColour(bandTemp(Lb)), 1.0);
  }
}`;

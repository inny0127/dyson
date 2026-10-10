// GLSL for the Mercury chapter. Radiance is carried in units of 10^4 cd/m^2 so that the sunlit
// regolith (a few units) and incandescent rock (up to 10^6 units) share one physical scale.

import { INFERNO_GLSL } from '../../util/blackbody.js';

export const DISPLAY_GLSL = /* glsl */`
// Thermal mode renders with NoToneMapping (main.js), so palette colours only need sRGB -> linear.
vec3 toLinear(vec3 c){ return pow(clamp(c, 0.0, 1.0), vec3(2.2)); }
${INFERNO_GLSL}
`;

const NOISE_GLSL = /* glsl */`
float h13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = h13(i), b = h13(i + vec3(1,0,0)), c = h13(i + vec3(0,1,0)), d = h13(i + vec3(1,1,0));
  float e = h13(i + vec3(0,0,1)), g = h13(i + vec3(1,0,1)), k = h13(i + vec3(0,1,1)), l = h13(i + vec3(1,1,1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(k, l, u.x), u.y), u.z);
}
// value noise faded out where it would alias (fp = screen footprint of p, in the same units)
float aaNoise(vec3 p, float freq, float fp){ return mix(0.5, vnoise(p * freq), 1.0 - smoothstep(0.25, 0.9, fp * freq)); }
`;

export const SURFACE_VERT = /* glsl */`
uniform float uR;
uniform mat3 uWorldToBody;
varying vec3 vWorld;
varying vec3 vBody;
void main(){
  vec3 wp = position * uR;
  vWorld = wp;
  vBody = uWorldToBody * position;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export function surfaceFrag(nSites) {
  return /* glsl */`
precision highp float;
#define NS ${nSites}
#define PI 3.14159265359
varying vec3 vWorld;
varying vec3 vBody;
uniform samplerCube tHeight;   // normal.xyz, height km
uniform samplerCube tMask;     // plains, fresh, lrm
uniform sampler2D tCdf;
uniform sampler2D tBB;         // blackbody: r = log10 radiance (units), gba = colour per unit luminance
uniform vec2 uBBRange;         // ln Tmin, ln Tmax of tBB
uniform mat3 uBodyToWorld;
uniform vec3 uSun, uSunBody, uSunE;
uniform float uSunAng;
uniform vec3 uCut0, uCut1, uCut2;
uniform float uCutOn;
uniform float uRkm, uTexelAng;
uniform float uRelief;          // remaining natural relief (0..1)
uniform float uLayer;           // exposed layer where strip-mined: 0 crust, 1 mantle, 2 core
uniform vec3 uSite[NS];
uniform float uFill[NS];
uniform float uThIn[NS];
uniform float uThMax[NS];
uniform float uArea[NS];
uniform float uMineShare;
uniform float uPVAlb;
uniform float uTrad;            // K, night-side radiators that shed the industry's waste heat
uniform float uEps;
uniform float uThermal, uTss, uTnight, uTlo, uThi;
uniform vec3 C_REG, C_HRP, C_LRM, C_FRESH, C_MINE, C_MANTLE, C_IRON;

${NOISE_GLSL}
${DISPLAY_GLSL}

// x: industrial (0..1), y: strip-mined (0..1), z: perturbed angle from the district centre, w: district
vec4 industry(vec3 pb){
  float bd = -2.0; int bk = 0;
  for (int k = 0; k < NS; k++) { float d = dot(pb, uSite[k]); if (d > bd) { bd = d; bk = k; } }
  float fill = uFill[bk];
  if (fill <= 0.0) return vec4(0.0, 0.0, 0.0, float(bk));
  float th = 2.0 * asin(min(1.0, length(pb - uSite[bk]) * 0.5));
  float n = vnoise(pb * 31.0 + float(bk) * 3.7) * 0.65 + vnoise(pb * 97.0) * 0.35;
  float thp = th * (1.0 + 0.6 * (n - 0.5));
  float u;
  if (thp < uThIn[bk]) { float sh = sin(thp * 0.5); u = sh * sh / uArea[bk]; }
  else {
    float x = clamp((thp - uThIn[bk]) / (uThMax[bk] - uThIn[bk]), 0.0, 1.0);
    u = texture(tCdf, vec2(x * (63.0 / 64.0) + 0.5 / 64.0, (float(bk) + 0.5) / float(NS))).r;
  }
  if (fill >= 0.9999) u = 0.0;
  float aa = fwidth(u) * 0.75 + 1e-12;
  float ind = 1.0 - smoothstep(fill - aa, fill + aa, u);
  float mf = fill * uMineShare;
  float mine = uMineShare >= 0.9999 ? 1.0 : 1.0 - smoothstep(mf - aa, mf + aa, u);
  return vec4(ind, mine * ind, thp, float(bk));
}

// Fraction of the solar disc visible from a point (horizon march through the height map).
float sunVisibility(vec3 pb, float h0, float e){
  vec3 tdir = normalize(uSunBody - dot(uSunBody, pb) * pb);
  float te = tan(e);
  float vis = 1.0;
  float d = 1.6;
  for (int i = 0; i < 9; i++) {
    float ang = d / uRkm;
    vec3 q = normalize(pb * cos(ang) + tdir * sin(ang));
    float lod = clamp(log2(d / (uTexelAng * uRkm)) - 0.5, 0.0, 6.0);
    float hq = textureLod(tHeight, q, lod).w * uRelief;
    float hray = h0 + d * te + d * d / (2.0 * uRkm);
    vis = min(vis, clamp(0.5 - (hq - hray) / (d * 2.0 * uSunAng), 0.0, 1.0));
    d *= 1.75;
  }
  return vis;
}

vec3 blackbody(float T){
  float x = (log(max(T, 1.0)) - uBBRange.x) / (uBBRange.y - uBBRange.x);
  if (x <= 0.0) return vec3(0.0);
  vec4 t = texture(tBB, vec2(clamp(x, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0, 0.5));
  return t.gba * pow(10.0, t.r);
}

void main(){
  vec3 wp = vWorld;
  if (uCutOn > 0.5 && dot(wp, uCut0) > 0.0 && dot(wp, uCut1) > 0.0 && dot(wp, uCut2) > 0.0) discard;
  vec3 pb = normalize(vBody);
  float fp = length(fwidth(pb));

  vec4 hn = texture(tHeight, pb);
  vec4 mk = texture(tMask, pb);
  float relief = uRelief;
  vec3 nb = normalize(mix(pb, normalize(hn.xyz), relief));
  float hkm = hn.w * relief;

  // ---- natural surface ----
  vec3 alb = C_REG;
  alb = mix(alb, C_HRP, mk.r);
  alb = mix(alb, C_LRM, mk.b * (1.0 - 0.6 * mk.r));
  alb = mix(alb, C_FRESH, mk.g);
  float det = aaNoise(pb, 700.0, fp) * 0.55 + aaNoise(pb, 2300.0, fp) * 0.45;
  alb *= 0.86 + 0.28 * det;

  // ---- industry ----
  vec4 ind = industry(pb);
  // strip mines: fresh crust, then mantle, then iron core as the planet shrinks
  vec3 rock = uLayer < 0.5 ? C_MINE : (uLayer < 1.5 ? C_MANTLE : C_IRON);
  float bench = aaNoise(vec3(ind.z * 1400.0, 0.0, ind.w), 1.0, fwidth(ind.z) * 1400.0);
  vec3 mineCol = rock * (0.85 + 0.3 * bench) * (0.9 + 0.2 * det);
  // PV fields: rows of dark panels with bright service gaps
  float rowCoord = dot(pb, vec3(0.0, 1.0, 0.0)) * uRkm / 1.2;   // ~1.2 km rows
  float rowF = fwidth(rowCoord);
  float gap = mix(0.12, smoothstep(0.86, 0.9, fract(rowCoord)), 1.0 - smoothstep(0.2, 0.6, rowF));
  vec3 pvCol = mix(uPVAlb * vec3(0.75, 0.85, 1.25), C_FRESH * 0.8, gap);
  vec3 indCol = mix(pvCol, mineCol, ind.y);
  alb = mix(alb, indCol, ind.x);
  float isPV = ind.x * (1.0 - ind.y) * (1.0 - gap);

  // ---- light ----
  vec3 n = uBodyToWorld * nb;
  vec3 m = normalize(wp);
  vec3 v = normalize(cameraPosition - wp);
  float mu0 = dot(n, uSun);
  float mu = max(dot(n, v), 0.02);
  float e = asin(clamp(dot(m, uSun), -1.0, 1.0));
  float vis = 1.0;
  if (e < -0.08) vis = 0.0;
  else if (e < 0.45) vis = sunVisibility(pb, hkm, e);
  // lunar-Lambert photometry (McEwen 1991): airless regolith shows little limb darkening
  float a = degrees(acos(clamp(dot(uSun, v), -1.0, 1.0)));
  float L = clamp(1.0 + a * (-0.019 + a * (0.000242 - 0.00000146 * a)), 0.0, 1.0);
  float refl = mu0 > 0.0 ? (2.0 * L * mu0 / (mu0 + mu) + (1.0 - L) * mu0) : 0.0;
  vec3 col = alb * uSunE * (refl * vis / PI);
  // glass-covered PV: a broad specular sheen (Fresnel ~4%)
  vec3 hv = normalize(uSun + v);
  float sp = pow(max(dot(n, hv), 0.0), 90.0) * (90.0 + 8.0) / (8.0 * PI) * 0.04;
  col += isPV * uSunE * sp * max(mu0, 0.0) * vis;

  // ---- temperature ----
  float cz = max(mu0, 0.0) * vis;
  float lon = atan(-wp.z, wp.x);                       // 0 at noon, +pi/2 at dusk
  float sinceDusk = mod(lon - 1.5707963 + 6.2831853, 6.2831853);
  float tn = uTnight * (1.0 + 0.45 * exp(-sinceDusk / 0.35));
  // radiators work on the night side only; their flux varies from field to field (mean 1)
  float night = 1.0 - smoothstep(-0.12, 0.02, dot(m, uSun));
  float mott = 0.45 + 1.1 * (vnoise(pb * 7.0 + ind.w) * 0.7 + vnoise(pb * 23.0) * 0.3);
  float ti = uTrad * ind.x * night * pow(mott, 0.25);
  float T = pow(pow(uTss, 4.0) * cz + pow(tn, 4.0) + pow(ti, 4.0), 0.25);

  if (uThermal > 0.5) {
    float t = log(T / uTlo) / log(uThi / uTlo);
    gl_FragColor = vec4(toLinear(inferno(t)), 1.0);
    return;
  }
  col += uEps * blackbody(T);
  gl_FragColor = vec4(col, 1.0);
}
`;
}

export const CUT_VERT = /* glsl */`
uniform vec3 uA, uB;
uniform float uR;
varying vec3 vWorld;
void main(){
  vec3 wp = (position.x * uA + position.y * uB) * uR;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const CUT_FRAG = /* glsl */`
precision highp float;
#define PI 3.14159265359
varying vec3 vWorld;
uniform vec3 uN, uSun, uSunE;
uniform float uR;             // current radius, scene units
uniform float uKmPerUnit;
uniform float uR0km, uRcoreKm, uCrustKm;
uniform float uComp;          // undo auto-exposure: the cutaway is an illustration
uniform float uThermal, uTlo, uThi;
uniform vec4 uTprof;          // surface K, lid base K, lid depth km, mantle base K
uniform vec2 uTcore;          // core top K, centre K
uniform vec3 C_CRUST, C_MANTLE, C_CORE;
${NOISE_GLSL}
${DISPLAY_GLSL}
float line(float x, float at, float w){ float d = abs(x - at); return 1.0 - smoothstep(w * 0.5, w * 1.5, d); }
void main(){
  float r = length(vWorld);
  if (r > uR) discard;
  float rkm = r * uKmPerUnit;
  float depth = uR0km - rkm;
  float core = 1.0 - smoothstep(uRcoreKm - 1.0, uRcoreKm + 1.0, rkm);
  float crust = depth < uCrustKm ? 1.0 : 0.0;
  vec3 p = vWorld * uKmPerUnit;
  float fp = length(fwidth(p));
  float g = aaNoise(p, 0.02, fp) * 0.5 + aaNoise(p, 0.07, fp) * 0.3 + aaNoise(p, 0.25, fp) * 0.2;
  vec3 alb = mix(C_MANTLE, C_CRUST, crust);
  alb = mix(alb, C_CORE, core);
  alb *= 0.82 + 0.36 * g;
  float w = fwidth(rkm);
  float lines = max(line(rkm, uRcoreKm, w * 1.2) * step(uRcoreKm, uR * uKmPerUnit - 2.0 * w),
                    line(depth, uCrustKm, w) * step(uCrustKm, depth + 0.0) * step(rkm, uR * uKmPerUnit - 2.0 * w) * 0.6);
  vec3 v = normalize(cameraPosition - vWorld);
  float lam = 0.18 + 0.5 * max(dot(uN, uSun), 0.0) + 0.45 * max(dot(uN, v), 0.0);
  vec3 col = alb * uSunE * lam / PI * uComp;
  col = mix(col, uSunE / PI * 0.32 * uComp, lines * 0.7);
  if (uThermal > 0.5) {
    float T;
    if (rkm < uRcoreKm) T = mix(uTcore.y, uTcore.x, (rkm / uRcoreKm) * (rkm / uRcoreKm));
    else if (depth < uTprof.z) T = mix(uTprof.x, uTprof.y, depth / uTprof.z);
    else T = mix(uTprof.y, uTprof.w, (depth - uTprof.z) / max(1.0, uR0km - uRcoreKm - uTprof.z));
    float t = log(T / uTlo) / log(uThi / uTlo);
    vec3 c = inferno(t) * (0.9 + 0.1 * g);
    c = mix(c, vec3(0.85), lines * 0.6);
    gl_FragColor = vec4(toLinear(c), 1.0);
    return;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export const DRIVER_VERT = /* glsl */`
uniform mat3 uBodyToWorld;
uniform float uR;
varying vec3 vWorld;
void main(){
  vec3 wp = uBodyToWorld * position * uR * 1.0004;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const DRIVER_FRAG = /* glsl */`
precision highp float;
#define PI 3.14159265359
varying vec3 vWorld;
uniform vec3 uSun, uSunE;
uniform vec3 uCut0, uCut1, uCut2;
uniform float uCutOn, uAlb, uGlow;
void main(){
  if (uCutOn > 0.5 && dot(vWorld, uCut0) > 0.0 && dot(vWorld, uCut1) > 0.0 && dot(vWorld, uCut2) > 0.0) discard;
  float mu0 = dot(normalize(vWorld), uSun);
  vec3 col = uAlb * uSunE * max(mu0, 0.0) * smoothstep(-0.004, 0.01, mu0) / PI;
  gl_FragColor = vec4(col + uGlow, 1.0);
}
`;

export const PARTICLE_VERT = /* glsl */`
attribute float aLit;
uniform float uSize;
varying float vLit;
void main(){
  vLit = aLit;
  gl_PointSize = uSize;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

export const PARTICLE_FRAG = /* glsl */`
precision highp float;
varying float vLit;
uniform vec3 uCol;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0 || vLit <= 0.001) discard;
  gl_FragColor = vec4(uCol * vLit * (1.0 - 0.5 * r), 1.0);
}
`;

export const SUN_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const SUN_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec3 uCol;
void main(){
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float mu = sqrt(1.0 - r2);
  gl_FragColor = vec4(uCol * (1.0 - 0.6 * (1.0 - mu)), 1.0);   // limb darkening, u = 0.6
}
`;

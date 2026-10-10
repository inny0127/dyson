// Procedural Mercury terrain, baked once into cube maps on the GPU.
//
// Nothing here is a map of the real Mercury: it is a surface with Mercury's statistics.
//  - Heavily cratered terrain, crater depth/diameter after Pike (1988, in "Mercury", Univ. Arizona Press):
//    simple craters d ≈ 0.2 D; complex craters (D ≳ 12 km on Mercury) d ≈ 0.35 √D km.
//  - Smooth (volcanic) plains cover ~27% of the surface (Denevi et al. 2013, JGR Planets 118):
//    a northern smooth-plains cap, Caloris-like basin fill and scattered patches; older craters buried.
//  - Large basins: one Caloris-scale (D ≈ 1,550 km), two Rembrandt/Beethoven-scale (≈ 700 km).
//  - Lobate scarps: thrust-fault cliffs 1–3 km high, hundreds of km long (global contraction).
//  - Bright young rayed craters (Hokusai/Kuiper/Debussy-like) and dark low-reflectance material (LRM).
//
// Outputs (body frame, sampled with a direction):
//   tHeight: RGBA16F  rgb = surface normal, a = height (km above the mean sphere)
//   tMask:   RGBA8    r = smooth plains, g = fresh/rays, b = low-reflectance material, a = unused

import * as THREE from 'three';

const R_KM = 2439.7;

const COMMON = /* glsl */`
#define R_KM ${R_KM.toFixed(1)}
float h13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 h33(vec3 p3){ p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = h13(i), b = h13(i + vec3(1,0,0)), c = h13(i + vec3(0,1,0)), d = h13(i + vec3(1,1,0));
  float e = h13(i + vec3(0,0,1)), g = h13(i + vec3(1,0,1)), k = h13(i + vec3(0,1,1)), l = h13(i + vec3(1,1,1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(k, l, u.x), u.y), u.z);
}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s / 0.97; }
float angDist(vec3 a, vec3 b){ return 2.0 * asin(min(1.0, length(a - b) * 0.5)); }
`;

const BAKE_VERT = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// Pass 1: height (km) + masks
const HEIGHT_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
${COMMON}
uniform vec4 uBasin[3];   // xyz centre, w radius (rad)
uniform vec4 uRay[4];     // xyz centre, w radius (rad)
uniform vec4 uScarpN[7];  // xyz pole of the fault's great circle, w height (km)
uniform vec4 uScarpM[7];  // xyz midpoint on the circle, w half length (rad)

// Crater profile in km. x = distance / radius, D = diameter in km, degr in (0,1] softens old craters.
float crater(float x, float D, float degr){
  float depth = min(0.2 * D, 0.35 * sqrt(D)) * degr;
  float rim = 0.28 * depth;
  float floorR = D < 14.0 ? 0.0 : clamp(0.22 + 0.12 * log2(D / 14.0), 0.22, 0.6);
  float h;
  if (x < 1.0) {
    float t = clamp((x - floorR) / (1.0 - floorR), 0.0, 1.0);
    h = -depth + (depth + rim) * pow(t, 2.2);
    float peak = smoothstep(22.0, 40.0, D) * (1.0 - smoothstep(130.0, 220.0, D));
    h += depth * 0.45 * peak * exp(-x * x / 0.018);
    float ring = smoothstep(150.0, 260.0, D);
    h += depth * 0.3 * ring * exp(-pow((x - 0.48) / 0.06, 2.0));
  } else {
    h = rim * pow(x, -3.5) * (1.0 - smoothstep(1.55, 2.0, x));
  }
  return h;
}

void main(){
  vec3 p = normalize(vDir);
  float plains = 0.0, fresh = 0.0, lrm = 0.0;

  // --- Smooth plains: northern cap + scattered patches (+ basin fill below) ---
  float wob = fbm(p * 3.0 + 11.0) - 0.5;
  plains = smoothstep(0.80, 0.86, p.y + 0.16 * wob);
  plains = max(plains, smoothstep(0.64, 0.70, fbm(p * 2.2 + vec3(3.1, 7.7, 1.3))));

  // --- Low-reflectance material: large patches, stronger around old basins ---
  lrm = smoothstep(0.60, 0.74, fbm(p * 2.7 + vec3(5.0, 1.0, 9.0))) * 0.85;

  // --- Long-wavelength topography ---
  float h = (fbm(p * 1.6 + 2.0) - 0.5) * 2.4;

  // --- Basins ---
  for (int i = 0; i < 3; i++) {
    vec3 c = normalize(uBasin[i].xyz);
    float r = uBasin[i].w;
    float x = angDist(p, c) / r;
    if (x > 2.2) continue;
    float rough = fbm(p * 38.0 + float(i) * 7.0);
    float fill = i == 0 ? 1.0 : 0.65;
    h += -2.2 * (1.0 - smoothstep(0.72, 1.0, x));
    h += 2.4 * exp(-pow((x - 1.0) / 0.085, 2.0)) * (0.35 + 1.1 * rough);
    h += 0.6 * smoothstep(1.0, 1.08, x) * (1.0 - smoothstep(1.1, 2.0, x)) * rough;
    plains = max(plains, fill * (1.0 - smoothstep(0.80, 0.9, x + 0.08 * (rough - 0.5))));
    if (i > 0) lrm = max(lrm, 0.7 * smoothstep(0.95, 1.15, x) * (1.0 - smoothstep(1.3, 2.1, x)) * smoothstep(0.45, 0.6, rough));
  }

  // --- Craters: 7 octaves, 3D cell noise restricted to a shell around the sphere ---
  for (int o = 0; o < 7; o++) {
    float fo = float(o);
    float freq = 3.0 * exp2(fo);
    vec3 q = p * freq;
    vec3 b = floor(q - 0.5);
    float density = o < 2 ? 0.75 : 0.9;
    for (int i = 0; i < 8; i++) {
      vec3 cell = b + vec3(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1));
      vec3 r3 = h33(cell + fo * 31.7);
      vec3 fp = (cell + r3) / freq;
      float lf = length(fp);
      if (abs(lf - 1.0) > 0.5 / freq) continue;
      vec3 r4 = h33(cell * 1.31 + fo * 7.3 + 11.1);
      if (r4.x > density) continue;
      vec3 cdir = fp / lf;
      float rr = (0.08 + 0.17 * r4.y * r4.y) / freq;
      float x = angDist(p, cdir) / rr;
      if (x >= 2.0) continue;
      float D = 2.0 * rr * R_KM;
      float age = r4.z;
      float degr = mix(0.25, 1.0, age * age);
      float keep = age > 0.8 ? 1.0 : 1.0 - 0.92 * plains;
      h += crater(x, D, degr) * keep;
      if (age > 0.955) fresh = max(fresh, (1.0 - smoothstep(0.8, 1.9, x)) * 0.75);
    }
  }

  // --- Wrinkle ridges on the plains ---
  float rn = 1.0 - abs(2.0 * vnoise(p * 55.0 + 3.0) - 1.0);
  h += plains * 0.35 * pow(rn, 10.0);

  // --- Lobate scarps ---
  for (int i = 0; i < 7; i++) {
    vec3 n = normalize(uScarpN[i].xyz);
    vec3 m = normalize(uScarpM[i].xyz);
    float side = dot(p, n);
    vec3 onC = normalize(p - side * n);
    float along = angDist(onC, m);
    float half_ = uScarpM[i].w;
    if (along > half_) continue;
    float env = 1.0 - smoothstep(0.55 * half_, half_, along);
    float s = asin(clamp(side, -1.0, 1.0)) * R_KM + 9.0 * (vnoise(p * 22.0 + float(i)) - 0.5);
    h += uScarpN[i].w * env * smoothstep(-2.5, 2.5, s) * exp(-max(s, 0.0) / 32.0);
  }

  // --- Rayed craters ---
  for (int i = 0; i < 4; i++) {
    vec3 c = normalize(uRay[i].xyz);
    float r = uRay[i].w;
    float d = angDist(p, c);
    float x = d / r;
    if (x < 2.0) h += crater(x, 2.0 * r * R_KM, 1.0);
    float reach = r * (14.0 + 6.0 * float(i == 0) * 2.0);
    if (d > reach) continue;
    vec3 t1 = normalize(cross(c, abs(c.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(c, t1);
    float az = atan(dot(p, t2), dot(p, t1));
    vec2 cs = vec2(cos(az), sin(az));
    float seed = float(i) * 13.0;
    float broad = vnoise(vec3(cs * 6.0, seed));
    float fine = vnoise(vec3(cs * 46.0, seed + 5.0));
    float streak = pow(max(0.0, 0.62 * fine + 0.55 * broad - 0.42), 1.6) * 3.2;
    float along = 0.45 + 0.75 * vnoise(vec3(cs * 18.0, d / r * 0.9 + seed));
    float env = exp(-(d - r) / (reach * 0.33));
    float blanket = 1.0 - smoothstep(1.15, 2.5, x);
    float ray = max(blanket, streak * along * env * step(1.0, x));
    fresh = max(fresh, clamp(ray, 0.0, 1.0));
  }

  gl_FragColor = vec4(h, plains, fresh, lrm);
}
`;

// Pass 2a: normals from heights (central differences, one texel apart)
const NORMAL_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform samplerCube tSrc;
uniform float uEps; // radians per texel
${COMMON}
float H(vec3 d){ return textureLod(tSrc, d, 0.0).r; }
void main(){
  vec3 p = normalize(vDir);
  vec3 t1 = normalize(cross(abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), p));
  vec3 t2 = cross(p, t1);
  float e = uEps;
  float g1 = (H(normalize(p + e * t1)) - H(normalize(p - e * t1))) / (2.0 * e * R_KM);
  float g2 = (H(normalize(p + e * t2)) - H(normalize(p - e * t2))) / (2.0 * e * R_KM);
  vec3 n = normalize(p - g1 * t1 - g2 * t2);
  gl_FragColor = vec4(n, H(p));
}
`;

// Pass 2b: copy masks into an 8-bit target
const MASK_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform samplerCube tSrc;
void main(){ vec4 a = textureLod(tSrc, normalize(vDir), 0.0); gl_FragColor = vec4(a.g, a.b, a.a, 1.0); }
`;

function dir(lonDeg, latDeg) {
  const lo = (lonDeg * Math.PI) / 180, la = (latDeg * Math.PI) / 180;
  // body frame: +y north, longitude measured from +x toward -z (east, as the planet spins)
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}

/** Bake the terrain. Returns { tHeight, tMask, faceSize, dispose() }. */
export function bakeTerrain(renderer, faceSize = 1024) {
  const deg = Math.PI / 180;
  const radOf = km => km / R_KM;
  const box = new THREE.BoxGeometry(2, 2, 2);
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(box);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const mk = (fragmentShader, uniforms) => new THREE.ShaderMaterial({
    vertexShader: BAKE_VERT, fragmentShader, uniforms, side: THREE.BackSide, depthTest: false, depthWrite: false,
  });

  // Feature placement (procedural, Mercury-like; not real coordinates).
  const basins = [
    [dir(-20, 32), radOf(1550 / 2)],   // Caloris-scale
    [dir(150, -33), radOf(715 / 2)],   // Rembrandt-scale
    [dir(-110, -20), radOf(630 / 2)],  // Beethoven-scale
  ].map(([v, r]) => new THREE.Vector4(v.x, v.y, v.z, r));
  const rays = [
    [dir(35, 57), radOf(114 / 2)],     // Hokusai-like: longest ray system
    [dir(-60, -11), radOf(62 / 2)],    // Kuiper-like
    [dir(95, -34), radOf(80 / 2)],     // Debussy-like
    [dir(-150, 37), radOf(52 / 2)],    // Degas-like
  ].map(([v, r]) => new THREE.Vector4(v.x, v.y, v.z, r));
  // Lobate scarps: pole of the fault plane, height (km); midpoint and half-length (rad)
  const scarpDefs = [
    [10, -20, 70, 1.5, 300], [60, 25, 20, 2.0, 400], [-40, -45, 110, 1.2, 250],
    [120, 10, 150, 1.8, 350], [-95, 40, 30, 1.0, 220], [170, -55, 80, 1.4, 300], [-15, 5, 160, 2.6, 500],
  ];
  const scarpN = [], scarpM = [];
  for (const [lon, lat, strikeDeg, hKm, halfKm] of scarpDefs) {
    const m = dir(lon, lat);
    const east = new THREE.Vector3(0, 1, 0).cross(m).normalize();
    const north = m.clone().cross(east).normalize();
    const strike = east.clone().multiplyScalar(Math.cos(strikeDeg * deg)).addScaledVector(north, Math.sin(strikeDeg * deg));
    const n = m.clone().cross(strike).normalize();
    scarpN.push(new THREE.Vector4(n.x, n.y, n.z, hKm));
    scarpM.push(new THREE.Vector4(m.x, m.y, m.z, radOf(halfKm)));
  }

  const rtRaw = new THREE.WebGLCubeRenderTarget(faceSize, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
  });
  const tHeightRT = new THREE.WebGLCubeRenderTarget(faceSize, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
  });
  const tMaskRT = new THREE.WebGLCubeRenderTarget(faceSize, {
    type: THREE.UnsignedByteType, format: THREE.RGBAFormat, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
  });

  const cam = (rt) => new THREE.CubeCamera(0.1, 10, rt);

  mesh.material = mk(HEIGHT_FRAG, {
    uBasin: { value: basins }, uRay: { value: rays }, uScarpN: { value: scarpN }, uScarpM: { value: scarpM },
  });
  cam(rtRaw).update(renderer, scene);

  mesh.material.dispose();
  mesh.material = mk(NORMAL_FRAG, { tSrc: { value: rtRaw.texture }, uEps: { value: (Math.PI / 2) / faceSize } });
  cam(tHeightRT).update(renderer, scene);

  mesh.material.dispose();
  mesh.material = mk(MASK_FRAG, { tSrc: { value: rtRaw.texture } });
  cam(tMaskRT).update(renderer, scene);

  mesh.material.dispose();
  box.dispose();
  rtRaw.dispose();

  return {
    tHeight: tHeightRT.texture,
    tMask: tMaskRT.texture,
    faceSize,
    features: { basins, rays },
    dispose() { tHeightRT.dispose(); tMaskRT.dispose(); },
  };
}

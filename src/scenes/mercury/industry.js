// Industrial districts on Mercury's surface.
//
// The industrial footprint (PV fields + strip mines) is a fraction phi of the surface computed from
// the model. This module turns that number into a picture whose painted area equals phi:
//  - K district sites; the sphere is split into their Voronoi cells.
//  - For each cell we tabulate u(theta) = fraction of the cell within angle theta of its site
//    (exact spherical-cap area while the cap is inside the cell, Monte-Carlo beyond).
//  - A footprint fraction phi is shared among the districts (older districts larger, new districts
//    founded as industry grows), with every cell filled to fraction c_k, sum_k a_k c_k = phi.
//  - The shader paints a point industrial when u_k(theta) < c_k.

import * as THREE from 'three';

export const N_SITES = 24;
const BINS = 64;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const angle = (a, b) => 2 * Math.asin(Math.min(1, a.distanceTo(b) / 2));

/**
 * @param {THREE.Vector3} seedDir body-frame direction of the first (seed) site
 */
export function createIndustry(seedDir) {
  const rng = mulberry32(20240611);

  // Fibonacci lattice, randomly rotated, jittered; the point nearest seedDir becomes site 0.
  const pts = [];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 6.28, rng() * 6.28, rng() * 6.28));
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N_SITES; i++) {
    const y = 1 - (2 * (i + 0.5)) / N_SITES;
    const r = Math.sqrt(1 - y * y);
    const v = new THREE.Vector3(Math.cos(ga * i) * r, y, Math.sin(ga * i) * r).applyQuaternion(q);
    v.x += (rng() - 0.5) * 0.18; v.y += (rng() - 0.5) * 0.18; v.z += (rng() - 0.5) * 0.18;
    // keep districts off the poles (low sun, and nothing special about them here)
    v.y *= 0.85;
    pts.push(v.normalize());
  }
  let best = 0;
  for (let i = 1; i < N_SITES; i++) if (pts[i].dot(seedDir) > pts[best].dot(seedDir)) best = i;
  [pts[0], pts[best]] = [pts[best], pts[0]];
  pts[0].copy(seedDir).normalize();
  // activation order of the other districts: random
  const rest = pts.slice(1);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const sites = [pts[0], ...rest];

  // district k is founded when the footprint reaches 10^tau_k of the surface
  const tau = sites.map((_, k) => (k === 0 ? -14 : -4.6 + 3.8 * ((k - 1) / (N_SITES - 2)) ** 0.9));

  // inscribed cap radius of each Voronoi cell
  const thIn = sites.map((s, k) => {
    let m = Infinity;
    for (let j = 0; j < N_SITES; j++) if (j !== k) m = Math.min(m, angle(s, sites[j]));
    return m / 2;
  });
  const capFrac = th => Math.sin(th / 2) ** 2; // spherical cap area / sphere area

  // Monte Carlo of each cell beyond its inscribed cap
  const N = 240000;
  const angles = sites.map(() => []);
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const z = 2 * rng() - 1, ph = 2 * Math.PI * rng(), r = Math.sqrt(1 - z * z);
    v.set(r * Math.cos(ph), z, r * Math.sin(ph));
    let bk = 0, bd = -2;
    for (let k = 0; k < N_SITES; k++) { const d = v.dot(sites[k]); if (d > bd) { bd = d; bk = k; } }
    const th = angle(v, sites[bk]);
    if (th >= thIn[bk]) angles[bk].push(th);
  }
  const thMax = [], area = [], table = [];
  for (let k = 0; k < N_SITES; k++) {
    const a = angles[k].sort((x, y) => x - y);
    const tMax = a.length ? a[a.length - 1] * 1.0001 : thIn[k] * 1.0001;
    const inner = capFrac(thIn[k]);
    const ak = inner + a.length / N;
    thMax.push(tMax); area.push(ak);
    const row = new Float32Array(BINS);
    let j = 0;
    for (let b = 0; b < BINS; b++) {
      const th = thIn[k] + ((tMax - thIn[k]) * b) / (BINS - 1);
      while (j < a.length && a[j] <= th) j++;
      row[b] = Math.min(1, (inner + j / N) / ak);
    }
    row[BINS - 1] = 1;
    table.push(row);
  }
  // normalise areas to sum to one
  const sumA = area.reduce((s, x) => s + x, 0);
  const areaRaw = area.slice(); // cell area in the table's units (shader uses these)
  for (let k = 0; k < N_SITES; k++) area[k] /= sumA;

  const data = new Uint16Array(BINS * N_SITES);
  for (let k = 0; k < N_SITES; k++) for (let b = 0; b < BINS; b++) data[k * BINS + b] = THREE.DataUtils.toHalfFloat(table[k][b]);
  const cdfTex = new THREE.DataTexture(data, BINS, N_SITES, THREE.RedFormat, THREE.HalfFloatType);
  cdfTex.minFilter = cdfTex.magFilter = THREE.LinearFilter;
  cdfTex.wrapS = cdfTex.wrapT = THREE.ClampToEdgeWrapping;
  cdfTex.needsUpdate = true;

  /** Fill fraction of each cell for a total footprint phi (0..1). */
  function allocate(phi, out = new Float32Array(N_SITES)) {
    out.fill(0);
    if (!(phi > 0)) return out;
    if (phi >= 1) { out.fill(1); return out; }
    const lp = Math.log10(phi);
    const w = tau.map((t, k) => Math.max(0, lp - t) + (k === 0 ? 1 : 0));
    // water-filling: find lambda with sum a_k min(1, lambda w_k) = phi
    const total = l => w.reduce((s, wk, k) => s + area[k] * Math.min(1, l * wk), 0);
    let lo = 0, hi = 1;
    while (total(hi) < phi && hi < 1e30) hi *= 4;
    for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (total(mid) < phi) lo = mid; else hi = mid; }
    for (let k = 0; k < N_SITES; k++) out[k] = Math.min(1, hi * w[k]);
    return out;
  }

  /** Angle from site k that encloses cell fraction u. */
  function invCdf(k, u) {
    const target = u * areaRaw[k];
    const inner = capFrac(thIn[k]);
    if (target <= inner) return 2 * Math.asin(Math.sqrt(Math.max(0, target)));
    const row = table[k];
    const uu = u;
    let b = 0;
    while (b < BINS - 1 && row[b + 1] < uu) b++;
    const u0 = row[b], u1 = row[Math.min(BINS - 1, b + 1)];
    const f = u1 > u0 ? (uu - u0) / (u1 - u0) : 0;
    return thIn[k] + ((thMax[k] - thIn[k]) * (b + Math.min(1, Math.max(0, f)))) / (BINS - 1);
  }

  const tmpFill = new Float32Array(N_SITES);
  /** A random body-frame point inside the footprint of total size phi. */
  function samplePoint(phi, r) {
    allocate(phi, tmpFill);
    let tot = 0;
    for (let k = 0; k < N_SITES; k++) tot += area[k] * tmpFill[k];
    for (let attempt = 0; attempt < 12; attempt++) {
      let x = r() * tot, k = 0;
      for (; k < N_SITES - 1; k++) { x -= area[k] * tmpFill[k]; if (x <= 0) break; }
      const th = invCdf(k, r() * tmpFill[k] * 0.8);
      const s = sites[k];
      const t1 = new THREE.Vector3(0, 1, 0).cross(s).normalize();
      const t2 = s.clone().cross(t1);
      const az = r() * Math.PI * 2;
      const p = s.clone().multiplyScalar(Math.cos(th))
        .addScaledVector(t1, Math.sin(th) * Math.cos(az)).addScaledVector(t2, Math.sin(th) * Math.sin(az)).normalize();
      let bk = 0, bd = -2;
      for (let j = 0; j < N_SITES; j++) { const d = p.dot(sites[j]); if (d > bd) { bd = d; bk = j; } }
      if (bk === k) return p;
    }
    return sites[0].clone();
  }

  return { sites, tau, thIn, thMax, area, areaRaw, cdfTex, allocate, samplePoint, rng: mulberry32 };
}

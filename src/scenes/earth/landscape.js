// Low-poly landscape around the observer: a meadow, rolling hills, a forested far ridge (kept low to
// the south so Scorpius, Sagittarius and the antisolar point stay above it), trees and a small
// observatory. One merged, flat-shaded geometry with per-vertex albedo and 8–14 µm emissivity.
// World frame: x = east, y = up, z = south.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D value noise + fbm
function hash2(ix, iy) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, oct = 5) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x, y); n += a; x = x * 2.03 + 11.7; y = y * 2.03 - 5.3; a *= 0.5; }
  return s / n;
}
function ridged(x, y, oct = 5) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(2 * vnoise(x, y) - 1)); n += a; x = x * 2.1 + 3.1; y = y * 2.1 + 7.7; a *= 0.5; }
  return s / n;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Azimuth from north through east, radians, for world (x, z). */
export const azimuthOf = (x, z) => Math.atan2(x, -z);

/** Terrain height (m) at world (x, z). */
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const az = azimuthOf(x, z);
  const south = Math.cos(az - Math.PI);                 // 1 due south, −1 due north
  let h = 0;
  // Meadow: the observer stands on a gentle rise; ground falls away slightly to the south.
  h += 1.2 * (fbm(x / 60, z / 60, 3) - 0.5) - 0.012 * Math.max(0, z) * smooth(10, 120, r);
  // Rolling hills
  h += smooth(60, 700, r) * 46 * (fbm(x / 520 + 3.1, z / 520 - 1.7) - 0.38);
  // Far ridge: forested hills, low to the south (≈1.5° high), higher to the north (≈5°).
  const ridgeAmp = 55 + 220 * smooth(0.95, -0.4, south);
  h += smooth(1100, 2600, r) * ridgeAmp * (0.35 + 0.9 * ridged(x / 1400 + 7.3, z / 1400 + 2.2));
  // A knoll for the observatory (SW, 70 m)
  h += 3.2 * Math.exp(-((x - OBS.x) ** 2 + (z - OBS.z) ** 2) / (2 * 22 * 22));
  // Flatten right at the observer
  return h * smooth(1.5, 14, r);
}

const OBS_AZ = (212 * Math.PI) / 180, OBS_R = 68;
export const OBS = { x: OBS_R * Math.sin(OBS_AZ), z: -OBS_R * Math.cos(OBS_AZ) };

// Albedos (visible, linear RGB) and 8–14 µm emissivities.
const MAT = {
  meadowDry: { a: [0.21, 0.18, 0.11], e: 0.96 },   // summer grass, albedo ~0.18
  meadowGreen: { a: [0.09, 0.13, 0.06], e: 0.97 },
  forest: { a: [0.035, 0.05, 0.035], e: 0.98 },     // conifer canopy, albedo ~0.05
  rock: { a: [0.2, 0.19, 0.17], e: 0.93 },
  conifer: { a: [0.03, 0.05, 0.035], e: 0.98 },
  leaf: { a: [0.05, 0.08, 0.04], e: 0.97 },
  trunk: { a: [0.07, 0.055, 0.04], e: 0.95 },
  paint: { a: [0.72, 0.72, 0.70], e: 0.90 },        // white-painted walls (paint is black in the thermal IR)
  dome: { a: [0.55, 0.56, 0.58], e: 0.10 },         // bare aluminium dome: a mirror in the thermal IR
  slit: { a: [0.18, 0.18, 0.19], e: 0.12 },
  roof: { a: [0.08, 0.08, 0.09], e: 0.92 },
  door: { a: [0.12, 0.09, 0.07], e: 0.93 },
};

function finish(geom, mat, jitter = 0, rand = Math.random) {
  let g = geom.index ? geom.toNonIndexed() : geom;
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), eps = new Float32Array(n);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + jitter * (rand() - 0.5) * 2;
    for (let j = 0; j < 3; j++) {
      col[(i + j) * 3] = mat.a[0] * k; col[(i + j) * 3 + 1] = mat.a[1] * k; col[(i + j) * 3 + 2] = mat.a[2] * k;
      eps[i + j] = mat.e;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('eps', new THREE.BufferAttribute(eps, 1));
  return g;
}

function terrainGeometry(rand) {
  const RINGS = 74, SEG = 220, R0 = 0.6, R1 = 3800;
  const ring = i => (i === 0 ? 0 : R0 * (R1 / R0) ** ((i - 1) / (RINGS - 1)));
  const P = [];
  for (let i = 0; i <= RINGS; i++) {
    const r = ring(i);
    const row = [];
    for (let s = 0; s < SEG; s++) {
      const az = (s / SEG) * Math.PI * 2 + (i % 2 ? Math.PI / SEG : 0);
      const x = r * Math.sin(az), z = -r * Math.cos(az);
      row.push([x, heightAt(x, z), z]);
    }
    P.push(row);
  }
  const pos = [], col = [], eps = [];
  const tri = (a, b, c) => {
    pos.push(...a, ...b, ...c);
    const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
    const r = Math.hypot(cx, cz);
    // material by distance, height and noise
    const n1 = fbm(cx / 140 + 9, cz / 140 - 4, 3);
    let m;
    if (r > 900) m = cy > 40 && n1 > 0.72 ? MAT.rock : MAT.forest;
    else if (r > 260 && n1 > 0.55) m = MAT.forest;
    else m = n1 > 0.5 ? MAT.meadowGreen : MAT.meadowDry;
    const k = 0.85 + 0.3 * rand();
    for (let j = 0; j < 3; j++) { col.push(m.a[0] * k, m.a[1] * k, m.a[2] * k); eps.push(m.e); }
  };
  for (let i = 0; i < RINGS; i++) {
    for (let s = 0; s < SEG; s++) {
      const s1 = (s + 1) % SEG;
      const a = P[i][s], b = P[i][s1], c = P[i + 1][s], d = P[i + 1][s1];
      // keep counter-clockwise when seen from above (+y): ring i inner, i+1 outer
      tri(a, c, b);
      tri(b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('eps', new THREE.Float32BufferAttribute(eps, 1));
  g.computeVertexNormals();
  // make sure normals point up
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  return g;
}

function conifer(rand, h) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12 * h / 10, 0.18 * h / 10, 0.25 * h, 5);
  trunk.translate(0, 0.125 * h, 0);
  parts.push(finish(trunk, MAT.trunk, 0.1, rand));
  const tiers = 3 + Math.floor(rand() * 2);
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const rad = (0.26 - 0.17 * f) * h * (0.9 + 0.2 * rand());
    const ch = 0.42 * h * (1 - 0.35 * f);
    const cone = new THREE.ConeGeometry(rad, ch, 7, 1);
    cone.rotateY(rand() * 6.28);
    cone.translate(0, 0.18 * h + f * 0.62 * h + ch / 2, 0);
    parts.push(finish(cone, MAT.conifer, 0.25, rand));
  }
  return mergeGeometries(parts);
}

function broadleaf(rand, h) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16 * h / 9, 0.24 * h / 9, 0.45 * h, 5);
  trunk.translate(0, 0.225 * h, 0);
  parts.push(finish(trunk, MAT.trunk, 0.1, rand));
  const blobs = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < blobs; i++) {
    const r = h * (0.22 + 0.1 * rand());
    const b = new THREE.IcosahedronGeometry(r, 0);
    b.scale(1, 0.8, 1);
    b.rotateY(rand() * 6.28);
    const a = rand() * 6.28, d = i === 0 ? 0 : h * 0.18;
    b.translate(Math.cos(a) * d, h * (0.62 + 0.15 * rand()), Math.sin(a) * d);
    parts.push(finish(b, MAT.leaf, 0.3, rand));
  }
  return mergeGeometries(parts);
}

function observatory(rand) {
  const parts = [];
  const R = 2.6, H = 3.2;
  const wall = new THREE.CylinderGeometry(R, R, H, 20, 1, true);
  wall.translate(0, H / 2, 0);
  parts.push(finish(wall, MAT.paint, 0.03, rand));
  const dome = new THREE.SphereGeometry(R * 1.04, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.translate(0, H, 0);
  parts.push(finish(dome, MAT.dome, 0.04, rand));
  // closed shutter: a raised strip over the top, facing south
  const slit = new THREE.BoxGeometry(0.9, 0.12, R * 2.1);
  slit.translate(0, H + R * 1.04 - 0.02, 0);
  parts.push(finish(slit, MAT.slit, 0, rand));
  const door = new THREE.BoxGeometry(0.9, 2.0, 0.08);
  door.translate(0, 1.0, R + 0.02);
  parts.push(finish(door, MAT.door, 0, rand));
  // warm room / shed next to it
  const shed = new THREE.BoxGeometry(3.6, 2.5, 2.8);
  shed.translate(4.6, 1.25, 1.0);
  parts.push(finish(shed, MAT.paint, 0.03, rand));
  const roof = new THREE.CylinderGeometry(0.01, 2.45, 1.0, 4, 1);
  roof.rotateY(Math.PI / 4);
  roof.scale(1.08, 1, 0.84);
  roof.translate(4.6, 3.0, 1.0);
  parts.push(finish(roof, MAT.roof, 0, rand));
  const g = mergeGeometries(parts);
  g.rotateY(Math.PI - OBS_AZ + 0.4); // door roughly toward the observer
  return g;
}

/** Tree placements: [azimuth°, distance m, height m, kind] — groups chosen to frame the southern sky. */
function treeList(rand) {
  const list = [];
  const add = (az, r, h, kind) => list.push({ az: (az * Math.PI) / 180, r, h, kind });
  // close framing trees (strong silhouettes)
  add(146, 34, 13, 'c'); add(151, 38, 10, 'c'); add(139, 44, 15, 'c'); add(232, 30, 9, 'b'); add(240, 36, 11, 'b');
  add(118, 26, 12, 'c'); add(255, 48, 14, 'c'); add(262, 41, 11, 'c'); add(98, 60, 15, 'b');
  // tree line along a ridge to the SE and SW
  for (let i = 0; i < 26; i++) add(120 + rand() * 45, 170 + rand() * 120, 9 + rand() * 9, rand() < 0.75 ? 'c' : 'b');
  for (let i = 0; i < 22; i++) add(222 + rand() * 50, 140 + rand() * 160, 8 + rand() * 9, rand() < 0.6 ? 'c' : 'b');
  // scattered behind (N, E, W)
  for (let i = 0; i < 40; i++) {
    const az = rand() < 0.5 ? 280 + rand() * 150 : -20 + rand() * 110;
    add(az, 60 + rand() * 260, 8 + rand() * 10, rand() < 0.65 ? 'c' : 'b');
  }
  // a couple of loners in the southern meadow, far enough to stay below the antisolar point
  add(176, 120, 11, 'b'); add(196, 210, 9, 'c'); add(187, 260, 12, 'c');
  return list;
}

export function buildLandscape() {
  const rand = rng(7);
  const parts = [terrainGeometry(rand)];
  for (const t of treeList(rand)) {
    const x = t.r * Math.sin(t.az), z = -t.r * Math.cos(t.az);
    if (Math.hypot(x - OBS.x, z - OBS.z) < 9) continue;
    const g = t.kind === 'c' ? conifer(rand, t.h) : broadleaf(rand, t.h);
    g.rotateY(rand() * 6.28);
    g.translate(x, heightAt(x, z) - 0.3, z);
    parts.push(g);
  }
  const obs = observatory(rand);
  obs.translate(OBS.x, heightAt(OBS.x, OBS.z) - 0.05, OBS.z);
  parts.push(obs);
  const geom = mergeGeometries(parts);
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Elevation angle of the skyline (rad) for each of n azimuth bins, sampled from the terrain height
 * field (trees ignored). Used to count stars above the horizon.
 */
export function horizonProfile(eyeY, n = 360) {
  const prof = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const az = ((i + 0.5) / n) * Math.PI * 2;
    let best = -0.02;
    for (let r = 20; r < 3800; r *= 1.04) {
      const x = r * Math.sin(az), z = -r * Math.cos(az);
      best = Math.max(best, Math.atan2(heightAt(x, z) - eyeY, r));
    }
    prof[i] = best;
  }
  return prof;
}

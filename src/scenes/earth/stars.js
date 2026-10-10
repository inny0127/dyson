// Star catalogue for the Earth chapter.
// Bright stars (V ≲ 3, plus the faint members that complete familiar summer shapes) are real:
// J2000 RA (hours), Dec (degrees), V magnitude, B−V colour index, rounded from the Yale Bright Star
// Catalogue (Hoffleit & Warren 1991). Everything fainter than V = 3 is procedural, drawn so the
// cumulative all-sky count follows N(<m) = 10^(0.45 m + 1.03), which gives ≈ 9,000 stars brighter
// than V = 6.5 (Allen's Astrophysical Quantities), concentrated toward the galactic plane the
// fainter they are (Bahcall & Soneira 1980).

import { bvToTemp } from './skyphysics.js';

// name, RA h, Dec °, V, B−V
export const BRIGHT = [
  ['Sirius', 6.7525, -16.716, -1.46, 0.0], ['Canopus', 6.3992, -52.696, -0.74, 0.15],
  ['Rigil Kentaurus', 14.660, -60.834, -0.27, 0.71], ['Arcturus', 14.2610, 19.182, -0.05, 1.23],
  ['Vega', 18.6156, 38.784, 0.03, 0.0], ['Capella', 5.2782, 45.998, 0.08, 0.80],
  ['Rigel', 5.2423, -8.202, 0.13, -0.03], ['Procyon', 7.6550, 5.225, 0.34, 0.42],
  ['Achernar', 1.6286, -57.237, 0.46, -0.16], ['Betelgeuse', 5.9195, 7.407, 0.50, 1.85],
  ['Hadar', 14.0637, -60.373, 0.61, -0.23], ['Altair', 19.8464, 8.868, 0.77, 0.22],
  ['Acrux', 12.4433, -63.099, 0.77, -0.24], ['Aldebaran', 4.5987, 16.509, 0.85, 1.54],
  ['Antares', 16.4901, -26.432, 1.06, 1.83], ['Spica', 13.4199, -11.161, 0.97, -0.23],
  ['Pollux', 7.7553, 28.026, 1.14, 1.00], ['Fomalhaut', 22.9608, -29.622, 1.16, 0.09],
  ['Deneb', 20.6905, 45.280, 1.25, 0.09], ['Mimosa', 12.7953, -59.689, 1.25, -0.23],
  ['Regulus', 10.1395, 11.967, 1.35, -0.11], ['Adhara', 6.9771, -28.972, 1.50, -0.21],
  ['Castor', 7.5767, 31.888, 1.58, 0.03], ['Shaula', 17.5601, -37.104, 1.62, -0.22],
  ['Gacrux', 12.5194, -57.113, 1.63, 1.59], ['Bellatrix', 5.4189, 6.350, 1.64, -0.22],
  ['Elnath', 5.4382, 28.608, 1.65, -0.13], ['Miaplacidus', 9.2200, -69.717, 1.67, 0.07],
  ['Alnilam', 5.6036, -1.202, 1.69, -0.18], ['Alnair', 22.1372, -46.961, 1.73, -0.13],
  ['Alnitak', 5.6793, -1.943, 1.74, -0.21], ['Alioth', 12.9005, 55.960, 1.77, -0.02],
  ['Dubhe', 11.0621, 61.751, 1.79, 1.07], ['Mirfak', 3.4054, 49.861, 1.79, 0.48],
  ['Wezen', 7.1399, -26.393, 1.83, 0.68], ['Sargas', 17.6219, -42.998, 1.86, 0.40],
  ['Kaus Australis', 18.4029, -34.385, 1.85, -0.03], ['Avior', 8.3752, -59.510, 1.86, 1.28],
  ['Alkaid', 13.7923, 49.313, 1.86, -0.19], ['Menkalinan', 5.9921, 44.948, 1.90, 0.03],
  ['Atria', 16.8111, -69.028, 1.92, 1.44], ['Alhena', 6.6285, 16.399, 1.93, 0.0],
  ['Peacock', 20.4275, -56.735, 1.94, -0.20], ['Polaris', 2.5302, 89.264, 1.98, 0.60],
  ['Mirzam', 6.3783, -17.956, 1.98, -0.23], ['Alphard', 9.4598, -8.659, 1.98, 1.44],
  ['Hamal', 2.1196, 23.463, 2.00, 1.15], ['Algieba', 10.3328, 19.842, 2.01, 1.15],
  ['Diphda', 0.7265, -17.987, 2.04, 1.02], ['Nunki', 18.9211, -26.297, 2.05, -0.13],
  ['Menkent', 14.1114, -36.370, 2.06, 1.01], ['Alpheratz', 0.1398, 29.091, 2.06, -0.11],
  ['Mirach', 1.1622, 35.621, 2.05, 1.58], ['Saiph', 5.7959, -9.670, 2.07, -0.18],
  ['Kochab', 14.8451, 74.156, 2.08, 1.47], ['Rasalhague', 17.5822, 12.560, 2.07, 0.15],
  ['Algol', 3.1361, 40.956, 2.09, -0.05], ['Almach', 2.0650, 42.330, 2.10, 1.37],
  ['Denebola', 11.8177, 14.572, 2.13, 0.09], ['Navi', 0.9451, 60.717, 2.15, -0.15],
  ['Muhlifain', 12.6919, -48.960, 2.20, -0.01], ['Naos', 8.0597, -40.003, 2.25, -0.27],
  ['Aspidiske', 9.2848, -59.275, 2.21, 0.18], ['Alphecca', 15.5781, 26.715, 2.23, -0.02],
  ['Mizar', 13.3988, 54.925, 2.23, 0.02], ['Sadr', 20.3705, 40.257, 2.23, 0.67],
  ['Schedar', 0.6751, 56.537, 2.24, 1.17], ['Eltanin', 17.9434, 51.489, 2.24, 1.52],
  ['Mintaka', 5.5334, -0.299, 2.23, -0.22], ['Caph', 0.1530, 59.150, 2.28, 0.34],
  ['Dschubba', 16.0056, -22.622, 2.29, -0.12], ['Larawag', 16.8361, -34.293, 2.29, 1.15],
  ['Merak', 11.0307, 56.382, 2.37, -0.02], ['Izar', 14.7498, 27.074, 2.37, 0.97],
  ['Enif', 21.7364, 9.875, 2.39, 1.52], ['Girtab', 17.7081, -39.030, 2.39, -0.17],
  ['Ankaa', 0.4381, -42.306, 2.40, 1.09], ['Phecda', 11.8972, 53.695, 2.44, 0.04],
  ['Sabik', 17.1729, -15.725, 2.43, 0.06], ['Scheat', 23.0629, 28.083, 2.42, 1.67],
  ['Alderamin', 21.3097, 62.586, 2.45, 0.22], ['Markab', 23.0794, 15.205, 2.49, -0.04],
  ['Aljanah', 20.7702, 33.970, 2.48, 1.03], ['Menkar', 3.0380, 4.090, 2.53, 1.64],
  ['Zubeneschamali', 15.2834, -9.383, 2.61, -0.11], ['Unukalhai', 15.7378, 6.426, 2.63, 1.17],
  ['Acrab', 16.0906, -19.806, 2.62, -0.07], ['Ruchbah', 1.4302, 60.235, 2.68, 0.13],
  ['Zubenelgenubi', 14.8480, -16.042, 2.75, 0.15], ['Kornephoros', 16.5037, 21.490, 2.78, 0.94],
  ['Rastaban', 17.5072, 52.301, 2.79, 0.98], ['Kaus Media', 18.3499, -29.828, 2.70, 1.38],
  ['Kaus Borealis', 18.4662, -25.422, 2.81, 1.04], ['Ascella', 19.0435, -29.880, 2.60, 0.08],
  ['Alnasl', 18.0968, -30.424, 2.99, 1.00], ['phi Sgr', 18.7609, -26.991, 3.17, -0.11],
  ['tau Sgr', 19.1157, -27.671, 3.32, 1.19], ['pi Sgr', 19.1627, -21.024, 2.88, 0.35],
  ['mu Sgr', 18.2295, -21.059, 3.86, 0.23], ['Fang', 15.9809, -26.114, 2.89, -0.19],
  ['Alniyat', 16.3531, -25.593, 2.89, 0.13], ['Paikauhale', 16.5980, -28.216, 2.82, -0.25],
  ['Xamidimura', 16.8645, -38.047, 3.00, -0.20], ['zeta2 Sco', 16.9097, -42.362, 3.62, 1.37],
  ['eta Sco', 17.2026, -43.239, 3.33, 0.41], ['iota1 Sco', 17.7931, -40.127, 2.99, 0.51],
  ['Lesath', 17.5127, -37.296, 2.70, -0.22], ['theta Oph', 17.3666, -24.999, 3.27, -0.19],
  ['Albireo', 19.5120, 27.960, 3.05, 1.13], ['delta Cyg', 19.7496, 45.131, 2.87, -0.03],
  ['zeta Cyg', 21.2156, 30.227, 3.20, 0.99], ['eta Cyg', 19.9384, 35.083, 3.89, 1.02],
  ['Sheliak', 18.8347, 33.363, 3.52, 0.0], ['Sulafat', 18.9824, 32.690, 3.24, -0.05],
  ['zeta Lyr', 18.7462, 37.605, 4.36, 0.19], ['epsilon Lyr', 18.7392, 39.670, 4.67, 0.18],
  ['Tarazed', 19.7710, 10.613, 2.72, 1.52], ['Alshain', 19.9219, 6.407, 3.71, 0.86],
  ['Okab', 19.0901, 13.863, 2.99, 0.01], ['delta Aql', 19.4249, 3.115, 3.36, 0.32],
  ['lambda Aql', 19.1042, -4.883, 3.43, -0.09], ['theta Aql', 20.1885, -0.821, 3.23, -0.07],
  ['Han', 16.6194, -10.567, 2.56, 0.02], ['Yed Prior', 16.2391, -3.694, 2.75, 1.58],
  ['Yed Posterior', 16.3054, -4.692, 3.24, 0.97], ['Cebalrai', 17.7245, 4.567, 2.77, 1.16],
  ['kappa Oph', 16.9612, 9.375, 3.20, 1.15], ['zeta Her', 16.6881, 31.603, 2.81, 0.65],
  ['eta Her', 16.7149, 38.922, 3.48, 0.92], ['pi Her', 17.2507, 36.809, 3.16, 1.44],
  ['epsilon Her', 17.0048, 30.926, 3.92, -0.01], ['Rasalgethi', 17.2441, 14.390, 3.10, 1.44],
  ['Sarin', 17.2505, 24.839, 3.14, 0.08], ['Seginus', 14.5347, 38.308, 3.03, 0.19],
  ['Nekkar', 15.0324, 40.390, 3.49, 0.97], ['delta Boo', 15.2584, 33.315, 3.47, 0.95],
  ['Muphrid', 13.9114, 18.398, 2.68, 0.58], ['Pherkad', 15.3455, 71.834, 3.05, 0.05],
  ['Aldhibah', 17.1464, 65.715, 3.17, -0.12], ['Athebyne', 16.3999, 61.514, 2.73, 0.91],
  ['Thuban', 14.0731, 64.376, 3.65, -0.05], ['Grumium', 17.8921, 56.873, 3.75, 1.18],
  ['Alfirk', 21.4777, 70.561, 3.23, -0.22], ['Errai', 23.6558, 77.632, 3.21, 1.03],
  ['Algenib', 0.2206, 15.184, 2.83, -0.23], ['Homam', 22.6910, 10.831, 3.40, -0.09],
  ['Matar', 22.7167, 30.221, 2.94, 0.86], ['Sadalsuud', 21.5260, -5.571, 2.90, 0.83],
  ['Sadalmelik', 22.0964, -0.320, 2.95, 0.98], ['Deneb Algedi', 21.7840, -16.127, 2.85, 0.29],
  ['Dabih', 20.3502, -14.781, 3.05, 0.79], ['alpha Lup', 14.6988, -47.388, 2.30, -0.20],
  ['beta Lup', 14.9755, -43.134, 2.68, -0.22], ['Gienah', 12.2634, -17.542, 2.59, -0.11],
  ['Kraz', 12.5731, -23.397, 2.65, 0.89], ['Algorab', 12.4977, -16.515, 2.95, -0.05],
  ['Porrima', 12.6943, -1.449, 2.74, 0.36], ['Vindemiatrix', 13.0363, 10.959, 2.83, 0.94],
  ['Zosma', 11.2351, 20.524, 2.56, 0.12], ['Megrez', 12.2571, 57.033, 3.31, 0.08],
  ['beta Ara', 17.4217, -55.530, 2.84, 1.46], ['alpha Ara', 17.5307, -49.876, 2.95, -0.17],
  ['Alya', 18.9370, 4.204, 4.62, 0.10], ['alpha Sct', 18.5866, -8.244, 3.85, 1.33],
  ['Rotanev', 20.6258, 14.595, 3.63, -0.06], ['Sualocin', 20.6606, 15.912, 3.77, -0.06],
  ['gamma Sge', 19.9793, 19.492, 3.47, 1.57], ['Segin', 1.9066, 63.670, 3.35, -0.15],
];

/** Labelled on the sky when visible. */
export const NAMED = ['Vega', 'Altair', 'Deneb', 'Antares', 'Arcturus'];

// Equatorial (J2000) → galactic, rows = galactic x (to the centre), y (l = 90°), z (north galactic pole).
// Hipparcos and Tycho Catalogues, Vol. 1, §1.5.3.
export const EQ_TO_GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
];

function mulT(m, v) { // m^T v
  return [
    m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
    m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
    m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
  ];
}

/**
 * Equatorial unit vector → local horizon world vector for latitude φ and sidereal time.
 * World frame: x = east, y = up, z = south (so north is −z).
 */
export function eqToWorldMatrix(latDeg, lstHours) {
  const phi = (latDeg * Math.PI) / 180;
  const lst = (lstHours / 24) * 2 * Math.PI;
  const cL = Math.cos(lst), sL = Math.sin(lst), sP = Math.sin(phi), cP = Math.cos(phi);
  // hour-angle frame e: e_x = cosδ cosH, e_y = −cosδ sinH, e_z = sinδ, with H = LST − α
  // e = B q, B rows:
  const B = [[cL, sL, 0], [-sL, cL, 0], [0, 0, 1]];
  // world from e: x = e_y; y = sinφ e_z + cosφ e_x; z = sinφ e_x − cosφ e_z
  const A = [[0, 1, 0], [cP, 0, sP], [sP, 0, -cP]];
  const W = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) W[i][j] += A[i][k] * B[k][j];
  return W;
}

export function mul(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function raDecToEq(raH, decDeg) {
  const a = (raH / 12) * Math.PI, d = (decDeg * Math.PI) / 180;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

/** Deterministic PRNG (mulberry32). */
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

/** Cumulative all-sky count of stars brighter than m. */
export const countBrighter = m => 10 ** (0.45 * m + 1.03);
export const M_FAINTEST = 6.8;   // a little past the darkest-site limit (6.6 at 22.0 mag/arcsec²)
const M_PROC_MIN = 3.0;

/**
 * Builds the catalogue in world (horizon) coordinates. Stars below −1° altitude are dropped: the sky
 * is held at local midnight, so they never rise.
 * Returns { dir: Float32Array (xyz), mag, temp, name: Map(index → name), count }.
 */
export function buildCatalogue(W, blackbodyRGB) {
  const rand = rng(20240621);
  const out = [];
  const colourCache = new Map();
  const colour = T => {
    const k = Math.round(T / 100) * 100;
    if (!colourCache.has(k)) colourCache.set(k, blackbodyRGB(k));
    return colourCache.get(k);
  };
  const push = (w, m, bv, name) => {
    if (w[1] < -0.0175) return;
    const T = bvToTemp(bv);
    out.push({ w, m, rgb: colour(T), name });
  };
  for (const [name, ra, dec, v, bv] of BRIGHT) push(mul(W, raDecToEq(ra, dec)), v, bv, name);

  // Procedural: magnitudes by inverse CDF, positions with galactic-latitude concentration.
  const nLo = countBrighter(M_PROC_MIN), nHi = countBrighter(M_FAINTEST);
  const total = Math.round(nHi - nLo);
  const D = Math.PI / 180;
  for (let i = 0; i < total; i++) {
    const m = (Math.log10(nLo + rand() * (nHi - nLo)) - 1.03) / 0.45;
    // Density contrast plane/pole grows from ~1.5× at V = 3 to ~4× at V = 6.5; extra toward the bulge.
    const A = 0.5 + 0.8 * (m - 3);
    let gl, gb, g;
    for (let tries = 0; tries < 40; tries++) {
      const z = 2 * rand() - 1, phi = 2 * Math.PI * rand();
      const r = Math.sqrt(1 - z * z);
      g = [r * Math.cos(phi), r * Math.sin(phi), z];
      gb = Math.asin(z) / D; gl = Math.atan2(g[1], g[0]) / D;
      const w = (1 + A * Math.exp(-Math.abs(gb) / 11) + 0.8 * A * Math.exp(-0.5 * ((gl / 28) ** 2 + (gb / 12) ** 2))) / (1 + 1.8 * A);
      if (rand() < w) break;
    }
    const q = mulT(EQ_TO_GAL, g);        // galactic → equatorial
    // B−V: naked-eye stars are a mix of hot dwarfs/giants (blue-white) and K giants (orange).
    const u = rand();
    const bv = u < 0.38 ? -0.25 + 0.55 * rand() : u < 0.62 ? 0.3 + 0.6 * rand() : 0.9 + 0.7 * rand();
    push(mul(W, q), m, bv, null);
  }

  const n = out.length;
  const dir = new Float32Array(n * 3), mag = new Float32Array(n), rgb = new Float32Array(n * 3), seed = new Float32Array(n);
  const names = new Map();
  out.forEach((s, i) => {
    dir.set(s.w, i * 3); mag[i] = s.m; rgb.set(s.rgb, i * 3); seed[i] = rand();
    if (s.name) names.set(s.name, i);
  });
  return { dir, mag, rgb, seed, names, count: n };
}

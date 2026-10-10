// Sky physics for Chapter 4 (Earth): the numbers the model does not provide.
// Everything that comes from the swarm itself (coverage, sheet temperature, orbit radius, night-sky
// illuminance, forcing) is read from the model; this file only adds the observer, the natural sky,
// human vision, the specular glint and the 8–14 µm atmosphere. Each constant carries its source.

import { PHYS, S0, EARTH } from '../../model/constants.js';
import { planck } from '../../util/blackbody.js';

const DEG = Math.PI / 180;
const LN10 = Math.LN10;
export const log10 = Math.log10;

// ---------------------------------------------------------------------------
// Observer
// ---------------------------------------------------------------------------
export const OBSERVER = {
  latDeg: 40,          // a mid-latitude dark site (e.g. southern Utah, central Spain)
  // June solstice, local solar midnight. The Sun is at RA 6 h, Dec +23.44°, so the local sidereal time
  // is 18 h and the antisolar point sits on the meridian at Dec −23.44°: altitude 90 − 40 − 23.44 = 26.6°
  // due south, right above Sagittarius and the Milky Way's core.
  obliquityDeg: 23.44, // obliquity of the ecliptic (IAU 2006: 23.4393°)
  lstHours: 18,
  eyeHeight: 1.6,      // m
};

// ---------------------------------------------------------------------------
// Natural night sky and reference light levels
// ---------------------------------------------------------------------------
export const NIGHT = {
  zenithMag: 21.8,      // mag/arcsec², moonless zenith at a pristine site (airglow + zodiacal light + unresolved stars).
                        // Falchi et al. 2016 (Sci. Adv. 2, e1600377) adopt 22.0 as natural; 21.6–21.9 is measured at dark sites.
  horizonGain: 1.6,     // the natural sky is ~2.6× (≈1 mag) brighter just above the horizon than at the zenith (van Rhijn
  horizonScaleDeg: 12,  //   airglow geometry + scattering), falling off over ~10–15° (Duriscoe 2016, all-sky photometry).
  kV: 0.20,             // mag per airmass, V-band extinction at a good site (0.12–0.25 typical)
};

/** Ground illuminance references, lux. */
export const LUX = {
  moonless: 0.002,      // clear moonless night: starlight + airglow (CIE; IESNA Lighting Handbook)
  fullMoon: 0.25,       // full Moon high in the sky (0.1–0.3)
  civilTwilight: 3.4,   // Sun 6° below the horizon
  overcastDay: 1000,    // heavily overcast daylight
};
/** Zenith sky near full Moon, mag/arcsec² (Krisciunas & Schaefer 1991, PASP 103, 1033). */
export const FULL_MOON_SKY_MAG = 18.0;

/** Luminance (cd/m²) ↔ surface brightness (V mag/arcsec²): L = 10.8×10⁴ · 10^(−0.4 b) (Garstang 1989; Crumey 2014). */
export const magToLum = b => 10.8e4 * 10 ** (-0.4 * b);
export const lumToMag = L => 12.58 - 2.5 * log10(Math.max(1e-12, L));
/** Illuminance of a star of V magnitude m above the atmosphere: E = 2.54×10⁻⁶ lux · 10^(−0.4 m) (Allen's Astrophysical Quantities). */
export const starLux = m => 2.54e-6 * 10 ** (-0.4 * m);
export const luxToMag = E => -2.5 * log10(E / 2.54e-6);

/**
 * Naked-eye limiting magnitude for a dark-adapted observer as a function of the sky brightness b
 * (mag/arcsec²) around the star: m_lim = 7.93 − 5·log10(10^(4.316 − b/5) + 1).
 * This is the standard fit used to convert Sky Quality Meter readings to naked-eye limits; it follows
 * Schaefer (1990, PASP 102, 212) and agrees with Crumey (2014, MNRAS 442, 2600) to a few tenths of a
 * magnitude. 21.8 → 6.5; 18 (full-Moon sky) → 4.0; 13.7 → 0.0.
 */
export function limitingMag(b) {
  return 7.93 - 5 * log10(10 ** (4.316 - b / 5) + 1);
}

/** Relative airmass, Kasten & Young (1989, Appl. Opt. 28, 4735). altitude in radians. */
export function airmass(alt) {
  const h = Math.max(-0.5, alt / DEG);
  return 1 / (Math.sin(Math.max(alt, -0.0087)) + 0.50572 * (h + 6.07995) ** -1.6364);
}

/** Natural sky luminance (cd/m²) at altitude alt (rad), without the Milky Way. */
export function naturalSkyLum(alt) {
  const a = Math.max(0, alt) / DEG;
  return magToLum(NIGHT.zenithMag) * (1 + NIGHT.horizonGain * Math.exp(-a / NIGHT.horizonScaleDeg));
}

// ---------------------------------------------------------------------------
// Light from the swarm
// ---------------------------------------------------------------------------
/** lm/W for sunlight. Same value model.earthImpact uses for nightLux. */
export const LUMINOUS_EFFICACY_SUN = 93;

/**
 * Diffuse light: the model's nightLux is the illuminance from the swarm's sunlit inner faces filling a
 * fraction f of the sky. A uniform sky of luminance L gives E = π·L on a horizontal surface, so L = E/π.
 * Colour: sunlight (5772 K) scattered off dark-blue PV, which returns a little more blue than red.
 */
export const PV_DIFFUSE_TINT = [0.80, 0.96, 1.20];

/**
 * Specular glint ("artificial gegenschein").
 * Every panel faces the Sun, so its mirror reflection goes straight back toward the Sun, spread into a
 * cone of half-angle δ by wrinkles and pointing jitter (plus the Sun's own angular radius as seen from
 * the shell, added in quadrature).
 *
 * Geometry. Sun at the origin, observer at 1 AU, panel at r AU. Let θ be the angle on the observer's sky
 * between the panel and the antisolar point, and β the angle at the panel between the directions to the
 * Sun and to the observer. The law of sines in the Sun–observer–panel triangle gives
 *     sin β / 1 AU = sin(π − θ) / r   ⇒   sin β = sin θ / r.
 * The observer sees the glint when β ≤ δ, i.e. inside a patch centred on the antisolar point of radius
 *     θ_g = asin(r · sin δ) ≈ r·δ.
 * (The patch is bigger than δ because the observer is closer to the panels than the Sun is.)
 *
 * Brightness. A panel reflecting R_s of the sunlight S into a cone of solid angle Ω = π δ² has radiance
 *     L = R_s · S / Ω,
 * and radiance is conserved on the way to Earth, so the patch has that luminance times f. Integrating
 * over the patch (Ω_patch = π θ_g² = π r² δ²) gives the irradiance at Earth
 *     E = f · R_s · S · r² = f · R_s · S0,
 * independent of δ: the flat panels act as a retro-reflector that sends a fixed share of sunlight back
 * along the Sun–Earth line. δ only sets how big and how concentrated the patch is.
 * Earth's own shadow on the shell is negligible: from 0.2–0.4 AU away Earth covers < 1% of the Sun's disc.
 */
export const GLINT = {
  rSpecular: 0.02,    // front-surface specular reflectance of an AR-coated PV cover (single-layer MgF₂ on glass:
                      // ≈1.3% at 550 nm, 2–4% toward 400 and 700 nm). Bare polymer would be 4–6%.
  halfAngleDeg: 2.5,  // half-angle of the reflected cone: ±1.25° rms slope error on a tensioned thin film
                      // (reflection doubles slope errors) plus attitude jitter.
  tint: [1.04, 0.91, 1.12], // AR coatings tuned to 550 nm reflect the blue and red ends: the glint is faintly violet.
  visibleContrast: 0.1, // a 5–10°-wide glow ≥10% above the background is a comfortable naked-eye detection
                        // (the natural gegenschein, a few % above the sky, is at the edge of visibility).
};

export function glintGeometry(rAU) {
  if (!(rAU > 1)) return null;
  const delta = GLINT.halfAngleDeg * DEG;
  const sunRadius = PHYS.R_SUN / (rAU * PHYS.AU);
  const dEff = Math.hypot(delta, sunRadius);
  const theta = Math.asin(Math.min(1, rAU * Math.sin(dEff)));       // patch radius seen from Earth
  const coneSolidAngle = 2 * Math.PI * (1 - Math.cos(dEff));
  const patchSolidAngle = 2 * Math.PI * (1 - Math.cos(theta));
  // Panels inside the patch: lateral offset ≤ r(r−1)δ on a shell of area 4πr² → share (r−1)²δ²/4.
  const shellShare = ((rAU - 1) * dEff) ** 2 / 4;
  return { delta, dEff, theta, coneSolidAngle, patchSolidAngle, shellShare };
}

/**
 * Glint for coverage f. Returns illuminance (lux, above the atmosphere, normal incidence), peak luminance
 * (cd/m², Gaussian profile with the same total as the top-hat patch), and the brightness of one satellite.
 */
export function glint(rAU, f, S, satArea, nSats) {
  const g = glintGeometry(rAU);
  if (!g) return null;
  const E = f * GLINT.rSpecular * S0 * LUMINOUS_EFFICACY_SUN;
  const sigma = g.theta / Math.SQRT2;                 // Gaussian with 2πσ² = πθ² (same total, same peak as the top-hat)
  const L0 = E / (2 * Math.PI * sigma * sigma);
  const D = (rAU - 1) * PHYS.AU;
  const eSat = (GLINT.rSpecular * S * satArea * LUMINOUS_EFFICACY_SUN) / (g.coneSolidAngle * D * D);
  const fwhm = 2 * Math.sqrt(2 * Math.LN2) * sigma;   // full width at half brightness
  return { ...g, E, L0, sigma, fwhm, satMag: luxToMag(eSat), satsInPatch: nSats * g.shellShare };
}

// ---------------------------------------------------------------------------
// Vision
// ---------------------------------------------------------------------------
/**
 * Eye adaptation: display value = L · k · L_a^(q−1), where L_a is the field-average luminance the eye
 * adapts to. q < 1 means brighter scenes still look brighter, as they do: the visual system compresses
 * the 6.5 decades from a moonless night to an overcast day into about 1.5 decades of display brightness
 * (adapted brightness grows slowly with luminance: Stevens & Stevens 1963; Ferwerda et al. 1996).
 * Calibrated so a 21.8 mag/arcsec² sky reads as near-black, a full-Moon-level sky as dark grey,
 * and a 1,000-lux sky as a dull overcast day.
 */
export const EYE = { k: 0.08, q: 0.227 };
export function eyeExposure(La) { return EYE.k * Math.max(La, 1e-6) ** (EYE.q - 1); }

/** Colour temperature from B−V (Ballesteros 2012, EPL 97, 34008). */
export function bvToTemp(bv) {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

// ---------------------------------------------------------------------------
// Thermal infrared, 8–14 µm
// ---------------------------------------------------------------------------
/**
 * The window is not perfectly clear: water vapour and ozone emit, so an 8–14 µm camera pointed at a clear
 * zenith reads ≈ 230 K (handheld IR thermometers read −30 to −50 °C on clear summer nights).
 * Path transmittance τ(X) = τ0^X, emission (1 − τ)·B(T_air).
 */
export const IR_ATM = {
  tauZenith: 0.62,      // 8–14 µm zenith transmittance, mid-latitude summer, ~2–3 cm precipitable water (MODTRAN)
  tAirEmit: 280,        // K, effective emitting temperature of the lower troposphere
  tSurfaceNow: 288,     // K, today's global mean surface temperature (NASA Earth fact sheet)
  tMax: 400,            // K, top of the false-colour scale
  groundEps: 0.95,      // soil and vegetation, 8–14 µm
};

/** In-band radiance 8–14 µm, W m⁻² sr⁻¹ (Simpson's rule on the Planck function). */
export function bandRadiance(T) {
  if (!(T > 0)) return 0;
  const a = 8e-6, b = 14e-6, n = 48, h = (b - a) / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    s += w * planck(a + i * h, T);
  }
  return (s * h) / 3;
}

/** Brightness temperature for an in-band radiance. */
export function bandTemp(L) {
  if (!(L > 0)) return 0;
  let lo = 1, hi = 3000;
  for (let i = 0; i < 50; i++) {
    const m = 0.5 * (lo + hi);
    if (bandRadiance(m) < L) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}

export const INV_LUT_N = 64;
export const INV_LUT_POW = 0.2;
export const INV_LUT_TMAX = 600;
/** Table for the shader: x = (L / L(600 K))^0.2 in [0, 1] → brightness temperature. */
export function inverseBandLUT() {
  const Lmax = bandRadiance(INV_LUT_TMAX);
  const out = new Float32Array(INV_LUT_N + 1);
  for (let i = 0; i <= INV_LUT_N; i++) {
    const x = i / INV_LUT_N;
    out[i] = bandTemp(Lmax * x ** (1 / INV_LUT_POW));
  }
  return { lut: Array.from(out), Lmax };
}

/** Sky emissivity of the swarm seen from inside, with reflections between panels (as model.earthImpact). */
export function swarmSkyEmissivity(f, epsFront) {
  return (f * epsFront) / (1 - f * (1 - epsFront));
}

/** Sky brightness temperature (8–14 µm) at altitude alt for a swarm sky of in-band radiance Lsw. */
export function skyBandTemp(alt, Lsw) {
  const tau = IR_ATM.tauZenith ** airmass(alt);
  return bandTemp(tau * Lsw + (1 - tau) * bandRadiance(IR_ATM.tAirEmit));
}

/** Change in Earth's radiating temperature without catastrophic cancellation for tiny forcing. */
export function dTRadiating(forcing) {
  const A0 = EARTH.absorbedSolar;
  const T0 = (A0 / PHYS.SIGMA) ** 0.25;
  return T0 * Math.expm1(0.25 * Math.log1p(forcing / A0));
}
/** Forcing without subtracting two numbers near 238 W/m² (so year-0 values stay honest). */
export function forcingOf(e) {
  return e.irForcing + e.reflected - e.dimming * EARTH.absorbedSolar;
}
export const T_RADIATING_NOW = (EARTH.absorbedSolar / PHYS.SIGMA) ** 0.25;
export { LN10, DEG };

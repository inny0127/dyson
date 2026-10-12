// Physical constants and reference data. Every value carries its source so the
// ledger can show where a number came from.

export const PHYS = {
  L_SUN: 3.828e26,            // W, IAU 2015 Resolution B3 nominal solar luminosity
  R_SUN: 6.957e8,             // m, IAU 2015 nominal solar radius
  T_SUN: 5772,                // K, IAU 2015 nominal effective temperature
  GM_SUN: 1.32712440018e20,   // m^3 s^-2, IERS/JPL
  AU: 1.495978707e11,         // m, IAU 2012 exact
  C: 299792458,               // m/s exact
  SIGMA: 5.670374419e-8,      // W m^-2 K^-4, CODATA 2018 exact
  KB: 1.380649e-23,           // J/K exact
  G: 6.6743e-11,              // m^3 kg^-1 s^-2, CODATA 2018
  G0: 9.80665,                // m/s^2 standard gravity (for Isp)
  YEAR: 3.15576e7,            // s, Julian year
  DAY: 86400,
};

/** Solar constant at 1 AU, W/m^2 */
export const S0 = PHYS.L_SUN / (4 * Math.PI * PHYS.AU ** 2);

export const MERCURY = {
  M: 3.3011e23,               // kg (NASA planetary fact sheet)
  R: 2.4397e6,                // m mean radius
  a: 0.387098,                // AU semi-major axis
  e: 0.2056,
  periodDays: 87.969,
  rotationDays: 58.646,       // sidereal rotation (3:2 spin-orbit resonance)
  solarDayDays: 175.94,
  // Three-layer interior fitted to mass, radius and moment of inertia C/MR² = 0.346
  // (Margot et al. 2018; core radius 2024 km, Genova et al. 2019 / Hauck et al. 2013).
  // Crust 35 km at 2900 kg/m³; mantle density solved from the fit.
  R_CORE: 2.024e6,            // m
  CRUST_THICKNESS: 35e3,      // m
  RHO_CRUST: 2900,            // kg/m³
  RHO_MANTLE: 3103,           // kg/m³ (fit)
  RHO_CORE: 7188,             // kg/m³ (fit) Fe-Si-Ni alloy
  vEsc: 4250,                 // m/s surface escape velocity
  albedoBond: 0.088,
  albedoGeom: 0.142,
  tDay: 700,                  // K subsolar surface temperature (703 K at perihelion, 570 K at aphelion)
  tNight: 100,                // K
  perihelionAU: 0.307499,
};
{
  const sph = r => (4 / 3) * Math.PI * r ** 3;
  const { R, R_CORE, CRUST_THICKNESS, RHO_CRUST, RHO_MANTLE, RHO_CORE } = MERCURY;
  MERCURY.M_CRUST = (sph(R) - sph(R - CRUST_THICKNESS)) * RHO_CRUST;
  MERCURY.M_MANTLE = (sph(R - CRUST_THICKNESS) - sph(R_CORE)) * RHO_MANTLE;
  MERCURY.M_CORE = sph(R_CORE) * RHO_CORE;
  MERCURY.M_SHELL = MERCURY.M_CRUST + MERCURY.M_MANTLE;   // all the rock: ~24% of the planet
  MERCURY.RHO_SHELL = MERCURY.M_SHELL / (sph(R) - sph(R_CORE));
}

// Industry assumptions (Mercury research pass)
export const INDUSTRY = {
  energyPerKg: 255e6,         // J per kg of finished satellite: Si refining, metal electrolysis, chip fab, mining, launch (mid case)
  refineryTemp: 1000,         // K, radiators of the orbital refineries near Mercury
  driverAccel: 100 * 9.80665, // m/s², mass-driver acceleration (100 g)
  driverThroughput: 1e4,      // kg/s per mass-driver track (assumed)
};

export const EARTH = {
  M: 5.972e24,
  R: 6.371e6,
  a: 1.0,
  albedoBond: 0.30,
  absorbedSolar: S0 * (1 - 0.30) / 4,   // W/m^2 global mean, ~238
  tEff: 255,                            // K effective radiating temperature
  climateSensitivity: 0.8,              // K per W/m^2 (IPCC AR6 central ECS 3 K / 3.9 W/m^2 ~ 0.77)
  co2DoublingForcing: 3.93,             // W/m^2 (IPCC AR6 WG1 ch. 7: 3.93 ± 0.47)
  runawayAbsorbedLimit: 282,            // W/m^2 (Goldblatt et al. 2013, Nat. Geosci. 6, 661)
};

// Planets for the system view: semi-major axis (AU), eccentricity, inclination (deg),
// longitude of ascending node (deg), argument of perihelion (deg), mean longitude J2000 (deg),
// radius (m), period (days). J2000 mean elements, Standish (JPL) table 1.
export const PLANETS = [
  { name: 'Mercury', a: 0.38709927, e: 0.20563593, i: 7.00497902, node: 48.33076593, peri: 77.45779628, L: 252.2503235, R: 2.4397e6, periodDays: 87.969, color: [0.55, 0.52, 0.49] },
  { name: 'Venus', a: 0.72333566, e: 0.00677672, i: 3.39467605, node: 76.67984255, peri: 131.60246718, L: 181.9790995, R: 6.0518e6, periodDays: 224.701, color: [0.93, 0.85, 0.68] },
  { name: 'Earth', a: 1.00000261, e: 0.01671123, i: -0.00001531, node: 0.0, peri: 102.93768193, L: 100.46457166, R: 6.371e6, periodDays: 365.256, color: [0.32, 0.45, 0.68] },
  { name: 'Mars', a: 1.52371034, e: 0.0933941, i: 1.84969142, node: 49.55953891, peri: -23.94362959, L: -4.55343205, R: 3.3895e6, periodDays: 686.98, color: [0.72, 0.42, 0.27] },
];

// Reference points for comparisons in the ledger.
export const REFS = {
  // NVIDIA H100 SXM: 700 W TDP, 1,979 TFLOPS dense FP8 (3,958 with sparsity), NVIDIA datasheet.
  h100: { watts: 700, flops: 1.979e15 },
  // NVIDIA B200 (HGX): ~1,000 W, 4.5 PFLOPS dense FP8, NVIDIA Blackwell datasheet.
  b200: { watts: 1000, flops: 4.5e15 },
  worldElectricityW: 3.4e12,          // ~30,000 TWh/yr generation (Ember/IEA 2024) / 8766 h
  bigDatacenterW: 1e9,                // 1 GW-class AI campus
  humanBrainFlops: 1e15,              // order-of-magnitude FLOP/s equivalent (Carlsmith 2020 central ~1e15)
  humanBrainW: 20,
  // Total installed AI compute (all NVIDIA-class accelerators), order 1e21–1e22 FLOP/s FP8/FP16 dense, ~2025
  humanComputeFlops: 4e21,
  starsInMilkyWay: 1e11,              // ~1–4 × 10^11
  earthAbsorbedTotalW: S0 * Math.PI * 6.371e6 ** 2 * 0.7, // ~1.2e17 W
};

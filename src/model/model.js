// The swarm model: parameters in, every number the visualizer shows out.
// Pure functions only, so the same code runs in the browser and in `node --test`.

import { PHYS, S0, MERCURY, EARTH, REFS, INDUSTRY } from './constants.js';

const { L_SUN, AU, SIGMA, GM_SUN, C, KB, G0, YEAR } = PHYS;

/**
 * Parameter specs drive both the UI sliders and the defaults.
 * `log: true` sliders move in log10 space.
 */
export const PARAMS = [
  // Chips and thermal
  { key: 'tChipMax', group: 'Chips', label: 'Max chip junction temperature', unit: 'K', min: 300, max: 700, step: 1, value: 358,
    help: '85 °C is a common long-life rating for silicon. Silicon carbide and gallium nitride electronics can run at 500–600 K.' },
  { key: 'dTJunction', group: 'Chips', label: 'Chip rise above sheet', unit: 'K', min: 0, max: 30, step: 1, value: 10,
    help: 'Hot-spot rise of each chip above the sheet it is embedded in (lateral heat spreading).' },
  { key: 'jPerFlop', group: 'Chips', label: 'Energy per FLOP', unit: 'J', min: 1e-17, max: 1e-11, log: true, value: 2.2e-13,
    help: 'NVIDIA B200: ~2.2×10⁻¹³ J per dense FP8 FLOP. Landauer floor at 350 K is ~3×10⁻²¹ J per bit erased.' },
  { key: 'chipPower', group: 'Chips', label: 'Power per chip', unit: 'W', min: 0.05, max: 5, log: true, value: 0.25,
    help: 'A thin film spreads heat sideways only a few centimetres, so each chip must stay small. About 0.25 W keeps a chip within ~10 K of a 25 µm aluminium-backed film.' },
  { key: 'computeShare', group: 'Chips', label: 'Electricity reaching compute', unit: '', min: 0.5, max: 1, step: 0.01, value: 0.9,
    help: 'Remainder goes to power conversion, laser links and attitude control.' },

  // Panel
  { key: 'pvEff', group: 'Panel', label: 'PV efficiency at 25 °C', unit: '', min: 0.05, max: 0.45, step: 0.005, value: 0.22 },
  { key: 'pvTempCo', group: 'Panel', label: 'PV temperature coefficient', unit: '/K', min: -0.006, max: 0, step: 0.0001, value: -0.004,
    help: 'Relative efficiency loss per kelvin above 298 K. Crystalline silicon: about −0.35 to −0.45 %/K.' },
  { key: 'alpha', group: 'Panel', label: 'Solar absorptance', unit: '', min: 0.5, max: 0.98, step: 0.01, value: 0.9 },
  { key: 'epsFront', group: 'Panel', label: 'Front IR emissivity', unit: '', min: 0.5, max: 0.98, step: 0.01, value: 0.85 },
  { key: 'epsBack', group: 'Panel', label: 'Back IR emissivity', unit: '', min: 0.5, max: 0.98, step: 0.01, value: 0.9 },
  { key: 'reflectVis', group: 'Panel', label: 'Diffuse visible reflectance', unit: '', min: 0, max: 0.2, step: 0.005, value: 0.03,
    help: 'Sunlight scattered back off the PV face. Lights Earth’s night sky when the swarm surrounds Earth.' },
  { key: 'arealDensity', group: 'Panel', label: 'Areal density', unit: 'kg/m²', min: 0.01, max: 3, log: true, value: 0.2,
    help: 'Whole satellite mass divided by its area: PV film, foil, chips, wiring, optics.' },
  { key: 'satArea', group: 'Panel', label: 'Satellite area', unit: 'm²', min: 1e2, max: 1e8, log: true, value: 1e6 },

  // Swarm
  { key: 'coverage', group: 'Swarm', label: 'Target coverage of the Sun', unit: '', min: 0.001, max: 1, log: true, value: 1,
    help: 'Fraction of sunlight the finished swarm intercepts.' },
  { key: 'placement', group: 'Swarm', label: 'Placement', unit: '', options: ['thermal', 'manual'], value: 'thermal',
    help: '“thermal” puts the swarm exactly where the sheet runs at the chip limit; “manual” uses the radius below.' },
  { key: 'rManual', group: 'Swarm', label: 'Manual orbit radius', unit: 'AU', min: 0.2, max: 5, step: 0.01, value: 1.0 },
  { key: 'overlapEff', group: 'Swarm', label: 'Tiling efficiency', unit: '', min: 0.3, max: 1, step: 0.01, value: 0.9,
    help: 'Fraction of satellite area not shadowed by other satellites (orbits cross, so some overlap is unavoidable).' },

  // Industry
  { key: 'seedMass', group: 'Industry', label: 'Seed factory mass on Mercury', unit: 'kg', min: 1e4, max: 1e9, log: true, value: 1e6 },
  { key: 'doublingYears', group: 'Industry', label: 'Industrial doubling time', unit: 'yr', min: 0.1, max: 5, step: 0.05, value: 1 },
  { key: 'heatPerKg', group: 'Industry', label: 'Waste heat left on Mercury per kg', unit: 'MJ/kg', min: 0.05, max: 20, log: true, value: 2,
    help: 'Mining, crushing and mass-driver losses that stay on the surface. Refining and chip fabs work in orbit; their heat is radiated there.' },
  { key: 'mercuryHeatLimit', group: 'Industry', label: 'Heat Mercury’s surface can shed', unit: 'W', min: 1e17, max: 1e22, log: true, value: 5e18,
    help: 'Radiators on the night side at ~1,000–1,500 K reject 2×10¹⁸–1×10¹⁹ W. The day side gets 6–14 kW/m² of sunlight and cannot cool anything. Raise this to see the pure exponential.' },
  { key: 'ispSeconds', group: 'Industry', label: 'Ion thruster Isp', unit: 's', min: 1000, max: 10000, step: 100, value: 4000 },
  { key: 'year', group: 'Timeline', label: 'Years since first launch', unit: 'yr', min: 0, max: 5000, step: 0.1, value: 60 },
];

export function defaults() {
  return Object.fromEntries(PARAMS.map(p => [p.key, p.value]));
}

// ---------------------------------------------------------------------------
// Physics building blocks
// ---------------------------------------------------------------------------

export const flux = rAU => L_SUN / (4 * Math.PI * (rAU * AU) ** 2);
export const rForFlux = S => Math.sqrt(L_SUN / (4 * Math.PI * S)) / AU;

/**
 * Equilibrium temperature of a sun-facing sheet in a swarm that covers a fraction f of the sky.
 * Radiosity balance for a thin spherical swarm (every inward ray from a satellite lands on the
 * far side of the shell with probability g ≈ f):
 *  - sunlight the PV reflects is recaptured by the far side, so the effective absorptance is
 *    alpha / (1 - (1 - alpha) g)
 *  - sunward IR only escapes through the gaps; with far-side reflections the net sunward loss is
 *    eps_f (1 - g) / (1 - g (1 - eps_f))
 *   T^4 = alpha_eff S / (sigma [eps_b + eps_f (1 - g) / (1 - g (1 - eps_f))])
 * g = 0: an isolated plate radiating from both faces. g = 1: a closed shell that can only lose
 * heat outward, T^4 = S / (eps_b sigma), 1.21x hotter than an isolated plate at the same orbit.
 * Matches the research table to 0.1 K (333.3 / 359.6 / 392.7 / 404.1 K at 1 AU for f = 0 / 0.5 / 0.9 / 1).
 */
function radiativeTerms(f, { alpha, epsFront, epsBack }) {
  const g = Math.min(1, Math.max(0, f));
  const alphaEff = alpha / (1 - (1 - alpha) * g);
  const k = epsBack + (epsFront * (1 - g)) / (1 - g * (1 - epsFront));
  return { alphaEff, k };
}

export function sheetTemp(S, f, p) {
  const { alphaEff, k } = radiativeTerms(f, p);
  return ((alphaEff * S) / (SIGMA * k)) ** 0.25;
}

/** Flux at which the sheet reaches temperature T (inverse of sheetTemp). */
export function fluxForTemp(T, f, p) {
  const { alphaEff, k } = radiativeTerms(f, p);
  return (SIGMA * k * T ** 4) / alphaEff;
}

export function pvEfficiency(T, { pvEff, pvTempCo }) {
  return Math.max(0, pvEff * (1 + pvTempCo * (T - 298.15)));
}

/** Smallest radiator area that can reject all of L at temperature T. sides = 2 (sparse) or 1 (closed shell). */
export function minRadiatingArea(T, eps = 0.9, sides = 2) {
  return L_SUN / (sides * eps * SIGMA * T ** 4);
}

export const landauer = T => KB * T * Math.LN2;

export const vCirc = rAU => Math.sqrt(GM_SUN / (rAU * AU));

/** Hohmann transfer between circular orbits r1 -> r2 (AU). Returns dv1, dv2 (m/s) and transfer time (s). */
export function hohmann(r1AU, r2AU) {
  const r1 = r1AU * AU, r2 = r2AU * AU;
  const a = (r1 + r2) / 2;
  const v1 = Math.sqrt(GM_SUN / r1), v2 = Math.sqrt(GM_SUN / r2);
  const vp = Math.sqrt(GM_SUN * (2 / r1 - 1 / a));
  const va = Math.sqrt(GM_SUN * (2 / r2 - 1 / a));
  return {
    dv1: Math.abs(vp - v1),
    dv2: Math.abs(v2 - va),
    tTransfer: Math.PI * Math.sqrt(a ** 3 / GM_SUN),
  };
}

/**
 * Mass-driver launch from Mercury onto a Hohmann transfer to rTargetAU. Launching tangentially at
 * Mercury's perihelion uses its 59 km/s orbital speed and cuts launch energy by about a third.
 */
export function launchFromMercury(rTargetAU, atPerihelion = true) {
  const rp = (atPerihelion ? MERCURY.perihelionAU : MERCURY.a) * AU;
  const vM = Math.sqrt(GM_SUN * (2 / rp - 1 / (MERCURY.a * AU)));
  const r2 = rTargetAU * AU;
  const aT = (rp + r2) / 2;
  const vp = Math.sqrt(GM_SUN * (2 / rp - 1 / aT));
  const va = Math.sqrt(GM_SUN * (2 / r2 - 1 / aT));
  const vInf = Math.abs(vp - vM);
  const vLaunch = Math.sqrt(MERCURY.vEsc ** 2 + vInf ** 2);
  return {
    vInf,
    vLaunch,
    dvCirc: Math.abs(Math.sqrt(GM_SUN / r2) - va),
    tTransfer: Math.PI * Math.sqrt(aT ** 3 / GM_SUN),
    trackLength: vLaunch ** 2 / (2 * INDUSTRY.driverAccel),
  };
}

/** Radius of Mercury after removing massRemoved kg from the outside in: crust, mantle, then core. */
export function mercuryRadius(massRemoved) {
  const { R, R_CORE, CRUST_THICKNESS, RHO_CRUST, RHO_MANTLE, RHO_CORE, M_CRUST, M_MANTLE } = MERCURY;
  const k = (4 / 3) * Math.PI;
  const rm = Math.max(0, massRemoved);
  if (rm <= M_CRUST) return Math.cbrt(R ** 3 - rm / (k * RHO_CRUST));
  if (rm <= M_CRUST + M_MANTLE) return Math.cbrt((R - CRUST_THICKNESS) ** 3 - (rm - M_CRUST) / (k * RHO_MANTLE));
  const left = Math.max(0, R_CORE ** 3 - (rm - M_CRUST - M_MANTLE) / (k * RHO_CORE));
  return Math.cbrt(left);
}

/** Which layer is exposed after removing massRemoved kg. */
export function mercurySurfaceLayer(massRemoved) {
  if (massRemoved < MERCURY.M_CRUST) return 'crust';
  if (massRemoved < MERCURY.M_SHELL) return 'mantle';
  return 'core';
}

/** Gravitational binding energy of a two-layer sphere (J), numerically integrated. */
export function bindingEnergy(steps = 2000) {
  const { R, R_CORE, CRUST_THICKNESS, RHO_CRUST, RHO_MANTLE, RHO_CORE } = MERCURY;
  let m = 0, E = 0;
  const dr = R / steps;
  for (let i = 0; i < steps; i++) {
    const r = (i + 0.5) * dr;
    const rho = r < R_CORE ? RHO_CORE : r < R - CRUST_THICKNESS ? RHO_MANTLE : RHO_CRUST;
    const dm = 4 * Math.PI * r * r * rho * dr;
    E += (PHYS.G * m * dm) / r;
    m += dm;
  }
  return E;
}

// ---------------------------------------------------------------------------
// Full model
// ---------------------------------------------------------------------------

export function compute(p) {
  const f = Math.min(1, Math.max(1e-6, p.coverage));
  const tSheetMax = p.tChipMax - p.dTJunction;

  // Placement: where the finished swarm's sheets sit exactly at the chip limit.
  const sThermal = fluxForTemp(tSheetMax, f, p);
  const rThermal = rForFlux(sThermal);
  const rAU = p.placement === 'manual' ? p.rManual : rThermal;
  const S = flux(rAU);
  const tSheet = sheetTemp(S, f, p);
  const tSheetIsolated = sheetTemp(S, 0, p);
  const tAtMercury = sheetTemp(flux(MERCURY.a), 0, p);
  const tJunction = tSheet + p.dTJunction;
  const etaPV = pvEfficiency(tSheet, p);

  // Per square metre of satellite
  const absorbedM2 = p.alpha * S;
  const elecM2 = etaPV * S;
  const flopsM2 = (elecM2 * p.computeShare) / p.jPerFlop;
  const chipPitch = Math.sqrt(p.chipPower / (elecM2 * p.computeShare));   // m between chips
  const chipsPerSat = p.satArea / chipPitch ** 2;

  // Swarm totals
  const shellArea = 4 * Math.PI * (rAU * AU) ** 2;
  const satAreaTotal = (shellArea * f) / p.overlapEff;   // overlap wastes area
  const nSats = satAreaTotal / p.satArea;
  const intercepted = f * L_SUN;
  const elecTotal = intercepted * (elecM2 / S);
  const flopsTotal = (elecTotal * p.computeShare) / p.jPerFlop;
  const massSwarm = satAreaTotal * p.arealDensity;
  const fracMercury = massSwarm / MERCURY.M;
  const fracShell = massSwarm / MERCURY.M_SHELL;

  // One satellite
  const sat = {
    area: p.satArea,
    hexSide: Math.sqrt((2 * p.satArea) / (3 * Math.sqrt(3))),
    mass: p.satArea * p.arealDensity,
    elec: elecM2 * p.satArea,
    heat: absorbedM2 * p.satArea,
    flops: flopsM2 * p.satArea,
    equivAlThicknessM: p.arealDensity / 2700,
  };
  sat.datacenters = sat.elec / REFS.bigDatacenterW;
  sat.h100Equiv = sat.flops / REFS.h100.flops;

  // Thermodynamic floor on area at this temperature
  const aMinSparse = minRadiatingArea(tSheet, (p.epsFront + p.epsBack) / 2, 2);
  const aMinClosed = minRadiatingArea(tSheet, p.epsBack, 1);

  // Logistics: Mercury -> swarm orbit. Mass driver to a Hohmann transfer from perihelion, then each
  // panel circularises with its own electric thruster on Mercury-sourced propellant (Mg, Na, O).
  const ho = hohmann(MERCURY.a, rAU);
  const ln = launchFromMercury(rAU, true);
  const launchEnergyPerKg = 0.5 * ln.vLaunch ** 2;
  const spiralDv = Math.abs(vCirc(MERCURY.a) - vCirc(rAU));
  const vex = p.ispSeconds * G0;
  const propFracCirc = 1 - Math.exp(-ln.dvCirc / vex);
  const propFracSpiral = 1 - Math.exp(-spiralDv / vex);
  const minedPerDelivered = 1 / (1 - propFracCirc);          // kg dug out of Mercury per kg of satellite in orbit
  const specificPower = elecM2 / p.arealDensity;            // W/kg at the swarm orbit
  const massMined = massSwarm * minedPerDelivered;
  const fracMercuryMined = massMined / MERCURY.M;

  // Growth: exponential industry until Mercury's surface cannot shed the waste heat of digging and
  // launching any faster; from then on the build grows linearly at that capped rate.
  const minedRateCap = p.mercuryHeatLimit / (p.heatPerKg * 1e6);           // kg/s dug out of Mercury
  const deliveredRateCap = minedRateCap / minedPerDelivered;                // kg/s of satellites
  const growth = growthPlan(p, massSwarm, deliveredRateCap);

  // Communications
  const lightAcross = (2 * rAU * AU) / C;

  // Earth
  const earth = earthImpact(p, rAU, f, tSheet, S);
  const earth1pct = earthImpact(p, rAU, 0.01, sheetTemp(S, 0.01, p), S);

  return {
    f, rAU, rThermal, S, tSheet, tSheetIsolated, tAtMercury, tAtMercuryClosed: sheetTemp(flux(MERCURY.a), 1, p), tJunction, tSheetMax, etaPV,
    absorbedM2, elecM2, flopsM2, chipPitch, chipsPerSat,
    shellArea, satAreaTotal, nSats, intercepted, elecTotal, flopsTotal, massSwarm, fracMercury, fracShell,
    sat, aMinSparse, aMinClosed,
    rMinSparse: Math.sqrt(aMinSparse / (4 * Math.PI)) / AU,
    landauerJ: landauer(tJunction),
    landauerGap: p.jPerFlop / landauer(tJunction),
    logistics: { ...ln, dv1: ln.vInf, dv2: ln.dvCirc, hohmannDv1: ho.dv1, launchEnergyPerKg, spiralDv, propFracCirc, propFracSpiral, minedPerDelivered, specificPower },
    massMined, fracMercuryMined, fracShellMined: massMined / MERCURY.M_SHELL,
    growth,
    lightAcross,
    earth,
    earth1pct,
    vsHumanity: flopsTotal / REFS.humanComputeFlops,
    vsMilkyWayStars: nSats / REFS.starsInMilkyWay,
    mercuryBinding: bindingEnergy(),
  };
}

const EARTH_IR_ABSORPTANCE = 0.95;   // Earth absorbs thermal IR far better than sunlight (0.70)
const LUMINOUS_EFFICACY = 93;        // lm/W for sunlight (reflected off PV, roughly unchanged)

/**
 * Earth's energy budget with the swarm in place (per m² of Earth's surface, global mean).
 * Interior swarm (r < 1 AU): every watt the swarm absorbs still leaves it as IR and flows outward
 * past Earth: flux f·S0 at 1 AU (exact for a spherically symmetric emitter). Earth is a sphere and
 * the source spans an angular radius θs = asin(r), so it absorbs 2/(1 + cos θs) more than a flat
 * plate would. Sunlight reaching Earth drops by f unless the swarm keeps a corridor clear.
 * Exterior swarm (r > 1 AU): Earth sits inside the shell. Its sky is a fraction f covered by panel
 * faces at the sheet temperature; with reflections between the panels the inward IR field is
 * f·eps_f·σT⁴ / (1 − f(1 − eps_f)) (a closed shell becomes a blackbody cavity at T). The panels also
 * scatter sunlight inward: radiosity B = ρ S / (1 − f ρ), irradiance f·B, which lights the night sky.
 */
export function earthImpact(p, rAU, f, tSheet, S) {
  const exterior = rAU > 1.0;
  const absorbedNow = EARTH.absorbedSolar;
  let irAbsorbed = 0, reflectedAbsorbed = 0, dimming = 0, nightIrradiance = 0, sourceFactor = 1;
  if (exterior) {
    const field = (f * p.epsFront * SIGMA * tSheet ** 4) / (1 - f * (1 - p.epsFront));
    irAbsorbed = EARTH_IR_ABSORPTANCE * field;
    nightIrradiance = (f * p.reflectVis * S) / (1 - f * p.reflectVis);
    // every patch of Earth sees the same isotropic field over its sky hemisphere, day or night
    reflectedAbsorbed = (1 - EARTH.albedoBond) * nightIrradiance;
  } else {
    const sinT = Math.min(0.999, rAU);
    sourceFactor = 2 / (1 + Math.sqrt(1 - sinT * sinT));
    irAbsorbed = (EARTH_IR_ABSORPTANCE * f * S0 * sourceFactor) / 4;
    dimming = f;
  }
  const absorbed = absorbedNow * (1 - dimming) + irAbsorbed + reflectedAbsorbed;
  const forcing = absorbed - absorbedNow;
  const tEff = (absorbed / SIGMA) ** 0.25;
  return {
    exterior,
    irForcing: irAbsorbed,
    reflected: reflectedAbsorbed,
    dimming,
    sourceFactor,
    forcing,
    co2Doublings: forcing / EARTH.co2DoublingForcing,
    tEff,
    dTEff: tEff - EARTH.tEff,
    dTSurfaceLinear: forcing * EARTH.climateSensitivity,
    runaway: absorbed > EARTH.runawayAbsorbedLimit,
    absorbed,
    nightIrradiance,
    nightLux: nightIrradiance * LUMINOUS_EFFICACY,
    skyTemp: exterior ? tSheet : null,
  };
}

/**
 * Build-out schedule. Exponential from the seed (doubling time T_d) until the export rate reaches the
 * heat-limited cap, then linear at the cap. Returns milestones and the inverse used by the timeline.
 */
export function growthPlan(p, massSwarm, rateCap) {
  const Td = p.doublingYears * YEAR;
  const kappa = Math.LN2 / Td;
  const massAtCap = Math.max(p.seedMass, rateCap / kappa);    // built mass when exponential hits the cap
  const tCap = Math.log2(massAtCap / p.seedMass) * p.doublingYears;
  const capped = massAtCap < massSwarm;
  const yearsForMass = mass => {
    if (mass <= p.seedMass) return 0;
    if (!capped || mass <= massAtCap) return Math.log2(mass / p.seedMass) * p.doublingYears;
    return tCap + (mass - massAtCap) / rateCap / YEAR;
  };
  return {
    doublings: Math.log2(massSwarm / p.seedMass),
    tCap: capped ? tCap : null,
    massAtCap,
    rateCap,
    capped,
    yearsToFull: yearsForMass(massSwarm),
    yearsTo1pct: yearsForMass(massSwarm * 0.01),
    yearsTo10pct: yearsForMass(massSwarm * 0.1),
    yearsForFraction: frac => yearsForMass(massSwarm * frac),
    yearsForMass,
  };
}

/** Satellite mass built by a given year. */
export function builtAt(p, d, year) {
  const g = d.growth;
  if (!g.capped || year <= g.tCap) return Math.min(d.massSwarm, p.seedMass * 2 ** (year / p.doublingYears));
  return Math.min(d.massSwarm, g.massAtCap + g.rateCap * (year - g.tCap) * YEAR);
}

/**
 * Industrial throughput while the swarm is growing: export rate, processing power and the radiator
 * area the refineries near Mercury need to dump their waste heat (Mercury's own surface can only
 * radiate ~1e18 W, so refining has to happen in orbit).
 */
export function industryAt(p, d, built) {
  const growing = built < d.massSwarm;
  const exportRate = growing ? Math.min(d.growth.rateCap, (built * Math.LN2) / (p.doublingYears * YEAR)) : 0;   // kg/s of satellites
  const processingPower = exportRate * INDUSTRY.energyPerKg;
  const radiatorArea = processingPower / (2 * 0.9 * SIGMA * INDUSTRY.refineryTemp ** 4);
  const minedRate = exportRate * d.logistics.minedPerDelivered;
  return {
    heatOnMercury: minedRate * p.heatPerKg * 1e6,
    heatLimited: growing && exportRate >= d.growth.rateCap * 0.999,
    exportRate,
    minedRate,
    processingPower,
    refineryRadiatorArea: radiatorArea,
    refineryDiscRadius: Math.sqrt(radiatorArea / Math.PI),
    massDrivers: Math.ceil(minedRate / INDUSTRY.driverThroughput),
  };
}

/**
 * State of the build-out at a given year. Mass grows exponentially from the
 * seed until the swarm is complete; coverage follows the mass.
 */
export function atYear(p, d, year) {
  const built = builtAt(p, d, year);
  const frac = built / d.massSwarm;
  const f = d.f * frac;
  const S = d.S;
  const tSheet = sheetTemp(S, f, p);
  const elec = f * L_SUN * (d.elecM2 / S);
  return {
    year,
    built,
    frac,
    f,
    nSats: d.nSats * frac,
    elec,
    flops: (elec * p.computeShare) / p.jPerFlop,
    tSheet,
    mercuryRemoved: (built * d.logistics.minedPerDelivered) / MERCURY.M,
    mercuryRadius: mercuryRadius(built * d.logistics.minedPerDelivered),
    mercurySurface: mercurySurfaceLayer(built * d.logistics.minedPerDelivered),
    ...industryAt(p, d, built),
    earth: earthImpact(p, d.rAU, f, tSheet, S),
  };
}

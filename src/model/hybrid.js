// Model v3: the hybrid swarm of docs/architecture.md.
// ~85 % of chip power runs on compute sails: thin c-Si PV film with 0.15 W chiplets every ~2.5 cm,
// where the film is its own radiator. ~15 % runs in shielded HBM/DRAM pods: PV wings, pumped
// two-phase loops and knife-edge radiator blades. Sails sit as close to the Sun as their chip limit
// allows. Pods sit near their mass optimum. Both share one energy basis.
import { PHYS, MERCURY } from './constants.js';
import { pvEta, pvState, radiatorFlux } from './sat2.js';
import { flux, rForFlux, sheetTemp, fluxForTemp, launchFromMercury, growthPlan, earthImpact,
  mercuryRadius, mercurySurfaceLayer } from './model.js';

const { L_SUN, AU, SIGMA, C, YEAR } = PHYS;

// Energy per operation relative to 85 °C at the same clock, for logic re-optimised for heat
// (hot-silicon research: x1.20 @105, x1.43 @125, x1.76 @150, x2.31 @175 °C).
const E_REL = [[85, 1.0], [95, 1.10], [105, 1.20], [125, 1.43], [150, 1.76], [175, 2.31], [200, 4.09]];
export function energyPenalty(tjC) {
  if (tjC <= E_REL[0][0]) return 1;
  for (let i = 1; i < E_REL.length; i++) {
    const [t1, e1] = E_REL[i], [t0, e0] = E_REL[i - 1];
    if (tjC <= t1) return e0 * (e1 / e0) ** ((tjC - t0) / (t1 - t0));
  }
  return E_REL[E_REL.length - 1][1];
}

export const PARAMS = [
  // chips (one basis for sails and pods)
  { key: 'jPerFlop85', group: 'Chips', label: 'Energy per FLOP at 85 °C, full clock', unit: 'J', min: 1e-15, max: 1e-12, log: true, value: 1.3e-13,
    help: 'System level (logic, memory, interconnect) per dense FP8 FLOP for a 2026 accelerator.' },
  { key: 'clockFactor', group: 'Chips', label: 'Energy factor from under-clocking', unit: '', min: 0.4, max: 1, step: 0.01, value: 0.6,
    help: 'More silicon at ~0.6× clock and lower voltage. Mercury makes silicon cheap; fabs may not.' },
  { key: 'tjFilmC', group: 'Chips', label: 'Sail chiplet junction limit', unit: '°C', min: 60, max: 125, step: 1, value: 85,
    help: 'SRAM leakage grows steeply with heat: at 85 °C it already takes 10–59 % of a 0.15 W chiplet.' },
  { key: 'filmSpreadDT', group: 'Chips', label: 'Chiplet rise above the film', unit: 'K', min: 3, max: 30, step: 0.5, value: 10,
    help: '0.15 W chiplet at 2.5 cm pitch on 30 µm c-Si + 13 µm Mg: 7–10 K (finite-volume check).' },
  { key: 'tjPodC', group: 'Chips', label: 'Pod junction limit', unit: '°C', min: 85, max: 150, step: 1, value: 105 },
  { key: 'chipPower', group: 'Chips', label: 'Power per sail chiplet', unit: 'W', min: 0.05, max: 1, log: true, value: 0.15,
    help: 'Spreader mass in a thin film grows as P²: 0.09 g/W at 0.1 W, 0.94 g/W at 1 W.' },
  // compute sail
  { key: 'pvEta0', group: 'Compute sail', label: 'PV efficiency (AM0, 28 °C)', unit: '', min: 0.1, max: 0.3, step: 0.005, value: 0.20 },
  { key: 'pvTempCo', group: 'Compute sail', label: 'PV temperature coefficient', unit: '/K', min: -0.006, max: 0, step: 0.0001, value: -0.0042 },
  { key: 'filmAreal', group: 'Compute sail', label: 'Sail areal density', unit: 'kg/m²', min: 0.05, max: 0.5, step: 0.005, value: 0.172,
    help: '30 µm c-Si 0.070, glass cover and emitter 0.0625, 13 µm Mg spreader 0.0225, structure 0.012, grid 0.004.' },
  { key: 'filmOverbuild', group: 'Compute sail', label: 'Spare area (attrition, dead chiplets)', unit: '', min: 0, max: 0.3, step: 0.01, value: 0.10 },
  { key: 'computeShare', group: 'Compute sail', label: 'Electricity reaching chips', unit: '', min: 0.5, max: 1, step: 0.01, value: 0.9 },
  { key: 'sailArea', group: 'Compute sail', label: 'Area of one sail', unit: 'm²', min: 1e2, max: 1e8, log: true, value: 1e6 },
  // pods
  { key: 'podFrac', group: 'Pods', label: 'Share of chip power in pods', unit: '', min: 0, max: 1, step: 0.01, value: 0.15,
    help: 'CPU/DRAM sandboxes, storage, switching, HBM training islands. Each 1 % moved into pods adds ~3 % (best pods) to ~7 % (heavier pods) to the mass of an all-sail swarm.' },
  { key: 'rPod', group: 'Pods', label: 'Preferred pod orbit radius', unit: 'AU', min: 0.5, max: 1.5, step: 0.01, value: 0.88,
    help: 'Mass optimum with meteoroid armour is flat from 0.7 to 1.0 AU, best at 0.86–0.90. Pods never sit inside the sail shell: there their radiators would face its 348 K inner wall.' },
  { key: 'podPower', group: 'Pods', label: 'Chip power per pod', unit: 'W', min: 1e4, max: 1e8, log: true, value: 1e6 },
  { key: 'podRadC', group: 'Pods', label: 'Pod radiator temperature', unit: '°C', min: 40, max: 120, step: 1, value: 80 },
  { key: 'wingAreal', group: 'Pods', label: 'Pod PV wing areal density', unit: 'kg/m²', min: 0.1, max: 2, step: 0.01, value: 0.15 },
  { key: 'radAreal', group: 'Pods', label: 'Pod radiator areal density', unit: 'kg/m²', min: 0.5, max: 5, step: 0.05, value: 1.3,
    help: 'SO2 heat-pipe blades sized for ≤1 %/yr meteoroid loss.' },
  { key: 'podKgPerKW', group: 'Pods', label: 'Module, loops, shielding, bus', unit: 'kg/kW', min: 0.5, max: 10, step: 0.1, value: 2.1,
    help: 'Loops 0.6, compute module 0.8, conversion 0.2, 5 g/cm² shielding 0.2, misc 0.3 kg/kW.' },
  // swarm
  { key: 'coverage', group: 'Swarm', label: 'Sunlight captured', unit: '', min: 1e-6, max: 1, log: true, value: 0.1 },
  { key: 'placement', group: 'Swarm', label: 'Sail placement', unit: '', options: ['thermal', 'manual'], value: 'thermal',
    help: 'Thermal: as close to the Sun as the chiplet limit allows, given how much of the sky the swarm already fills.' },
  { key: 'rManual', group: 'Swarm', label: 'Manual sail orbit radius', unit: 'AU', min: 0.5, max: 2, step: 0.01, value: 0.92 },
  // industry
  { key: 'yieldDelivered', group: 'Industry', label: 'Spacecraft kg per kg of rock', unit: '', min: 0.2, max: 0.9, step: 0.01, value: 0.5,
    help: 'Oxides reduced to Si, Mg, Al, Ca; the oxygen becomes glass and ion-thruster propellant.' },
  { key: 'seedMass', group: 'Industry', label: 'Seed factory mass on Mercury', unit: 'kg', min: 1e4, max: 1e9, log: true, value: 1e6 },
  { key: 'doublingYears', group: 'Industry', label: 'Industrial doubling time', unit: 'yr', min: 0.1, max: 5, step: 0.05, value: 1 },
  { key: 'heatPerKg', group: 'Industry', label: 'Waste heat left on Mercury per kg mined', unit: 'MJ/kg', min: 0.05, max: 20, log: true, value: 2 },
  { key: 'mercuryHeatLimit', group: 'Industry', label: 'Heat Mercury’s surface can shed', unit: 'W', min: 1e17, max: 1e22, log: true, value: 5e18 },
];

export function defaults() {
  return Object.fromEntries(PARAMS.map(s => [s.key, s.value]));
}

// Optics and fixed design values from the research passes (not exposed as sliders).
export const FIXED = {
  film: { alpha: 0.9, epsFront: 0.85, epsBack: 0.90, packing: 0.9, pvT0: 301, reflectVis: 0.03, laserKgPerW: 2e-5 },
  wing: { pvAlpha: 0.9, pvEpsFront: 0.85, pvEpsBack: 0.85, pvPacking: 0.9, pvT0: 301 },
  // two faces at eps 0.9, 4 % of the view blocked by the module and wings, fin efficiency 0.75
  rad: { radEps: 0.9, radFinEff: 0.96 * 0.75 },
  podComputeShare: 0.9,
};

export const joulesPerFlop = (p, tjC) => p.jPerFlop85 * p.clockFactor * energyPenalty(tjC);

/** One square metre of compute sail at distance r inside a swarm of coverage f. */
export function sailAt(p, rAU, f) {
  const o = FIXED.film;
  const S = flux(rAU);
  const T = sheetTemp(S, f, o);
  const eta = pvEta(T, { pvEta0: p.pvEta0, pvTempCo: p.pvTempCo, pvT0: o.pvT0 }) * o.packing;
  const elecM2 = eta * S;
  const chipWm2 = elecM2 * p.computeShare;
  const kgPerW = (p.filmAreal * (1 + p.filmOverbuild)) / chipWm2 + o.laserKgPerW;
  const tj = T - 273.15 + p.filmSpreadDT;
  const J = joulesPerFlop(p, tj);
  return {
    rAU, S, T, tjC: tj, eta, elecM2, chipWm2, kgPerW,
    chipPerWsun: chipWm2 / S,
    chipPitch: Math.sqrt(p.chipPower / chipWm2),
    jPerFlop: J,
    flopsPerKg: 1 / (kgPerW * J),
    overLimit: tj > p.tjFilmC + 1e-6,
  };
}

/** Closest orbit where the sail's chiplets just reach their junction limit, for coverage f. */
export function sailThermalRadius(p, f) {
  const Tmax = p.tjFilmC + 273.15 - p.filmSpreadDT;
  return rForFlux(fluxForTemp(Tmax, f, FIXED.film));
}

/** One pod per watt of chip power at distance r, inside a swarm of coverage f whose sails run at tSail. */
export function podAt(p, rAU, f, tSail) {
  const S = flux(rAU);
  const wing = pvState(S, f, { ...FIXED.wing, pvEta0: p.pvEta0, pvTempCo: p.pvTempCo });
  const chipWm2 = wing.elecM2 * FIXED.podComputeShare;
  const tRad = p.podRadC + 273.15;
  const q = radiatorFlux(tRad, f, tSail, FIXED.rad);
  const kgPerW = {
    wing: p.wingAreal / chipWm2,
    radiator: q > 0 ? p.radAreal / q : Infinity,
    fixed: p.podKgPerKW / 1e3,
  };
  const total = kgPerW.wing + kgPerW.radiator + kgPerW.fixed;
  const J = joulesPerFlop(p, p.tjPodC);
  return {
    rAU, S, wing, chipWm2, tRad, qRad: q, kgPerWItems: kgPerW, kgPerW: total,
    chipPerWsun: chipWm2 / S,
    wingAreaPerW: 1 / chipWm2,
    radAreaPerW: q > 0 ? 1 / q : Infinity,
    jPerFlop: J,
    flopsPerKg: 1 / (total * J),
    feasible: Number.isFinite(total),
  };
}

/** The whole swarm for parameters p. */
export function compute(p) {
  const f = Math.min(1, Math.max(1e-9, p.coverage));
  const rThermal = sailThermalRadius(p, f);
  const rSail = p.placement === 'manual' ? p.rManual : rThermal;
  const sail = sailAt(p, rSail, f);
  const rPod = Math.max(p.rPod, rSail);
  const pod = podAt(p, rPod, f, sail.T);
  const q = Math.min(1, Math.max(0, p.podFrac));

  // Split the captured sunlight so that a fraction q of chip power ends up in pods.
  const intercepted = f * L_SUN;
  const chipPower = intercepted / ((1 - q) / sail.chipPerWsun + q / pod.chipPerWsun);
  const sailPower = (1 - q) * chipPower;
  const podPower = q * chipPower;
  const sailAreaTotal = sailPower / sail.chipWm2;
  const wingAreaTotal = podPower / pod.chipWm2;
  const radAreaTotal = podPower * pod.radAreaPerW;
  const massSails = sailPower * sail.kgPerW;
  const massPods = podPower * pod.kgPerW;
  const mass = massSails + massPods;
  const flopsSails = sailPower / sail.jPerFlop;
  const flopsPods = podPower / pod.jPerFlop;

  // Logistics. Mass-driver launch from Mercury's perihelion onto the transfer orbit; each spacecraft
  // circularises with its own ion engine on oxygen from the same rock.
  const lnSail = launchFromMercury(rSail, true);
  const lnPod = launchFromMercury(rPod, true);
  const minedPerDelivered = 1 / p.yieldDelivered;
  const massMined = mass * minedPerDelivered;
  const minedRateCap = p.mercuryHeatLimit / (p.heatPerKg * 1e6);
  const deliveredRateCap = minedRateCap / minedPerDelivered;
  const growth = growthPlan(p, mass, deliveredRateCap);

  const earth = earthImpact(FIXED.film, rSail, f, sail.T, sail.S);

  return {
    f, q, rThermal, rSail, rPod, sail, pod,
    intercepted, chipPower, sailPower, podPower,
    sailAreaTotal, wingAreaTotal, radAreaTotal,
    nSails: sailAreaTotal / p.sailArea,
    nPods: podPower / p.podPower,
    chipletsTotal: sailPower / p.chipPower,
    mass, massSails, massPods,
    kgPerW: mass / chipPower,
    flops: flopsSails + flopsPods, flopsSails, flopsPods,
    sunlightUse: chipPower / intercepted,
    massMined, minedPerDelivered,
    fracMercury: massMined / MERCURY.M,
    fracRock: massMined / MERCURY.M_SHELL,
    logistics: { sail: lnSail, pod: lnPod, deliveredRateCap, minedRateCap },
    growth,
    earth,
    lightAcross: (2 * rSail * AU) / C,
    // Thermodynamic floor: a nearly closed swarm sheds everything through its outer face.
    rFloorClosed: Math.sqrt(L_SUN / (4 * Math.PI * FIXED.film.epsBack * SIGMA * (p.tjFilmC + 273.15 - p.filmSpreadDT) ** 4)) / AU,
  };
}

/** Satellite mass built by a given year (exponential, then linear once Mercury's heat caps it). */
export function builtAt(p, d, year) {
  const g = d.growth;
  if (!g.capped || year <= g.tCap) return Math.min(d.mass, p.seedMass * 2 ** (year / p.doublingYears));
  return Math.min(d.mass, g.massAtCap + g.rateCap * (year - g.tCap) * YEAR);
}

/** State of the build-out at a given year; the sail/pod mix is held constant as the swarm grows. */
export function atYear(p, d, year) {
  const built = builtAt(p, d, year);
  const frac = built / d.mass;
  const f = d.f * frac;
  const tSail = sheetTemp(d.sail.S, f, FIXED.film);
  const mined = built * d.minedPerDelivered;
  const growing = built < d.mass;
  const exportRate = growing ? Math.min(d.growth.rateCap, (built * Math.LN2) / (p.doublingYears * YEAR)) : 0;
  return {
    year, built, frac, f,
    nSails: d.nSails * frac,
    nPods: d.nPods * frac,
    chipPower: d.chipPower * frac,
    flops: d.flops * frac,
    tSail,
    mercuryRemoved: mined / MERCURY.M,
    mercuryRadius: mercuryRadius(mined),
    mercurySurface: mercurySurfaceLayer(mined),
    exportRate,
    heatOnMercury: exportRate * d.minedPerDelivered * p.heatPerKg * 1e6,
    heatLimited: growing && exportRate >= d.growth.rateCap * 0.999,
    earth: earthImpact(FIXED.film, d.rSail, f, tSail, d.sail.S),
  };
}

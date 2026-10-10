// Model v2: concentrated-compute satellites (own design) with knife-edge radiators.
// One satellite = sun-facing c-Si PV wings + one synchronous compute module + pumped NaK loops to
// double-sided radiator blades held edge-on to the Sun. Everything the page shows derives from here.
import { PHYS, MERCURY } from './constants.js';
import { pvState, radiatorFlux } from './sat2.js';
import { launchFromMercury, growthPlan, builtAt, mercuryRadius, mercurySurfaceLayer } from './model.js';

const { L_SUN, AU, SIGMA, C, YEAR, G0 } = PHYS;

// Energy per operation relative to an 85 °C design at the same clock, for logic designed for heat
// (Vt/Vdd re-optimised). Hot-silicon research pass: x1.20 @105, x1.43 @125, x1.76 @150, x2.31 @175 °C.
const E_REL = [[85, 1.0], [95, 1.10], [105, 1.20], [125, 1.43], [150, 1.76], [175, 2.31], [200, 4.09]];
export function energyPenalty(tjC) {
  if (tjC <= E_REL[0][0]) return 1;
  for (let i = 1; i < E_REL.length; i++) {
    const [t1, e1] = E_REL[i], [t0, e0] = E_REL[i - 1];
    if (tjC <= t1) return e0 * (e1 / e0) ** ((tjC - t0) / (t1 - t0));
  }
  return E_REL[E_REL.length - 1][1];
}

export const PARAMS2 = [
  // chips
  { key: 'tjLogicC', group: 'Chips', label: 'Logic junction limit', unit: '°C', min: 85, max: 175, step: 1, value: 105,
    help: 'Silicon logic designed for heat: 105 °C is credible with 10-year lifetime; 150 °C needs SRAM-only memory and heavy current derating.' },
  { key: 'stackDT', group: 'Chips', label: 'Junction to radiator drop', unit: 'K', min: 10, max: 60, step: 1, value: 22,
    help: 'Dies hybrid-bonded to silicon cold plates on a NaK loop: about 22 K. Today’s water-type GPU stack: about 47 K.' },
  { key: 'memShare', group: 'Chips', label: 'Share of heat from memory', unit: '', min: 0, max: 0.4, step: 0.01, value: 0.15 },
  { key: 'memRadC', group: 'Chips', label: 'Memory loop radiator', unit: '°C', min: 40, max: 110, step: 1, value: 65,
    help: 'HBM-class DRAM must stay at or below ~95 °C, so it gets its own colder loop.' },
  { key: 'jPerFlop85', group: 'Chips', label: 'Energy per FLOP at 85 °C', unit: 'J', min: 1e-15, max: 1e-12, log: true, value: 1.3e-13,
    help: 'System-level (logic + memory + interconnect) per dense FP8 FLOP for a 2026 accelerator, at full clock.' },
  { key: 'clockFactor', group: 'Chips', label: 'Energy factor from under-clocking', unit: '', min: 0.4, max: 1, step: 0.01, value: 0.6,
    help: 'Running more silicon at ~0.6× clock and ~0.6 V roughly halves energy per operation. Mercury makes silicon cheap.' },
  // satellite
  { key: 'satPower', group: 'Satellite', label: 'Compute power per satellite', unit: 'W', min: 1e4, max: 1e8, log: true, value: 1e6 },
  { key: 'pvEta0', group: 'Satellite', label: 'PV efficiency (AM0, 28 °C)', unit: '', min: 0.1, max: 0.3, step: 0.005, value: 0.20 },
  { key: 'pvTempCo', group: 'Satellite', label: 'PV temperature coefficient', unit: '/K', min: -0.006, max: 0, step: 0.0001, value: -0.0042 },
  { key: 'pvAreal', group: 'Satellite', label: 'PV wing areal density', unit: 'kg/m²', min: 0.2, max: 3, step: 0.05, value: 0.8 },
  { key: 'radAreal', group: 'Satellite', label: 'Radiator areal density', unit: 'kg/m²', min: 1, max: 8, step: 0.1, value: 3.0 },
  { key: 'computeKgPerKW', group: 'Satellite', label: 'Compute module mass', unit: 'kg/kW', min: 1, max: 15, step: 0.5, value: 4 },
  { key: 'loopKgPerKW', group: 'Satellite', label: 'Pumped loops + plumbing', unit: 'kg/kW', min: 0.3, max: 3, step: 0.1, value: 1.0 },
  { key: 'busKgPerKW', group: 'Satellite', label: 'Bus, lasers, propulsion, structure', unit: 'kg/kW', min: 0.5, max: 5, step: 0.1, value: 1.5 },
  // swarm
  { key: 'coverage', group: 'Swarm', label: 'Sunlight captured', unit: '', min: 0.0001, max: 1, log: true, value: 0.1 },
  { key: 'placement', group: 'Swarm', label: 'Placement', unit: '', options: ['optimal', 'manual'], value: 'optimal' },
  { key: 'rManual', group: 'Swarm', label: 'Manual orbit radius', unit: 'AU', min: 0.3, max: 2, step: 0.01, value: 0.6 },
];

export function defaults2() {
  return Object.fromEntries(PARAMS2.map(s => [s.key, s.value]));
}

const PV_FIXED = { pvT0: 301, pvAlpha: 0.9, pvEpsFront: 0.85, pvEpsBack: 0.85, pvPacking: 0.9 };
const RAD_FIXED = { radEps: 0.9, radFinEff: 0.9 };

export const flux = rAU => L_SUN / (4 * Math.PI * (rAU * AU) ** 2);

/** One satellite at distance r in a swarm of coverage f. */
export function satelliteAt(p, rAU, f) {
  const pp = { ...PV_FIXED, ...RAD_FIXED, ...p };
  const S = flux(rAU);
  const pv = pvState(S, f, pp);
  const P = p.satPower;
  const tRadLogic = p.tjLogicC + 273.15 - p.stackDT;
  const tRadMem = p.memRadC + 273.15;
  const qLogic = radiatorFlux(tRadLogic, f, pv.T, pp);
  const qMem = radiatorFlux(tRadMem, f, pv.T, pp);
  const aPV = P / Math.max(1e-9, pv.elecM2);
  const aRadLogic = qLogic > 0 ? (P * (1 - p.memShare)) / qLogic : Infinity;
  const aRadMem = qMem > 0 ? (P * p.memShare) / qMem : Infinity;
  const aRad = aRadLogic + aRadMem;
  const kW = P / 1e3;
  const mass = {
    pv: aPV * p.pvAreal,
    radiators: aRad * p.radAreal,
    compute: kW * p.computeKgPerKW,
    loops: kW * p.loopKgPerKW,
    bus: kW * p.busKgPerKW,
  };
  const total = Object.values(mass).reduce((a, b) => a + b, 0);
  const jPerFlop = p.jPerFlop85 * energyPenalty(p.tjLogicC) * p.clockFactor;
  return {
    rAU, S, pv, tRadLogic, tRadMem, qLogic, qMem, aPV, aRad, aRadLogic, aRadMem,
    mass, massTotal: total, kgPerW: total / P, jPerFlop, flops: P / jPerFlop,
    radFeasible: Number.isFinite(aRad),
  };
}

/** Distance that minimises kg per watt of compute for a given coverage. */
export function optimalRadius(p, f) {
  let best = null;
  for (let r = 0.25; r <= 2.0001; r += 0.005) {
    const s = satelliteAt(p, r, f);
    if (!s.radFeasible || !(s.pv.elecM2 > 0)) continue;
    if (!best || s.kgPerW < best.kgPerW) best = s;
  }
  return best;
}

/** Whole swarm. Coverage = PV area / sphere area (blades are edge-on and intercept ~nothing). */
export function swarm(p) {
  const f = Math.min(1, Math.max(1e-9, p.coverage));
  const sat = p.placement === 'manual' ? satelliteAt(p, p.rManual, f) : optimalRadius(p, f);
  const rAU = sat.rAU;
  const shellArea = 4 * Math.PI * (rAU * AU) ** 2;
  const pvAreaTotal = f * shellArea;
  const nSats = pvAreaTotal / sat.aPV;
  const power = nSats * p.satPower;
  const mass = nSats * sat.massTotal;
  // Thermodynamic floor for a nearly closed swarm: all heat leaves through the outer envelope.
  const rFloorClosed = Math.sqrt(L_SUN / (4 * Math.PI * RAD_FIXED.radEps * SIGMA * sat.tRadLogic ** 4)) / AU;
  return {
    f, rAU, sat, shellArea, pvAreaTotal, nSats, power, intercepted: f * L_SUN,
    mass, fracMercury: mass / MERCURY.M, fracRock: mass / MERCURY.M_SHELL,
    flops: power / sat.jPerFlop,
    rFloorClosed,
    insideEarth: rAU < 1,
    lightAcross: (2 * rAU * AU) / C,
  };
}

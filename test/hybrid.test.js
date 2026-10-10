// Pins model v4 (hybrid sails + pods, technology eras, refresh-limited build) to the research:
// docs/architecture.md (2026 physics) and docs/future-tech.md (mature era, timeline, limits).
// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as h from '../src/model/hybrid.js';
import { MERCURY } from '../src/model/constants.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} ±${tol}`);
const p26 = h.eraParams('2026');
const pMid = h.eraParams('mid');

// ---------------------------------------------------------------- 2026 hardware (v3 physics)

test('2026: a sparse sail sits at 0.92 AU with its film at 348 K and ~233 W/m² of electricity', () => {
  const s = h.swarmAt(p26, 0.01);
  near(s.rSail, 0.919, 0.003, 'sail radius');
  near(s.sail.T, 348.15, 0.2, 'film temperature');
  near(s.sail.elecM2, 233, 2, 'W/m²');
  near(s.sail.eta, 0.144, 0.002, 'packed efficiency');
  near(s.sail.chipPitch, 0.0268, 0.001, 'chiplet pitch');
  assert.equal(s.sail.overLimit, false);
});

test('2026: sails weigh ~0.92 g/W, best-credible pods ~3.9 g/W, 15 % pods ≈ 1.37 g/W', () => {
  const s = h.swarmAt(p26, 0.01);
  near(s.sail.kgPerW * 1e3, 0.92, 0.04, 'sail g/W');
  near(s.pod.kgPerW * 1e3, 3.9, 0.15, 'pod g/W');
  near(s.pod.qRad, 1141, 30, 'pod radiator flux at 353 K');
  near(s.kgPerW * 1e3, 1.37, 0.05, 'hybrid g/W');
  const g = q => h.swarmAt({ ...p26, podFrac: q }, 0.01).kgPerW * 1e3;
  const perPct = (g(0.01) / g(0) - 1) * 100;
  assert.ok(perPct > 2.5 && perPct < 8, `mass added per 1 % of pods: ${perPct}`);
});

test('a dense swarm must retreat outward (cavity effect): f = 1 puts 2026 sails at ~1.35 AU', () => {
  const s = h.swarmAt(p26, 1);
  near(s.rSail, 1.347, 0.01, 'closed-shell radius');
  assert.ok(s.rPod >= s.rSail, 'pods never sit inside the sail shell');
  assert.ok(s.pod.feasible);
});

test('2026 FLOP per joule of chip power follows the 85/105 °C energy basis', () => {
  const s = h.swarmAt(p26, 0.1);
  near(s.chipPower / s.intercepted, 0.131, 0.005, 'chip watts per watt of sunlight');
  near(s.flops / s.chipPower, (1 / 7.8e-14) * (0.85 + 0.15 / 1.2), 1e11, 'FLOP per joule');
});

test('energy per op: the 2026 table, and exp(slope·ΔT) for mature logic', () => {
  assert.equal(h.energyPenalty(85), 1);
  near(h.energyPenalty(105), 1.2, 1e-9, '2026 at 105 °C');
  near(h.energyPenalty(150), 1.76, 1e-9, '2026 at 150 °C');
  near(h.energyPenalty(105, 0.0056), Math.exp(0.112), 1e-12, 'mature at 105 °C');
});

// ---------------------------------------------------------------- mature era (2100+ central)

test('mature era: sails nearer the Sun (sub-bandgap light reflected), lighter, ~65x more FLOP per joule of sunlight', () => {
  const s = h.swarmAt(pMid, 0.01);
  near(s.rSail, 0.862, 0.005, 'sail radius');
  near(s.sail.T, 349.15, 0.3, 'film at Tj − 9 K');
  near(s.sail.kgPerW * 1e3, 0.79, 0.03, 'sail g/W');
  near(s.kgPerW * 1e3, 0.90, 0.04, 'swarm g/W with 6 % pods');
  const ratio = (s.flops / s.intercepted) / (h.swarmAt(p26, 0.01).flops / h.swarmAt(p26, 0.01).intercepted);
  assert.ok(ratio > 50 && ratio < 80, `FLOP per joule of sunlight vs 2026: ${ratio}`);
});

test('film beats pods per kg in every era', () => {
  for (const era of ['2026', 'low', 'mid', 'high']) {
    const s = h.swarmAt(h.eraParams(era), 0.01);
    assert.ok(s.sail.flopsPerKg / s.pod.flopsPerKg > 2.5, `${era}: ${s.sail.flopsPerKg / s.pod.flopsPerKg}`);
  }
});

// ---------------------------------------------------------------- build-out

const dMid = h.compute({ ...pMid, coverage: 1 });

test('timeline (central): heat wall ~2109, 1 % ~2123, 10 % ~2382, ceiling ~14 % set by refresh', () => {
  const g = dMid.growth;
  near(g.tCap + pMid.seedYear, 2109, 3, 'heat wall');
  near(dMid.yearsToCoverage(0.01) + pMid.seedYear, 2123, 4, '1 % coverage');
  near(dMid.yearsToCoverage(0.1) + pMid.seedYear, 2382, 15, '10 % coverage');
  near(dMid.reachableCoverage, 0.142, 0.012, 'ceiling coverage');
  assert.ok(g.peakMass <= g.steadyMass * 1.001 && g.peakMass >= 0.85 * g.steadyMass, 'peak ≈ export · L / (1 − ρ)');
});

test('without recycling a 10-year fleet stalls near 1 % coverage', () => {
  const d = h.compute({ ...pMid, coverage: 1, serviceLife: 10, recycleFrac: 0 });
  assert.ok(d.reachableCoverage < 0.02 && d.reachableCoverage > 0.003, `ceiling ${d.reachableCoverage}`);
});

test('Mercury is finite: removal never exceeds its rock, and the fleet decays once the rock is gone', () => {
  const g = dMid.growth;
  assert.ok(g.tRockOut != null, 'rock runs out at full target');
  for (const y of [100, 500, 1000, 2000, 4000, 5900]) {
    const a = h.atYear(pMid, dMid, y);
    assert.ok(a.mercuryRemoved <= MERCURY.M_SHELL / MERCURY.M * (1 + 1e-9), `year ${y}: ${a.mercuryRemoved}`);
  }
  assert.ok(h.atYear(pMid, dMid, 5900).f < 0.1 * dMid.reachableCoverage, 'fleet shrinks after the rock');
});

test('atYear coverage follows the mass standing, and its orbit is the thermal orbit for that coverage', () => {
  const a = h.atYear(pMid, dMid, dMid.growth.tPeak);
  near(a.f, dMid.reachableCoverage, 0.002, 'coverage at peak');
  near(a.rSail, h.sailThermalRadius(pMid, a.f), 1e-9, 'orbit');
  assert.ok(a.replacementShare <= 1);
});

test('a small target is reached and then held by replacement only', () => {
  const d = h.compute({ ...pMid, coverage: 0.001 });
  assert.ok(d.growth.reachedTarget);
  const a = h.atYear(pMid, d, d.growth.yearsForMass(d.mass) + 200);
  near(a.f, 0.001, 2e-5, 'held at target');
  near(a.exportRate, (1 - pMid.recycleFrac) * a.retireRate, 0.02 * a.retireRate + 1, 'export = unrecycled retirements');
});

test('no NaN or negative values anywhere on the slider grid', () => {
  const grid = [
    { podFrac: 0 }, { podFrac: 1 }, { serviceLife: 0 }, { recycleFrac: 0.99 }, { coverage: 1e-6 }, { coverage: 1 },
    { placement: 'manual', rManual: 0.5, coverage: 0.95 }, { placement: 'manual', rManual: 2, coverage: 0.5 },
    { tjFilmC: 150 }, { fabToolIntensity: 500 }, { doublingYears: 5, seedMass: 1e4 },
  ];
  for (const g of grid) {
    for (const era of ['2026', 'mid']) {
      const p = { ...h.eraParams(era), ...g };
      const d = h.compute(p);
      for (const k of ['mass', 'chipPower', 'flops', 'reachableCoverage', 'kgPerW']) {
        assert.ok(!Number.isNaN(d[k]) && d[k] >= 0, `${era} ${JSON.stringify(g)} ${k} = ${d[k]}`);
      }
      const a = h.atYear(p, d, 300);
      for (const k of ['f', 'flops', 'mercuryRemoved', 'exportRate', 'replacementShare']) {
        assert.ok(Number.isFinite(a[k]) && a[k] >= 0, `${era} ${JSON.stringify(g)} atYear ${k} = ${a[k]}`);
      }
      assert.ok(Number.isFinite(a.earth.forcing), `${era} ${JSON.stringify(g)} forcing`);
    }
  }
});

// ---------------------------------------------------------------- Earth

test('Earth: a uniform interior shell adds ~1.9 W/m² per 1 % coverage; ≤ 1 W/m² allows only ~0.5 %', () => {
  const s = h.swarmAt(pMid, 0.01);
  const e = h.compute({ ...pMid, coverage: 0.01 }).earth;
  assert.ok(s.rSail < 1, 'interior');
  near(e.forcing, 1.86, 0.15, 'forcing at 1 %');
  near(h.earthSafeCoverage(pMid, 1.0), 0.0053, 0.0007, 'Earth-safe coverage');
});

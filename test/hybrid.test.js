// Pins model v3 (hybrid sails + pods) to the numbers of the architecture research
// (docs/architecture.md). Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as h from '../src/model/hybrid.js';

const p = h.defaults();
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} ±${tol}`);

test('a sparse sail sits at 0.92 AU with its film at 348 K and ~233 W/m² of electricity', () => {
  const d = h.compute({ ...p, coverage: 0.01 });
  near(d.rSail, 0.919, 0.003, 'sail radius');
  near(d.sail.T, 348.15, 0.2, 'film temperature');
  near(d.sail.elecM2, 233, 2, 'W/m²');
  near(d.sail.eta, 0.144, 0.002, 'packed efficiency');
  near(d.sail.chipPitch, 0.0268, 0.001, 'chiplet pitch');
  assert.equal(d.sail.overLimit, false);
});

test('sails weigh ~0.9 g/W and best-credible pods ~3.9 g/W', () => {
  const d = h.compute({ ...p, coverage: 0.01 });
  near(d.sail.kgPerW * 1e3, 0.92, 0.04, 'sail g/W');
  near(d.pod.kgPerW * 1e3, 3.9, 0.15, 'pod g/W');
  near(d.pod.qRad, 1141, 30, 'pod radiator flux at 353 K');
  near(d.pod.kgPerWItems.radiator * 1e3, 1.14, 0.05, 'radiator g/W');
});

test('every 1 % of power moved into pods adds ~3 % of an all-sail mass; 15 % pods ≈ 1.37 g/W', () => {
  const g = q => h.compute({ ...p, coverage: 0.01, podFrac: q }).kgPerW * 1e3;
  near(g(0.15), 1.37, 0.05, 'hybrid g/W');
  const perPct = (g(0.01) / g(0) - 1) * 100;
  assert.ok(perPct > 2.5 && perPct < 8, `mass added per 1 % of pods: ${perPct}`);
});

test('a dense swarm must retreat outward (cavity effect): f = 1 puts the sails at ~1.35 AU', () => {
  const d = h.compute({ ...p, coverage: 1 });
  near(d.rSail, 1.347, 0.01, 'closed-shell radius');
  assert.ok(d.rPod >= d.rSail, 'pods never sit inside the sail shell');
  assert.ok(d.pod.feasible);
});

test('swarm power and FLOP/s follow from the captured sunlight', () => {
  const d = h.compute({ ...p, coverage: 0.1 });
  near(d.chipPower / d.intercepted, 0.131, 0.005, 'chip watts per watt of sunlight');
  near(d.flops / d.chipPower, 1 / 7.8e-14 * (0.85 + 0.15 / 1.2), 1e11, 'FLOP per joule');
  near(d.podPower / d.chipPower, 0.15, 1e-9, 'pod share');
});

test('hot junctions cost energy per operation', () => {
  assert.equal(h.energyPenalty(85), 1);
  near(h.energyPenalty(105), 1.2, 1e-9, '105 °C');
  near(h.energyPenalty(150), 1.76, 1e-9, '150 °C');
});

test('build-out: the growth plan reaches the finished mass, and atYear interpolates', () => {
  const d = h.compute({ ...p, coverage: 0.01 });
  const t = d.growth.yearsToFull;
  near(h.builtAt(p, d, t), d.mass, d.mass * 1e-6, 'built at completion');
  const half = h.atYear(p, d, d.growth.yearsForFraction(0.5));
  near(half.frac, 0.5, 1e-3, 'half built');
  near(half.f, 0.005, 1e-5, 'coverage at half');
});

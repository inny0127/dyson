// Pins the model to values computed independently in the research pass (Python, scratch scripts)
// and to textbook numbers. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/model/model.js';
import { PHYS, S0, MERCURY, EARTH } from '../src/model/constants.js';

const p = m.defaults();
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

test('solar constant at 1 AU', () => {
  near(S0, 1361, 1);
  near(m.flux(MERCURY.a), 9083, 15);
});

test('sheet temperature matches the radiosity table T(r, f)', () => {
  // research table, mid parameters alpha 0.90, eps_f 0.85, eps_b 0.90
  const table = [
    [1.0, 0.001, 333.4], [1.0, 0.5, 359.6], [1.0, 0.9, 392.7], [1.0, 1.0, 404.1],
    [1.4, 0.001, 281.8], [1.4, 1.0, 341.5], [0.387, 0.001, 535.9], [0.387, 1.0, 649.6],
    [0.7, 0.1, 403.7], [2.0, 0.3, 245.9],
  ];
  for (const [r, f, T] of table) near(m.sheetTemp(m.flux(r), f, p), T, 0.3, `r=${r} f=${f}`);
});

test('closed shell is 1.21x hotter than a lone plate and independent of absorptance', () => {
  const S = m.flux(1);
  near(m.sheetTemp(S, 1, p) / m.sheetTemp(S, 0, p), 1.212, 0.003);
  near(m.sheetTemp(S, 1, { ...p, alpha: 0.6 }), m.sheetTemp(S, 1, p), 1e-6);
});

test('fluxForTemp inverts sheetTemp', () => {
  for (const f of [0, 0.3, 1]) {
    const S = m.fluxForTemp(345, f, p);
    near(m.sheetTemp(S, f, p), 345, 1e-6);
  }
});

test('thermal placement of a full swarm lands between Earth and Mars', () => {
  const d = m.compute({ ...p, tChipMax: 353, dTJunction: 10, coverage: 1 });
  near(d.tSheet, 343, 0.01);
  assert.ok(d.rAU > 1.35 && d.rAU < 1.45, `r = ${d.rAU}`);
});

test('thermodynamic floor on radiating area', () => {
  // L / (eps_b sigma T^4) at 343 K = 5.42e23 m^2 (closed, one-sided)
  near(m.minRadiatingArea(343, 0.9, 1) / 1e23, 5.42, 0.03);
});

test('Landauer limit', () => {
  near(m.landauer(300), 2.87e-21, 0.01e-21);
});

test('Earth: interior and exterior swarms', () => {
  const T = (r, f) => m.sheetTemp(m.flux(r), f, p);
  // full swarm at 0.9 AU: +212 W/m^2, T_eff ~299 K
  const a = m.earthImpact(p, 0.9, 1, T(0.9, 1), m.flux(0.9));
  near(a.forcing, 212, 3);
  near(a.tEff, 299, 1.5);
  // 1% swarm at 0.4 AU ~ +0.9 W/m^2, at 0.95 AU ~ +2.4 W/m^2
  near(m.earthImpact(p, 0.4, 0.01, T(0.4, 0.01), m.flux(0.4)).forcing, 0.95, 0.15);
  near(m.earthImpact(p, 0.95, 0.01, T(0.95, 0.01), m.flux(0.95)).forcing, 2.5, 0.25);
  // closed shell at 1.4 AU encloses Earth: T_eff in the 360s K
  const c = m.earthImpact(p, 1.4, 1, T(1.4, 1), m.flux(1.4));
  assert.ok(c.tEff > 355 && c.tEff < 370, `tEff ${c.tEff}`);
  assert.ok(c.runaway);
  assert.ok(c.nightLux > 1000, 'no night inside a closed shell');
});

test('Mercury layered model', () => {
  near((MERCURY.M_SHELL + MERCURY.M_CORE) / MERCURY.M, 1, 1e-3);
  near(MERCURY.M_SHELL / MERCURY.M, 0.2437, 0.002);        // rock is only ~24% of Mercury
  near(m.mercuryRadius(0), MERCURY.R, 1);
  near(m.mercuryRadius(MERCURY.M_SHELL), MERCURY.R_CORE, 1);
  // shrink table from the research pass (radius fraction vs mass fraction removed)
  for (const [f, rf] of [[0.05, 0.969], [0.2, 0.865], [0.25, 0.827], [0.5, 0.723], [0.75, 0.574], [0.95, 0.335]]) {
    near(m.mercuryRadius(f * MERCURY.M) / MERCURY.R, rf, 0.002, `removed ${f}`);
  }
  // layered binding energy 1.926e30 J (uniform sphere 3GM^2/5R = 1.79e30)
  near(m.bindingEnergy() / 1e30, 1.926, 0.01);
});

test('Launch from Mercury', () => {
  const h = m.hohmann(MERCURY.a, 1.0);
  near(h.dv1 / 1e3, 9.61, 0.05);
  near(h.dv2 / 1e3, 7.53, 0.05);
  // perihelion launch (research): 1 AU -> 8.58 km/s launch, 9.36 km/s circularisation, 37.5 km track at 100 g
  const l = m.launchFromMercury(1.0);
  near(l.vLaunch / 1e3, 8.58, 0.02);
  near(l.dvCirc / 1e3, 9.36, 0.02);
  near(l.trackLength / 1e3, 37.5, 0.3);
  near(m.launchFromMercury(1.4).vLaunch / 1e3, 10.69, 0.03);
});

test('compute() is finite for extreme slider settings', () => {
  for (const spec of m.PARAMS) {
    if (spec.options) continue;
    for (const v of [spec.min, spec.max]) {
      const d = m.compute({ ...p, [spec.key]: v });
      for (const k of ['rAU', 'tSheet', 'nSats', 'massSwarm', 'flopsTotal']) assert.ok(Number.isFinite(d[k]), `${spec.key}=${v} -> ${k}=${d[k]}`);
      const now = m.atYear({ ...p, [spec.key]: v }, d, p.year);
      assert.ok(Number.isFinite(now.f) && Number.isFinite(now.earth.forcing), `${spec.key}=${v} atYear`);
    }
  }
});

test('build-out is monotonic in time', () => {
  const d = m.compute(p);
  let last = -1;
  for (let y = 0; y <= d.growth.yearsToFull + 5; y += 0.5) {
    const n = m.atYear(p, d, y);
    assert.ok(n.f >= last);
    last = n.f;
  }
  near(last, d.f, 1e-9);
});

test('constants sanity', () => {
  near(EARTH.absorbedSolar, 238, 1);
  near(PHYS.L_SUN / (4 * Math.PI * PHYS.R_SUN ** 2 * PHYS.SIGMA) ** 1 / PHYS.T_SUN ** 4, 1, 0.01);
});

test('growth plan: pure exponential without a heat limit', () => {
  const q = { ...p, mercuryHeatLimit: 1e40 };
  const d = m.compute(q);
  assert.equal(d.growth.capped, false);
  near(d.growth.yearsToFull, Math.log2(d.massSwarm / q.seedMass) * q.doublingYears, 1e-9);
});

test('growth plan: heat wall turns exponential growth linear, continuously', () => {
  const d = m.compute(p);
  const g = d.growth;
  assert.ok(g.capped);
  // cap: heat limit / heat per kg, converted from mined to delivered mass
  near(g.rateCap, p.mercuryHeatLimit / (p.heatPerKg * 1e6) / d.logistics.minedPerDelivered, 1);
  const a = m.builtAt(p, d, g.tCap - 1e-6), b = m.builtAt(p, d, g.tCap + 1e-6);
  near(b / a, 1, 1e-5);
  // after the knee, mass grows by rateCap per year
  near(m.builtAt(p, d, g.tCap + 10) - m.builtAt(p, d, g.tCap), g.rateCap * 10 * PHYS.YEAR, 1e12);
  near(g.yearsForMass(m.builtAt(p, d, g.tCap + 37)), g.tCap + 37, 1e-6);
  const n = m.atYear(p, d, g.tCap + 5);
  assert.ok(n.heatLimited);
  near(n.heatOnMercury, p.mercuryHeatLimit, p.mercuryHeatLimit * 1e-6);
});

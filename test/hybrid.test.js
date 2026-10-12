// Pins model v4 (hybrid sails + pods, technology eras, refresh-limited build) to the research:
// docs/architecture.md (2026 physics) and docs/future-tech.md (mature era, timeline, limits).
// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as h from '../src/model/hybrid.js';
import { MERCURY } from '../src/model/constants.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} ±${tol}`);
// Hardware is pinned on the shell (sails on their thermal orbits inside Earth's) with the design-spec
// film. pU is the near-uniform swarm: the same hardware with infrared-dark fronts and a film thinned
// to 0.52, all round the Sun except a cone round the Sun–Earth line. pFar: the far-side cloud. These
// keep today's service life (15 years, 94 % recycled) and Mercury's rock only. The page's default
// (pC) is the closed swarm with sails that last centuries and the core's silicon (closed-swarm tests).
const today = { serviceLife: 15, recycleFrac: 0.94, rockSource: 'mantle' };
const shell = p => ({ ...p, earthPlacement: 'shell', filmThin: 1 });
const p26 = shell(h.eraParams('2026'));
const pMid = shell({ ...h.eraParams('mid'), ...today });
const pU = { ...h.eraParams('mid'), ...today, earthPlacement: 'uniform' };
const pFar = { ...pU, earthPlacement: 'farside' };
const pC = h.eraParams('mid');

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
const dFar = h.compute({ ...pFar, coverage: 1 });
const dU = h.compute({ ...pU, coverage: 1 });

test('timeline (central, near-uniform): heat wall ~2143, 10 % ~2147, half the Sun ~2174, ~83 % when the rock runs out', () => {
  const g = dU.growth;
  assert.equal(pU.earthPlacement, 'uniform');
  near(g.tCap + pU.seedYear, 2143, 3, 'heat wall');
  near(dU.yearsToCoverage(0.1) + pU.seedYear, 2147, 3, '10 % coverage');
  near(dU.yearsToCoverage(0.5) + pU.seedYear, 2174, 4, 'half the Sun');
  near(dU.reachableCoverage, 0.83, 0.02, 'ceiling coverage, just short of the room (85 %)');
  near(g.doublingYearsEff, 1.85, 0.1, 'doubling time with fabs (thin film carries more die per kg)');
  near(g.tRockOut + pU.seedYear, 2198, 5, 'industry digs out all of Mercury’s rock');
  assert.ok(g.peakMass < 0.6 * g.steadyMass, 'the rock runs out before refresh balances export');
});

test('far side and near-uniform: the same hardware needs (r_orbit / r)² more film per watt; dark fronts cost computing', () => {
  const a = h.swarmAt(pMid, 0.01), b = h.swarmAt({ ...pMid, earthPlacement: 'farside' }, 0.01);
  near(b.mass / a.mass, 1 / a.rSail ** 2, 1e-9, 'mass');
  near(b.flops / a.flops, 0.66, 1e-9, 'FLOP/s');
  assert.equal(b.rOrbit, 1);
  const c = h.swarmAt({ ...pMid, earthPlacement: 'uniform' }, 0.5), a5 = h.swarmAt(pMid, 0.01);
  near(c.mass / (50 * a5.mass), (0.95 / a5.rSail) ** 2, 1e-9, 'uniform: no cavity retreat, linear in coverage');
  near(c.flops / (50 * a5.flops), h.darkFrontFactor(pMid, 0.95), 1e-9, 'uniform FLOP/s');
});

test('dark fronts: ×0.66 at 1 AU (the study), ~0.60 at 0.95 AU where the film runs ~10 K hotter', () => {
  near(h.darkFrontFactor(pMid, 1), 0.66, 1e-12, 'far side');
  near(h.darkFrontFactor(pMid, 0.95), 0.60, 0.01, 'near-uniform');
  // 0.95 AU: the innermost radius where the rock, not the room, sets the size; farther out the
  // same computing, nearer in less
  const rows = h.orbitChoice(pU, h.earthLimits(pU, dU));
  const at = r => rows.find(x => x.r === r);
  assert.ok(!at(0.95).roomBound && at(0.92).roomBound, 'room binds inside 0.95');
  assert.ok(at(0.92).flops < 0.96 * at(0.95).flops, 'less computing nearer in');
  near(at(1.0).flops / at(0.95).flops, 1, 0.02, 'about the same farther out');
});

test('thin film: 0.52 of the design-spec mass, cells 4.8 % less efficient', () => {
  const t = h.swarmAt({ ...pMid, filmThin: 0.52 }, 0.01), a = h.swarmAt(pMid, 0.01);
  near(h.filmAreal({ ...pMid, filmThin: 0.52 }) / h.filmAreal(pMid), 0.52, 1e-12, 'film mass');
  assert.ok(t.sail.kgPerW < 0.6 * a.sail.kgPerW, `sail g/W ${t.sail.kgPerW * 1e3}`);
  assert.equal(h.eraParams('2026').filmThin, 1, '2026 hardware keeps the design-spec film');
});

test('Mercury: heat per kg, not the surface, sets the export rate (5×10¹⁸ W at 0.1 MJ/kg mined)', () => {
  near(dU.logistics.minedRateCap, 5e18 / 0.1e6, 1, 'kg/s mined');
  const slow = h.compute({ ...pU, coverage: 1, heatPerKg: 2 });
  near(dU.logistics.minedRateCap / slow.logistics.minedRateCap, 2 / 0.1, 1e-9, 'surface launch at full speed');
  assert.ok(slow.yearsToCoverage(0.1) - dU.yearsToCoverage(0.1) > 50, 'decades later');
});

test('without recycling a 10-year fleet stalls far short of the room', () => {
  const d = h.compute({ ...pU, coverage: 1, serviceLife: 10, recycleFrac: 0 });
  assert.ok(d.reachableCoverage < 0.2 && d.reachableCoverage > 0.05, `ceiling ${d.reachableCoverage}`);
})

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

test('build constants come from the swarm actually built, not from an unreachable target', () => {
  const a = h.compute({ ...pFar, coverage: 1 }), b = h.compute({ ...pFar, coverage: a.reachableCoverage });
  near(a.growth.doublingYearsEff, b.growth.doublingYearsEff, 0.02, 'doubling time');
  near(a.logistics.sail.vLaunch, b.logistics.sail.vLaunch, 50, 'launch speed');
  assert.ok(a.logistics.sail.vLaunch < 8700, `launch speed ${a.logistics.sail.vLaunch}`);
});

test('the fleet starts empty: in the first decades it is a few sails, not a floor value', () => {
  const a = h.atYear(pMid, dMid, 5);
  assert.ok(a.nSails < 1e3, `sails after 5 years: ${a.nSails}`);
  assert.equal(h.atYear(pMid, dMid, 0).built, 0);
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

test('Earth limits: the L1 shade holds Earth’s temperature; Mercury’s rock sets the size (~83 %)', () => {
  // glow: the study's 0.58 lux per 1 % at rho 0.003, r 0.91 AU (shell); the far side with its L3 gap
  // 0.368 (render/sky_map.py, = the study's 0.368 at 1.2 % without the gap)
  const p91 = { ...pMid, rhoVis: 0.003, placement: 'manual', rManual: 0.91 };
  near(h.skyLux(p91, 0.01), 0.58, 0.02, 'shell ground lux per 1 % (earth_safe.json)');
  near(h.skyLux({ ...pFar, rhoVis: 0.003, spillInside: 'stop' }, 0.01), 0.368, 1e-9, 'far side');
  // default: near-uniform, infrared-dark fronts everywhere, empty round the Sun–Earth line and L3
  const U = h.earthLimits(pU, dU);
  assert.equal(U.binding, 'rock');
  near(U.room, 0.849, 1e-9, 'room: 0.9 of 94 % of the sky');
  near(U.cap, dU.reachableCoverage, 1e-12, 'everything Mercury can build');
  near(U.forcing.gross, 0.563 * U.cap * 100, 1e-6, 'infrared from fronts only, 0.563 W/m² per 1 %');
  near(U.forcing.net, 0, 1e-9, 'Earth held at today’s temperature');
  near(U.forcing.sunlightCut, 0.196, 0.01, 'sunlight cut');
  near(U.forcing.rainCut, 0.30, 0.02, 'rainfall cut');
  // the far side alone, stopped at its room
  const S = h.earthLimits({ ...pFar, spillInside: 'stop' }, dFar);
  assert.equal(S.binding, 'room');
  near(S.cap, 0.282, 1e-9, 'far side only');
  near(S.forcing.gross, 11.8, 0.3, 'its heat');
  // gentle: 1 W/m² allowed, a shade of half that, a ±30° far-side cloud
  const gentle = { ...pFar, forcingLimit: 1, shadeLimit: 0.5, farsideLat: 30 };
  const G = h.earthLimits(gentle, dFar);
  near(G.cap, 0.0379, 0.002, 'far side with a 1.5× shade');
  near(h.earthForcing(gentle, G.cap).net, 1, 1e-9, 'net forcing at the cap is the budget');
  near(h.earthLimits({ ...pMid, forcingLimit: 1, shadeLimit: 0 }).cap, 0.0053, 0.0007, 'shell at 1 W/m², no shade');
  near(G.skyLuxAtCap, 1.86, 0.05, 'with the ecliptic upright, the night sky is lit by ~7 full Moons');
  // the slit with ordinary fronts: half a shell's infrared, no shadow, still ~4× the uniform swarm per 1 %
  const shellE = h.earthForcing(pMid, 0.38), coneE = h.earthForcing({ ...pMid, earthPlacement: 'cone' }, 0.38);
  near(coneE.gross, 0.5 * (shellE.gross + shellE.swapped - shellE.shade), 1e-9, 'half the infrared');
  assert.ok(coneE.gross > 4 * h.earthForcing(pU, 0.38).gross, `cone ${coneE.gross}`);
  // the shade cannot block more sunlight than reaches Earth
  const big = h.earthForcing({ ...pMid, placement: 'manual', rManual: 0.99 }, 0.9);
  assert.ok(big.swapped <= 238.5 && big.net > 0, `swap ${big.swapped}, net ${big.net}`);
});

// ---------------------------------------------------------------- closed swarm (docs/closed-swarm.md)

const dC = h.compute({ ...pC, coverage: 1 });

test('closed: the default encloses the Sun at 0.95 AU, with a mirror cap 23° round the Sun–Earth line', () => {
  assert.equal(pC.earthPlacement, 'closed');
  near(h.FIXED.capFrac, 0.04, 0.001, 'the cap is 4 % of the sphere');
  near(dC.reachableCoverage, 1, 1e-6, 'all the sunlight');
  const s = h.swarmAt(pC, 1);
  near(s.rOrbit, 0.95, 1e-12, 'radius');
  near(s.flops, 1.88e40, 0.02e40, 'FLOP/s');
  // the cap: ten layers of foil, ~1 % of the swarm's mass
  assert.ok(s.massSails > 0 && 3.24e20 / s.mass < 0.01, 'cap mass');
});

test('closed: all the heat leaves through the backs, so the film runs ~419 K (vs 332 K when sparse)', () => {
  const S = 1361 / 0.95 ** 2;
  near(h.closedFilmT(pC, 1), (S / ((1 - h.FIXED.capFrac) * pC.epsBack * 5.670374e-8)) ** 0.25, 0.5, 'closed');
  near(h.closedFilmT(pC, 1), 419, 1, 'closed');
  near(h.closedFilmT(pC, 0.001), 332, 1, 'sparse');
  // catches 18 % more sunlight than the near-uniform swarm but computes ~5 % less
  const uRoom = h.swarmAt({ ...pC, earthPlacement: 'uniform' }, h.FIXED.uniformRoom);
  near(h.swarmAt(pC, 1).flops / uRoom.flops, 0.95, 0.02, 'closed vs near-uniform');
});

test('closed: Earth sees only the cap’s cold back (0.6 W/m²), no glow at night, full sunlight', () => {
  const E = h.earthLimits(pC, dC);
  near(h.earthForcing(pC, 1).gross, 0.6, 1e-12, 'infrared');
  near(E.forcing.sunlightCut, 0.0025, 0.0005, 'a shade of 0.25 % holds the temperature');
  assert.equal(h.skyLux(pC, 1), 0, 'no glow');
  assert.equal(E.binding, 'room');
});

test('closed timeline: heat wall ~2145, half ~2173, mantle gone ~2200, closed ~2214 from the core’s silicon', () => {
  const g = dC.growth;
  near(g.tCap + pC.seedYear, 2145, 3, 'heat wall');
  near(dC.yearsToCoverage(0.5) + pC.seedYear, 2173, 4, 'half');
  near(g.tMantleOut + pC.seedYear, 2200, 4, 'crust and mantle dug out');
  near(dC.yearsToCoverage(0.99) + pC.seedYear, 2214, 5, 'closed');
  near(g.rockCore, MERCURY.M_CORE * 0.06 / 0.25 * pC.yieldDelivered, 1e9, 'core silicon as rock');
  // with the mantle alone the swarm stops at ~93 %
  near(h.compute({ ...pC, coverage: 1, rockSource: 'mantle' }).reachableCoverage, 0.933, 0.01, 'mantle only');
  // what is dug: all the rock and ~9 % of the core; never more than the planet
  near(dC.fracMercury, 0.31, 0.01, 'share of Mercury dug');
  for (const y of [100, 200, 1000, 5900]) assert.ok(h.atYear(pC, dC, y).mercuryRemoved <= 1, `year ${y}`);
  const a = h.atYear(pC, dC, 160);
  assert.equal(a.mercurySurface, 'core');
  const b = h.atYear(pC, dC, 100).heatOnMercury;                 // the mantle at the wall (less the fabs' share)
  near(a.heatOnMercury, b, 0.01 * b, 'the core is dug at the same heat wall');
});

test('centuries of life: a 300-year rebuild losing 1 % needs ~1.2×10¹⁸ kg a year, ~19,000 years of the core', () => {
  const loss = dC.mass * (1 - pC.recycleFrac) / pC.serviceLife;
  near(loss, 1.2e18, 0.05e18, 'kg a year');
  const coreLeft = dC.growth.rockCore - (dC.mass - dC.growth.rockMantle);
  assert.ok(coreLeft / loss > 15000, `${coreLeft / loss} years`);
  // with today's life the core's silicon goes on replacements and the swarm never closes
  assert.ok(h.compute({ ...pC, coverage: 1, ...today, rockSource: 'whole' }).reachableCoverage < 0.95);
});

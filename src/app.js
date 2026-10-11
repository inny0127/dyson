// The page: an essay whose figures, drawings and charts are recomputed from model v4
// (src/model/hybrid.js) whenever the hardware era, an assumption or the year changes.
import * as h from './model/hybrid.js';
import { EARTH, MERCURY, PHYS } from './model/constants.js';
import { earthImpact } from './model/model.js';
import { sci, pct, kelvin, kg, length } from './util/format.js';
import { renderParams } from './ui/params.js';
import { buildChart, earthChart, sedChart, orbitMap } from './ui/charts.js';
import { sailAnatomy, heatPaths } from './ui/illustrations.js';

const { YEAR } = PHYS;
const $ = id => document.getElementById(id);
const num = v => `<span class="num">${v}</span>`;
const yr = t => (Number.isFinite(t) ? Math.round(t) : 'never');

const WORLD_AI_FLOPS_2025 = 3.2e22;     // FLOP/s of AI accelerators on Earth, 2025 (workloads study)
const BRAIN_FLOPS = 1e15;               // Carlsmith 2020 central estimate (range 1e13-1e17)
const SAIL_SIDE = 279.01;               // m, design spec (catenary-edged square, 69,543 m²)
const FILM_THICKNESS = 80e-6;           // m

const SPAN = 1500;
const SPLIT = [120, 0.55];              // the first 120 years take 55 % of the timeline
const xOf = t => t <= SPLIT[0] ? (t / SPLIT[0]) * SPLIT[1] : SPLIT[1] + ((t - SPLIT[0]) / (SPAN - SPLIT[0])) * (1 - SPLIT[1]);
const tOf = u => u <= SPLIT[1] ? (u / SPLIT[1]) * SPLIT[0] : SPLIT[0] + ((u - SPLIT[1]) / (1 - SPLIT[1])) * (SPAN - SPLIT[0]);

const state = { era: 'mid', baseEra: 'mid', params: { ...h.eraParams('mid') }, t: 95, curves: {} };

// --------------------------------------------------------------------------------- model glue

/** Extra heat on Earth for sails spread inside Earth's orbit (the shell), W/m². */
function forcingAt(p, f) {
  const s = h.swarmAt(p, f);
  return earthImpact(h.filmOptics(p), s.rSail, s.f, s.sail.T, s.sail.S).forcing;
}
function coverageTable(p) {
  const rows = [];
  for (let i = 0; i <= 90; i++) {
    const f = 10 ** (-9 + (9 * i) / 90);
    const s = h.swarmAt(p, f);
    rows.push({ f, mass: s.mass, forcing: forcingAt(p, f) });
  }
  return rows;
}
function fForMass(table, m) {
  if (!(m > 0)) return 0;
  if (m <= table[0].mass) return (table[0].f * m) / table[0].mass;
  for (let i = 1; i < table.length; i++) {
    if (table[i].mass >= m) {
      const a = table[i - 1], b = table[i];
      const w = Math.log(m / a.mass) / Math.log(b.mass / a.mass);
      return Math.exp(Math.log(a.f) + w * Math.log(b.f / a.f));
    }
  }
  return 1;
}
function curveFor(d, table) {
  const { t, B } = d.growth.samples;
  const pts = [];
  let last = -1;
  for (let i = 0; i < t.length && t[i] <= SPAN; i++) {
    const x = xOf(t[i]);
    if (x - last < 0.0012 && i < t.length - 1) continue;
    last = x;
    pts.push([t[i], Math.max(1e-12, fForMass(table, B[i]))]);
  }
  return pts;
}
function sailFacts(p) {
  const s = h.swarmAt(p, 0.01);
  const side = SAIL_SIDE * Math.sqrt(p.sailArea / 69543);
  // on the far side the same sail flies at 1 AU: less sunlight, and hotter chips (FIXED.farsideFlopFactor)
  const kS = s.farside ? s.rSail ** 2 : 1;
  const W = s.sail.chipWm2 * p.sailArea * kS;
  const flops = (W / s.sail.jPerFlop) * (s.farside ? h.FIXED.farsideFlopFactor : 1);
  return { s, side, diag: side * Math.SQRT2, MW: W / 1e6, chips: W / p.chipPower, flops, mass: p.sailArea * p.filmAreal,
    farside: s.farside, S: s.sail.S * kS, pitch: s.sail.chipPitch / Math.sqrt(kS) };
}

function recompute() {
  const p = state.params;
  state.d = h.compute(p);
  state.earth = h.earthLimits(p);
  state.far = h.earthLimits({ ...p, earthPlacement: 'farside' });
  state.shellE = h.earthLimits({ ...p, earthPlacement: 'shell' });
  state.table = coverageTable(p);
  state.curve = curveFor(state.d, state.table);
  for (const era of ['2026', 'low', 'mid', 'high']) {
    if (!state.curves[era]) {
      const q = h.eraParams(era);
      state.curves[era] = curveFor(h.compute(q), coverageTable(q));
    }
  }
  renderAll();
}

// --------------------------------------------------------------------------------- sections

function renderFigures() {
  const p = state.params, d = state.d, E = state.earth;
  const f = sailFacts(p);
  const ceilFlops = h.swarmAt(p, d.reachableCoverage).flops;
  const tCap = d.yearsToCoverage(E.cap);
  const now = new Date().getFullYear();
  const reached = Number.isFinite(tCap)
    ? [`${yr(p.seedYear + tCap)}`, `when it is reached, ${Math.max(0, Math.round(p.seedYear + tCap - now))} years from now`]
    : ['never', 'industry stops short of what Earth allows'];
  const ratio = ceilFlops / E.flops;
  const items = [
    [`${sci(E.flops, 2)} FLOP/s`, `what Earth allows, ${pct(E.cap, 2)} of the Sun`],
    reached,
    [`${f.MW.toFixed(0)} MW`, `in one sail ${Math.round(f.diag)} m across`],
    ratio > 1.05 ? [`${Math.round(ratio)}×`, 'more than Earth allows, if industry ran unchecked'] : ['within', 'industry never outgrows what Earth allows'],
  ];
  $('figures').innerHTML = items.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
}

function renderSail() {
  const p = state.params;
  const f = sailFacts(p);
  $('sail-title').textContent = 'A sheet, not a box';
  const atLimit = h.swarmAt(p, state.earth.cap);
  const nSails = atLimit.sailPower / atLimit.sail.chipWm2 / p.sailArea;
  $('sail-prose').innerHTML = `
    <p>Each satellite is a square of solar film ${num(`${Math.round(f.side)} m`)} on a side, flown corner-first as a diamond ${num(`${Math.round(f.diag)} m`)} from tip to tip. The film is ${num('80 µm')} thick, a little thinner than office paper, which makes the sail ${num(sci(f.side / FILM_THICKNESS, 2))} times wider than it is thick. Shrink it to the width of a room and it would be about as thick as the wall of a soap bubble. It weighs ${num(kg(f.mass))}. That works only because, out there, nothing pushes on it except sunlight.</p>
    <p>Behind the cells sit ${num(sci(f.chips, 2))} chiplets, one every ${num(length(f.s.sail.chipPitch))}. Together they draw ${num(`${f.MW.toFixed(1)} MW`)} and compute ${num(`${sci(f.flops, 2)} FLOP/s`)}, ${num(`${(f.flops / WORLD_AI_FLOPS_2025).toFixed(2)}×`)} all the AI hardware on Earth in 2025. That is one sail. The swarm Earth allows has about ${num(sci(nSails, 1))} of them.</p>
    ${f.farside
      ? `<p>It flies on Earth's own orbit, 1 AU from the Sun, but between a quarter and three quarters of a turn away from Earth, on the far side of the Sun. That spot is chosen for Earth's sake, not the chips'. Sunlight there is ${num(`${Math.round(f.S)} W/m²`)}, and from out there Earth always sits within 45° of the Sun, in front of the sail. So the cover glass carries a fine aluminium mesh that is dark in the infrared: the film can barely radiate forward, toward Earth, and pushes its heat out of the back. That runs the chiplets at about ${num('110 °C')} and costs a third of the computing per watt. The same sail spread evenly inside Earth's orbit would settle at ${num(`${f.s.rSail.toFixed(3)} AU`)}, where its chips sit at their ${num(`${p.tjFilmC} °C`)} limit and it computes more, but Earth would then let the swarm be only ${num(`1/${Math.round(state.earth.cap / state.earth.shell)}`)} as large.</p>`
      : `<p>The sail orbits at ${num(`${f.s.rSail.toFixed(3)} AU`)}, just inside Earth's orbit, in sunlight of ${num(`${Math.round(f.s.sail.S)} W/m²`)}. You might expect a solar computer to crowd in toward the Sun for more power, but the chips decide where it flies. The film settles at ${num(kelvin(f.s.sail.T))}, the chiplets run ${num(`${p.filmSpreadDT} K`)} hotter at their ${num(`${p.tjFilmC} °C`)} limit, and any closer in they would overheat.</p>`}
    <p>The photograph at the top was taken by a simulated camera a kilometre away, exposed for sunlit grey. The film reflects about 0.2% of visible light, so it comes out nearly black, which is what a good solar cell should look like. Light it reflects is power it didn't collect. The bright line is the Sun's reflection in the cover glass, broken into segments where each 1.6 m fold panel curls slightly beside its hinge.</p>`;
  sailAnatomy($('anatomy'), {
    side: f.side, diag: f.diag, pitchMm: f.pitch * 1e3, chipW: p.chipPower, mw: f.MW, chips: f.chips,
    lanes: state.era !== '2026',
  });
}

function renderComputer() {
  const p = state.params;
  const f = sailFacts(p);
  // workloads study: a sail of 5.7e21 FLOP/s serves ~1.3e7 agents and trains ~1e13 active
  // parameters a year; agents scale with FLOP/s, compute-optimal model size with its square root
  const agents = 1.3e7 * (f.flops / 5.7e21);
  const params = 1e13 * Math.sqrt(f.flops / 5.7e21);
  const optical = state.era !== '2026';
  $('computer-prose').innerHTML = `
    <p>The chips are spread through the film because a thin sheet can't move heat sideways. The metal you would need to spread a chip's heat grows with the square of its power, from ${num('0.09 g/W')} at 0.1 W per chip to ${num('9.4 g/W')} at 10 W. At ${num(`${p.chipPower} W`)} each, the heat doesn't have to go anywhere. The film right around each chip radiates it. ${f.farside ? 'The film sheds all the sunlight it absorbs, mostly through its back,' : 'Both faces together shed all the sunlight the film absorbs,'} about ${num(`${Math.round(p.alpha * f.S)} W/m²`)}, and ${num(`${Math.round(f.s.sail.chipWm2 * f.S / f.s.sail.S)} W/m²`)} of that happens to pass through the chips on its way out. Thermally, the computing is almost free. The sail would have to get rid of that heat whether the chips were there or not.</p>
    <p>${optical
      ? 'Optical lanes laid in the film, fibre or waveguides, make each sail one tightly coupled machine. A bit crosses the whole sail in about two microseconds.'
      : 'With 2026 hardware the chiplets talk over an electrical mesh, hop by hop, so a sail works as many loosely linked patches. Optical lanes in the film, expected from about 2050, turn it into one tightly coupled machine.'}
      Neighbouring sails are tens to hundreds of kilometres apart, up to a millisecond away by light, so the sail is the unit that computes in lockstep. A sail like this one could serve roughly ${num(sci(agents, 1))} AI agents at once, or train a model with about ${num(sci(params, 1))} active parameters in a year.</p>`;
}

function renderWhy() {
  const p = state.params;
  const s = h.swarmAt(p, 0.01);
  const ratio = s.sail.flopsPerKg / s.pod.flopsPerKg;
  const at15 = h.swarmAt({ ...p, podFrac: 0.15 }, 0.01).kgPerW / s.kgPerW;
  const podLine = s.q >= 0.149
    ? `Here they carry ${num(pct(s.q, 1))} of chip power, the share needed if film chiplets cannot run agent sandboxes. If every chiplet could, it would fall toward 1%.`
    : `Here they carry ${num(pct(s.q, 1))} of chip power. If every chiplet can run a sandbox, that falls toward 1%. If none can, it rises to 15%, and the swarm gets ${num(pct(at15 - 1, 0))} heavier.`;
  $('why-prose').innerHTML = `
    <p>Packing a satellite's chips into one module looks like the obvious design, since chips that work in lockstep want short wires. The trouble is the heat. Once it is concentrated it has to be carried somewhere large enough to radiate it, and the pumps, pipes and radiators that do the carrying weigh more than the short wires save. Per kilogram of Mercury, spread-out sails deliver ${num(`${ratio.toFixed(1)}×`)} the computing of the best concentrated module.</p>
    <p>Pods still earn a place. Some memory can't survive radiation without a shield, some dies are too large for the film, and archives and agent sandboxes want a sealed box. ${podLine}</p>`;
  heatPaths($('heatpaths'), { sailGW: s.sail.kgPerW * 1e3, podGW: s.pod.kgPerW * 1e3, chipW: p.chipPower });
  const rows = [
    ['Mass per watt of chips', `${(s.sail.kgPerW * 1e3).toFixed(2)} g/W`, `${(s.pod.kgPerW * 1e3).toFixed(2)} g/W`],
    ['Computing per kilogram', `${sci(s.sail.flopsPerKg, 2)} FLOP/s`, `${sci(s.pod.flopsPerKg, 2)} FLOP/s`],
    ['One failure takes out', `one ${p.chipPower} W chiplet`, '0.5–1 MW'],
    ['Share of chip power', pct(1 - s.q, 1), pct(s.q, 1)],
  ];
  $('why-table').innerHTML = `<thead><tr><th></th><th>Compute sail</th><th>Concentrated pod</th></tr></thead><tbody>${rows.map(([k, a, b]) => `<tr><td>${k}</td><td class="v">${a}</td><td class="v">${b}</td></tr>`).join('')}</tbody>`;
}

/** Radiator temperature at which Mercury's paved surface sheds `Q` W of 500 K waste heat through
 * heat pumps at half of Carnot (ε 0.9); the pumps' own work is radiated too. */
function radiatorTemp(Q) {
  const A = 4 * Math.PI * MERCURY.R ** 2, Tc = 500;
  const shed = T => { const cop = (0.5 * Tc) / (T - Tc); return 0.9 * PHYS.SIGMA * T ** 4 * A * cop / (1 + cop); };
  if (Q <= 0.9 * PHYS.SIGMA * Tc ** 4 * A) return Tc;
  let lo = Tc + 1, hi = 6000;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (shed(m) < Q) lo = m; else hi = m; }
  return lo;
}

function renderMercury() {
  const p = state.params, d = state.d, g = d.growth, E = state.earth;
  const now = h.atYear(p, d, state.t);
  const rockOut = g.tRockOut != null ? Math.round(p.seedYear + g.tRockOut) : null;
  const Tr = radiatorTemp(p.mercuryHeatLimit);
  const bare = 0.9 * PHYS.SIGMA * 500 ** 4 * 4 * Math.PI * MERCURY.R ** 2;
  const rockUsed = E.mass * d.minedPerDelivered / MERCURY.M_SHELL;
  $('mercury-prose').innerHTML = `
    <p>Mercury is mostly iron. Its crust and mantle, the part worth mining, are ${num(pct(MERCURY.M_SHELL / MERCURY.M, 0))} of its mass. Surprisingly little happens on the surface. Machines dig the rock, and electromagnetic launchers throw it, unrefined, into low orbit at about ${num('3 km/s')}. Everything else happens up there. Catapults in orbit add the rest of the ${num(`${(d.logistics.sail.vLaunch / 1e3).toFixed(1)} km/s`)} the sails need, and factories reduce the rock to silicon, magnesium, aluminium and glass. About ${num(pct(p.yieldDelivered, 0))} of each kilogram ends up in spacecraft, and the oxygen becomes ion-thruster propellant.</p>
    <p>The reason is heat. Energy is not scarce here, since the swarm can beam down as much as anyone wants. What is scarce is a way to get rid of it. Bare ground at ${num('500 K')} radiates only ${num(`${sci(bare, 1)} W`)} from the whole planet. So the planet is paved with radiators, and heat pumps lift the waste heat to about ${num(`${(Math.round(Tr / 50) * 50).toLocaleString('en-US')} K`)}, where they shed ${num(`${sci(p.mercuryHeatLimit, 1)} W`)}. Hotter radiators help only a little: at ${num('2,000 K')}, about as hot as one can be built, the same planet sheds under ${num('10¹⁹ W')}. What can still be changed is how much heat each kilogram leaves behind. Digging and the first ${num('3 km/s')} leave about ${num(`${p.heatPerKg} MJ`)}. Launching all the way from the ground would leave ${num('1.8 MJ')}, and refining on the ground tens of MJ.</p>
    <p>Industry copies itself every ${num(`${g.doublingYearsEff.toFixed(2)} years`)}, held back by the chip fabs it has to build. In ${num(yr(p.seedYear + g.tCap))} it hits the <em>heat wall</em>, and exports stop growing at ${num(`${sci(g.capToSails * YEAR, 2)} kg`)} a year. By ${num(Math.round(now.calendarYear))}, ${num(pct(now.mercuryRemoved, 2))} of the planet has been taken apart. The swarm Earth allows takes ${num(pct(rockUsed, rockUsed < 0.1 ? 1 : 0))} of Mercury's rock${rockOut ? `. Left alone, industry would dig out all of it by ${num(rockOut)}` : ''}.</p>`;
}

function readout(a) {
  const p = state.params;
  const lux = h.skyLux(p, a.f);
  const fc = a.forcing;
  const items = [
    ['Year', `${Math.round(a.calendarYear)}`],
    ['Sunlight captured', pct(a.f, 2)],
    ['Computing', `${sci(a.flops, 2)} FLOP/s`],
    ['Sails flying', sci(a.nSails, 2)],
    ['Mercury removed', pct(a.mercuryRemoved, 2)],
    ['Output replacing old sails', pct(a.replacementShare, 0)],
    [fc.shade > 0 ? 'Extra heat on Earth, after the shade' : 'Extra heat on Earth', `+${sci(fc.net, 2)} W/m²`, fc.net > p.forcingLimit * 1.001],
    ['Night sky after dusk', `${sci(lux, 2)} lux`],
  ];
  return items.map(([k, v, over]) => `<div><span>${k}</span><b class="${over ? 'over' : ''}">${v}</b></div>`).join('');
}

function renderBuild() {
  const p = state.params, d = state.d, g = d.growth, E = state.earth;
  const y1 = d.yearsToCoverage(0.01), y10 = d.yearsToCoverage(0.1), yCap = d.yearsToCoverage(E.cap);
  const ceil = d.reachableCoverage;
  const reach = [];
  if (Number.isFinite(y1)) reach.push(`${num('1%')} of the Sun's light by ${num(yr(p.seedYear + y1))}`);
  if (Number.isFinite(y10)) reach.push(`${num('10%')} by ${num(yr(p.seedYear + y10))}`);
  const growthLine = reach.length
    ? `Growth is exponential until the heat wall, reaching ${reach.join(' and ')}.`
    : `Growth is exponential until the heat wall, but the swarm never reaches ${num('1%')} of the Sun's light.`;
  const upkeep = g.reachedTarget && p.coverage < 1
    ? `It stops there because that is the target you set.`
    : g.tRockOut != null && g.tRockOut <= g.tPeak + 1
    ? `What stops it is Mercury itself. By ${num(yr(p.seedYear + g.tRockOut))} all of its rock has been dug out, and from then on the fleet slowly wears away.`
    : p.serviceLife > 0
    ? `The ceiling is set by upkeep, not by Mercury: sails wear out after ${num(`${p.serviceLife} years`)}, ${num(pct(p.recycleFrac, 0))} of each is recycled in orbit, and new exports only replace the rest.`
    : `With sails that never wear out, the swarm keeps growing at the heat-limited rate until it reaches its target or Mercury's rock runs out.`;
  const earthLine = Number.isFinite(yCap)
    ? `Earth's limit, the blue line, is crossed in ${num(yr(p.seedYear + yCap))}.`
    : `It never reaches Earth's limit, the blue line.`;
  $('build-prose').innerHTML = `<p>For decades there is nothing to see, which is how exponential growth always looks from the inside. ${growthLine} Then it tops out at ${num(pct(ceil, 1))}. ${upkeep} ${earthLine}</p>`;
  const a = h.atYear(p, d, state.t);
  const markers = [
    { t: g.tCap, f: fForMass(state.table, g.builtAtYear(g.tCap)), label: `heat wall, ${yr(p.seedYear + g.tCap)}` },
    { t: y1, f: 0.01, label: `1%, ${yr(p.seedYear + y1)}` },
    { t: y10, f: 0.1, label: `10%, ${yr(p.seedYear + y10)}` },
    { t: g.tPeak, f: ceil, label: `ceiling ${pct(ceil, 1)}` },
  ];
  if (g.tRockOut != null) markers.push({ t: g.tRockOut, f: fForMass(state.table, g.builtAtYear(g.tRockOut)), label: 'rock exhausted' });
  state.chart = buildChart($('build-chart'), {
    main: state.curve,
    others: ['2026', 'low', 'mid', 'high'].filter(e => e !== state.era).map(e => ({ pts: state.curves[e] })),
    markers, xOf, tOf, seedYear: p.seedYear, span: SPAN,
    limit: { f: E.cap, label: `What Earth allows, ${pct(E.cap, 2)}` },
    cursor: { t: state.t, f: a.f },
    describe: (t, f) => `<b>${Math.round(p.seedYear + t)}</b><br>${pct(f, 3)} of sunlight captured`,
    onPick: t => { state.t = t; renderYear(); },
  });
  const label = h.ERAS[state.era] ? h.ERAS[state.era].label : 'Your assumptions';
  $('build-legend').innerHTML = `<span><i style="background:var(--sun-mark)"></i>${label}</span><span><i style="background:var(--ink-3)"></i>the other hardware presets</span><span><i style="background:var(--earth)"></i>what Earth allows</span>`;
  updateYear(a);
}

/** The year cursor, readout and slider, without redrawing the chart. */
function updateYear(a) {
  state.chart?.setCursor(state.t, a.f);
  $('build-readout').innerHTML = readout(a);
  $('year').value = String(Math.round(xOf(state.t) * 1000));
}

function renderEarth() {
  const p = state.params, d = state.d, E = state.earth, far = state.far, sh = state.shellE;
  const F = h.FIXED;
  const ceil = d.reachableCoverage;
  const farside = p.earthPlacement === 'farside';
  const fc = farside ? h.earthForcing(p, ceil).gross : forcingAt(p, ceil);
  const runaway = EARTH.runawayAbsorbedLimit - EARTH.absorbedSolar;
  const yCap = d.yearsToCoverage(E.cap);
  const over = ceil > E.cap * 1.02;
  const co2 = p.forcingLimit / EARTH.co2DoublingForcing;
  const consequence = fc > runaway
    ? `, past the ${num(`${Math.round(runaway)} W/m²`)} that tips Earth into a runaway greenhouse`
    : `, ${(fc / EARTH.co2DoublingForcing).toFixed(1)} times the effect of doubling CO₂`;
  const perPct = farside
    ? `Even parked on the far side of the Sun with their fronts dark in the infrared, the sails send Earth ${num(`${(F.farsideIRPerF / 100).toFixed(2)} W/m²`)} for every 1% of sunlight they capture.`
    : `Spread evenly inside Earth's orbit, the sails add about ${num(`${forcingAt(p, 0.01).toFixed(1)} W/m²`)} for every 1% of sunlight they capture, even after you subtract the sunlight they block.`;
  const p1 = over
    ? `Left alone, industry would take this swarm to ${num(pct(ceil, 1))} of the Sun's light${farside && ceil > F.farsideGeomCap ? ', more than the far side even has room for' : ''}, and Earth can't live with that. Every watt a sail intercepts comes back out as infrared, and some of it lands on Earth. ${perPct} At the ceiling that is ${num(`${fc.toFixed(0)} W/m²`)}${consequence}.`
    : `With these assumptions industry stops at ${num(pct(ceil, 2))} of the Sun's light, within what Earth allows. Every watt the sails intercept still leaves them as infrared, and some of it lands on Earth. ${perPct}`;
  const shadeW = (p.thermostatCredit - 1) * p.forcingLimit;
  const p2 = farside
    ? `So the limit is the climate. The budget used here is ${num(`${p.forcingLimit} W/m²`)} of extra heat, ${co2 < 0.45 ? `about ${pct(co2, 0)} of` : `${co2.toFixed(1)} times`} what doubling CO₂ does. There is one more trick: a thin cloud of ordinary sails at L1, 1.6 million km sunward of Earth, can take a little sunlight off Earth to make room for more infrared. It is not a clean swap. Sunlight drives evaporation and infrared mostly doesn't, so every W/m² traded this way costs about ${num('0.76%')} of the world's rainfall. Letting the shade cancel ${num(`${shadeW.toFixed(1)} W/m²`)}, Earth allows ${num(pct(E.cap, 2))} of the Sun. The same sails spread evenly inside Earth's orbit, where they surround Earth on every side, would be allowed ${num(pct(E.shell, 2))}.`
    : `So the limit is the climate. The budget used here is ${num(`${p.forcingLimit} W/m²`)} of extra heat, ${co2 < 0.45 ? `about ${pct(co2, 0)} of` : `${co2.toFixed(1)} times`} what doubling CO₂ does, and with the sails spread evenly inside Earth's orbit it allows ${num(pct(E.cap, 2))} of the Sun.`;
  const p3 = `So the swarm Earth allows captures about ${num(pct(E.cap, 2))} of the Sun, ${num(`${sci(E.flops, 2)} FLOP/s`)}. That is about ${num(sci(E.flops / WORLD_AI_FLOPS_2025, 1))} times all the AI hardware on Earth in 2025, or ${num(sci(E.flops / BRAIN_FLOPS, 1))} human brains at 10¹⁵ FLOP/s each. ${Number.isFinite(yCap) ? `It is reached around ${num(yr(p.seedYear + yCap))}.` : 'With these assumptions industry never gets there.'}`;
  const lux = E.skyLuxAtCap;
  const moons = lux / 0.25;
  const p4 = farside
    ? `What it does to the night sky is a side effect, and not a small one. The sails reflect ${num(pct(p.rhoVis, 1))} of visible light, and from Earth the cloud is a band of even light along the ecliptic, reaching 45° from the Sun on either side. How much of it stands above the horizon after dark depends on the season. When the ecliptic rises steeply after sunset, as it does on spring evenings at mid-latitudes and most evenings in the tropics, the band lights the ground at ${num(`${lux.toFixed(1)} lux`)} once twilight is over, ${moons >= 1.5 ? `${Math.round(moons)} times` : 'about'} a full Moon. On autumn evenings it lies along the horizon and lights almost nothing. Wherever the Sun sinks more than 45° below the horizon, the band sets and the rest of the night is natural.`
    : `What it does to the night sky is a side effect, and not a small one. The sails beyond the Sun show Earth their sunlit faces through the gaps in the near ones, so a disc of light about 60° in radius stays up round the set Sun. At the end of twilight it lights the ground at ${num(`${lux.toFixed(2)} lux`)}, ${moons >= 1.5 ? `${Math.round(moons)} times` : 'about'} a full Moon.`;
  $('earth-prose').innerHTML = `<p>${p1}</p><p>${p2}</p><p>${p3}</p><p>${p4}</p>`;

  // How far the far side could go: 20 % of the Sun
  const q = { ...p, earthPlacement: 'farside' };
  const f20 = 0.2, gross20 = f20 * F.farsideIRPerF * 1.06, credit = 2.5;   // a ±60° cloud: ~6 % more infrared per 1 %
  const budget20 = gross20 / credit, rain20 = (gross20 - budget20) * 0.76;
  const flops20 = h.swarmAt(q, f20).flops;
  const y20 = h.compute({ ...q, coverage: 1 }).yearsToCoverage(f20);
  $('earth-prose-2').innerHTML = `<p>How far could this go? Four things decide it: the heat budget, how much the shade may cancel, room on the far side, and rock. Room runs out first. The far side is the slice of Earth's orbit from a quarter to three quarters of a turn away, minus 15° either side of the point straight behind the Sun, where sails would reflect near-infrared back at Earth. Within 30° of the orbit's plane, sails can fill no more than ${num(pct(F.farsideGeomCap, 1))} of the Sun's light. ${num('20%')} needs the cloud stretched to 60° above and below the plane, where sails see Earth less squarely and send it about 6% more heat per watt. Earth would then take ${num(`${gross20.toFixed(1)} W/m²`)} of infrared. Even if the shade cancelled ${num(pct(1 - 1 / credit, 0))} of that, Earth would be left with ${num(`${budget20.toFixed(1)} W/m²`)}, ${Math.abs(budget20 / EARTH.co2DoublingForcing - 1) < 0.2 ? 'about as much as doubling CO₂' : `${(budget20 / EARTH.co2DoublingForcing).toFixed(1)} times the effect of doubling CO₂`}, and the shade alone would cut the world's rainfall by about ${num(`${rain20.toFixed(0)}%`)}. Packed that densely the sails would also start to shade one another, so the real figure is lower still. That swarm would compute ${num(`${sci(flops20, 1)} FLOP/s`)}, ${(flops20 / far.flops).toFixed(0)} times the one above, and ${Number.isFinite(y20) ? `Mercury could supply it by ${num(yr(p.seedYear + y20))}` : 'Mercury could not supply it'}. Below is what its sky would look like.</p>
    <p>The far side has one more cost. A cloud this dense needs collision-free orbit lanes and the capture of every derelict, because anything lost there drifts back toward Earth.</p>`;
  orbitMap($('orbit-map'), {
    shellR: Math.min(0.96, h.swarmAt({ ...p, earthPlacement: 'shell' }, sh.cap).rSail),
    shellLabel: farside ? `alternative, inside Earth's orbit: ${pct(sh.cap, 2)}` : `allowed: ${pct(E.cap, 2)}, spread inside Earth's orbit`,
    cloudLabel: farside ? `allowed: ${pct(E.cap, 2)}, on Earth's orbit` : `alternative: ${pct(far.cap, 2)} on Earth's orbit`,
  });
  let kink = null;
  for (const r of state.table) if (h.swarmAt(p, r.f).rSail > 1) { kink = r.f; break; }
  const farPts = state.table.map(r => [r.f, r.f * F.farsideIRPerF]);
  earthChart($('earth-chart'), {
    pts: state.table.map(r => [r.f, r.forcing]),
    pts2: farPts,
    refs: [
      { v: p.forcingLimit, label: `${p.forcingLimit} W/m², the budget used here` },
      { v: EARTH.co2DoublingForcing, label: `${EARTH.co2DoublingForcing} W/m², doubling CO₂` },
      { v: runaway, label: `${Math.round(runaway)} W/m², runaway greenhouse` },
    ],
    marks: [
      { f: sh.cap, label: `inside Earth's orbit, ${pct(sh.cap, 2)}`, color: 'var(--earth)', left: true },
      { f: far.cap, label: `far side + shade, ${pct(far.cap, 2)}`, color: 'var(--swarm)' },
      { f: ceil, label: `industry's ceiling, ${pct(ceil, 1)}`, color: 'var(--ink)', top: true, left: true },
    ],
  });
  $('earth-caption').innerHTML = `<b>Extra energy absorbed by Earth, against the share of sunlight captured.</b> Solid: sails spread evenly inside Earth's orbit, their infrared minus the sunlight they block.${kink ? ` The kink near ${pct(kink, 0)} is where a dense swarm has to retreat outside Earth's orbit to stay cool.` : ''} Dashed: sails on the far side with infrared-dark fronts, before the L1 shade takes off up to ${shadeW.toFixed(1)} W/m².`;
}

function renderStar() {
  const p = state.params;
  const a = h.atYear(p, state.d, state.t);
  sedChart($('sed-chart'), { f: a.f, T: a.tSail });
  $('sed-legend').innerHTML = `<span><i style="background:var(--sun-mark)"></i>sunlight that escapes</span><span><i style="background:var(--swarm)"></i>waste heat from the sails</span><span>energy per log-wavelength, as a share of the Sun's output, in ${Math.round(a.calendarYear)}</span>`;
  // λL_λ of a blackbody peaks at λT = 3670 µm·K (energy per log-wavelength, as plotted)
  $('star-prose').innerHTML = `
    <p>From another star the Sun would look ${num(pct(a.f, 2))} dimmer in ${num(Math.round(a.calendarYear))}. On its own that would be easy to miss, because nobody out there knows how bright the Sun is supposed to be. What gives the swarm away is a second source in the infrared, peaking near ${num(`${(3.67e-3 / a.tSail * 1e6).toFixed(1)} µm`)}, the ${num(`${Math.round(a.tSail)} K`)} glow of the sails. That hump carries exactly the energy missing from the sunlight, since every watt the swarm absorbs it has to radiate again. A star a little too faint with warm infrared to spare is what surveys for Dyson spheres look for.</p>`;
}

function renderFuture() {
  const p26 = h.eraParams('2026');
  const right = state.era === '2026' ? h.eraParams('mid') : state.params;
  const rightLabel = state.era === '2026' ? h.ERAS.mid.label : (h.ERAS[state.era] ? h.ERAS[state.era].label : 'Your assumptions');
  const a = h.swarmAt(p26, 0.01), b = h.swarmAt(right, 0.01);
  const f1 = x => `${(x * 100).toFixed(1)}%`;
  $('future-prose').innerHTML = `
    <p>Industry needs most of a century to reach the heat wall, and sails are re-skinned every 10 to 20 years, so nearly every sail that ever flies carries hardware built after 2095. HBM memory, today's SRAM-heavy chips and 64 small laser terminals per sail are long gone before the first launch. The architecture outlives all of that. Sails still beat pods, chips still run near 85 °C, and silicon is still the only solar cell Mercury can supply in bulk. What changes is how much each kilogram does.</p>`;
  const rows = [
    ['Energy per operation', `${sci(a.sail.jPerFlop, 2)} J`, `${sci(b.sail.jPerFlop, 2)} J`],
    ['Memory per chiplet', '16 MB SRAM', '1–2 GB non-volatile'],
    ['Memory in pods', 'HBM stacks', 'memory bonded on logic'],
    ['Laser terminals per sail', '64 × 10 cm', '8 × 10 cm and 4 × 30 cm'],
    ['Solar cell efficiency', f1(p26.pvEta0), f1(right.pvEta0)],
    ['Orbit at 1% coverage', `${a.rSail.toFixed(3)} AU`, `${b.rSail.toFixed(3)} AU`],
    ['Swarm mass per watt of chips', `${(a.kgPerW * 1e3).toFixed(2)} g/W`, `${(b.kgPerW * 1e3).toFixed(2)} g/W`],
    ['Computing per watt of sunlight', `${sci(a.flops / a.intercepted, 2)} FLOP/J`, `${sci(b.flops / b.intercepted, 2)} FLOP/J`],
  ];
  $('future-table').innerHTML = `<thead><tr><th></th><th>2026 hardware</th><th>${rightLabel}</th></tr></thead><tbody>${rows.map(([k, x, y]) => `<tr><td>${k}</td><td class="v">${x}</td><td class="v">${y}</td></tr>`).join('')}</tbody>`;
}

const SOURCES = [
  ['Sail design, film stack, optics and structure', 'docs/data/design_spec.json'],
  ['Why sails beat concentrated modules', 'docs/architecture.md'],
  ['Hardware after 2095', 'docs/future-tech.md'],
  ['What Earth allows', 'docs/earth.md'],
  ['MESSENGER albedo and elevation of Mercury', 'USGS Astrogeology, NASA PDS'],
  ['Runaway-greenhouse limit, 282 W/m²', 'Goldblatt et al. 2013, Nature Geoscience 6, 661'],
  ['Climate forcing of doubled CO₂', 'IPCC AR6 WG1, chapter 7'],
  ['Limits to the energy efficiency of CMOS', 'Ho, Erdil and Besiroglu 2023, arXiv:2312.08595'],
  ['Attojoule optoelectronics', 'Miller 2017, Journal of Lightwave Technology 35(3)'],
  ['Space-based AI infrastructure (Suncatcher)', 'Google 2025, arXiv:2511.19468'],
  ['Brain-equivalent computing', 'Carlsmith 2020, Open Philanthropy'],
];

function renderAll() {
  renderFigures(); renderSail(); renderComputer(); renderWhy(); renderMercury(); renderBuild(); renderEarth(); renderStar(); renderFuture();
  for (const b of document.querySelectorAll('.era button')) b.setAttribute('aria-pressed', String(b.dataset.era === state.era));
}
function renderYear() { updateYear(h.atYear(state.params, state.d, state.t)); renderStar(); renderMercury(); }

// --------------------------------------------------------------------------------- wiring

let paramsUI;
function setEra(era) {
  state.era = era;
  state.baseEra = era;
  state.params = { ...h.eraParams(era) };
  paramsUI.rebind(state.params);
  recompute();
}

function init() {
  $('sources-list').innerHTML = SOURCES.map(([what, where]) => `<li>${what}: <code>${where}</code></li>`).join('');
  paramsUI = renderParams($('params'), h.PARAMS, state.params, () => { state.era = 'custom'; recompute(); });
  for (const b of document.querySelectorAll('.era button')) b.addEventListener('click', () => setEra(b.dataset.era));
  $('year').addEventListener('input', e => { state.t = tOf(Number(e.target.value) / 1000); renderYear(); });
  let playing = false, loop = 0;
  $('play').addEventListener('click', () => {
    playing = !playing;
    $('play').textContent = playing ? '❚❚' : '▶';
    if (!playing) return;
    const id = ++loop;
    let u = xOf(state.t);
    if (u >= 0.999) u = 0;
    const step = () => {
      if (!playing || id !== loop) return;
      u = Math.min(1, u + 0.0025);
      state.t = tOf(u);
      renderYear();
      if (u >= 1) { playing = false; $('play').textContent = '▶'; return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  $('reset-params').addEventListener('click', () => setEra(state.baseEra));
  recompute();
  window.__ledger = { state, recompute, setEra, setYear: t => { state.t = t; renderYear(); } };
}

init();

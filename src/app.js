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

const state = { era: 'mid', params: { ...h.eraParams('mid') }, t: 80, curves: {} };

// --------------------------------------------------------------------------------- model glue

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
  const W = s.sail.chipWm2 * p.sailArea;
  return { s, side, diag: side * Math.SQRT2, MW: W / 1e6, chips: W / p.chipPower, flops: W / s.sail.jPerFlop, mass: p.sailArea * p.filmAreal };
}

function recompute() {
  const p = state.params;
  state.d = h.compute(p);
  state.earth = h.earthLimits(p);
  state.far = h.earthLimits({ ...p, earthPlacement: 'farside' });
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
  const items = [
    [`${sci(E.flops, 2)} FLOP/s`, `what Earth allows, ${pct(E.cap, 2)} of the Sun`],
    [`${yr(p.seedYear + d.yearsToCoverage(E.cap))}`, `when it is reached, ${p.seedYear - 2026 + Math.round(d.yearsToCoverage(E.cap))} years from now`],
    [`${f.MW.toFixed(0)} MW`, `in one sail ${Math.round(f.diag)} m across`],
    [`${Math.round(ceilFlops / E.flops)}×`, 'more than Earth allows, if industry ran unchecked'],
  ];
  $('figures').innerHTML = items.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
}

function renderSail() {
  const p = state.params;
  const f = sailFacts(p);
  $('sail-title').textContent = 'A sheet, not a box';
  $('sail-prose').innerHTML = `
    <p>Each satellite is a square of solar film ${num(`${Math.round(f.side)} m`)} on a side, flown corner-first as a diamond ${num(`${Math.round(f.diag)} m`)} from tip to tip. The film is ${num('80 µm')} thick, a little thinner than office paper, so the sail is ${num(sci(f.side / FILM_THICKNESS, 2))} times wider than it is thick. It weighs ${num(kg(f.mass))}.</p>
    <p>Behind the cells sit ${num(sci(f.chips, 2))} chiplets, one every ${num(length(f.s.sail.chipPitch))}. Together they draw ${num(`${f.MW.toFixed(1)} MW`)} and compute ${num(`${sci(f.flops, 2)} FLOP/s`)}, ${num(`${(f.flops / WORLD_AI_FLOPS_2025).toFixed(2)}×`)} all the AI hardware on Earth in 2025.</p>
    <p>The sail orbits at ${num(`${f.s.rSail.toFixed(3)} AU`)}, just inside Earth's orbit, in sunlight of ${num(`${Math.round(f.s.sail.S)} W/m²`)}. That is as close to the Sun as the chips allow. The film settles at ${num(kelvin(f.s.sail.T))}, and the chiplets run ${num(`${p.filmSpreadDT} K`)} hotter, at their ${num(`${p.tjFilmC} °C`)} limit.</p>
    <p>The photograph at the top was taken by a simulated camera 1 km away, exposed for sunlit grey. The film reflects about 0.2% of visible light, so it records as near-black navy. The bright line is the Sun's reflection in the cover glass, broken into segments where each 1.6 m fold panel curls slightly beside its hinge.</p>`;
  sailAnatomy($('anatomy'), {
    side: f.side, diag: f.diag, pitchMm: f.s.sail.chipPitch * 1e3, chipW: p.chipPower, mw: f.MW, chips: f.chips,
    lanes: state.era !== '2026',
  });
}

function renderComputer() {
  const p = state.params;
  const f = sailFacts(p);
  $('computer-prose').innerHTML = `
    <p>The chips are spread through the film because a thin sheet cannot carry heat sideways. The metal needed to spread a chip's heat grows with the square of its power: ${num('0.09 g/W')} at 0.1 W per chip, ${num('9.4 g/W')} at 10 W. At ${num(`${p.chipPower} W`)} each, the film itself is the radiator. Its two faces shed all the sunlight it absorbs, about ${num(`${Math.round(p.alpha * f.s.sail.S)} W/m²`)}, of which ${num(`${Math.round(f.s.sail.chipWm2)} W/m²`)} passes through the chips on the way.</p>
    <p>Optical fibre laid in the film makes each sail one tightly coupled machine: a bit crosses the whole sail in about a microsecond. Neighbouring sails are hundreds of kilometres apart, a millisecond away by light, so the sail is the unit that computes in lockstep. A sail of this era can serve roughly ten million AI agents at once, or train a model with about 10¹³ active parameters in a year.</p>`;
}

function renderWhy() {
  const p = state.params;
  const s = h.swarmAt(p, 0.01);
  const ratio = s.sail.flopsPerKg / s.pod.flopsPerKg;
  $('why-prose').innerHTML = `
    <p>Putting all of a satellite's chips in one module sounds natural, because work that runs in lockstep wants short wires. Then the heat has to travel. That transport costs more mass than the chips save. Per kilogram of Mercury, spread-out sails deliver ${num(`${ratio.toFixed(1)}×`)} the computing of the best concentrated module.</p>
    <p>Concentrated pods still have a job: memory that cannot survive radiation unshielded, very large dies, archives, and agent sandboxes the film cannot host. Here they carry ${num(pct(s.q, 1))} of chip power. If every chiplet can run a sandbox, that falls toward 1%. If none can, it rises to 15%, and the swarm gets about a quarter heavier.</p>`;
  heatPaths($('heatpaths'), { sailGW: s.sail.kgPerW * 1e3, podGW: s.pod.kgPerW * 1e3, chipW: p.chipPower });
  const rows = [
    ['Mass per watt of chips', `${(s.sail.kgPerW * 1e3).toFixed(2)} g/W`, `${(s.pod.kgPerW * 1e3).toFixed(2)} g/W`],
    ['Computing per kilogram', `${sci(s.sail.flopsPerKg, 2)} FLOP/s`, `${sci(s.pod.flopsPerKg, 2)} FLOP/s`],
    ['One failure takes out', `one ${p.chipPower} W chiplet`, '0.5–1 MW'],
    ['Share of chip power', pct(1 - s.q, 1), pct(s.q, 1)],
  ];
  $('why-table').innerHTML = `<thead><tr><th></th><th>Compute sail</th><th>Concentrated pod</th></tr></thead><tbody>${rows.map(([k, a, b]) => `<tr><td>${k}</td><td class="v">${a}</td><td class="v">${b}</td></tr>`).join('')}</tbody>`;
}

function renderMercury() {
  const p = state.params, d = state.d, g = d.growth;
  const now = h.atYear(p, d, state.t);
  const rockOut = g.tRockOut != null ? Math.round(p.seedYear + g.tRockOut) : null;
  $('mercury-prose').innerHTML = `
    <p>Mercury is mostly iron. Its crust and mantle, the part worth mining, are ${num(pct(MERCURY.M_SHELL / MERCURY.M, 0))} of its mass. Factories reduce the rock to silicon, magnesium, aluminium and glass; about ${num(pct(p.yieldDelivered, 0))} of each kilogram ends up in spacecraft, and the oxygen becomes ion-thruster propellant. A mass driver fires each folded sail off the surface at ${num(`${(d.logistics.sail.vLaunch / 1e3).toFixed(1)} km/s`)}.</p>
    <p>Industry copies itself every ${num(`${g.doublingYearsEff.toFixed(2)} years`)}, slowed by the chip fabs it has to build. In ${num(yr(p.seedYear + g.tCap))} it reaches the <em>heat wall</em>: Mercury's night side cannot radiate away the waste heat of mining any faster, and exports stop growing at ${num(`${sci(g.capToSails * YEAR, 2)} kg`)} a year. By ${num(Math.round(now.calendarYear))}, ${num(pct(now.mercuryRemoved, 2))} of the planet is gone${rockOut ? `; at full build its rock runs out around ${num(rockOut)}` : ''}.</p>`;
}

function readout(a) {
  const p = state.params;
  const lux = h.FIXED.skyLuxPerFRho * p.rhoVis * a.f;
  const items = [
    ['Year', `${Math.round(a.calendarYear)}`],
    ['Sunlight captured', pct(a.f, 2)],
    ['Computing', `${sci(a.flops, 2)} FLOP/s`],
    ['Sails flying', sci(a.nSails, 2)],
    ['Mercury removed', pct(a.mercuryRemoved, 2)],
    ['Output replacing old sails', pct(a.replacementShare, 0)],
    ['Extra heat on Earth', `+${sci(a.earth.forcing, 2)} W/m²`, a.earth.forcing > p.forcingLimit],
    ['Night sky after dusk', `${sci(lux, 2)} lux`, lux > p.skyLimitLux],
  ];
  return items.map(([k, v, over]) => `<div><span>${k}</span><b class="${over ? 'over' : ''}">${v}</b></div>`).join('');
}

function renderBuild() {
  const p = state.params, d = state.d, g = d.growth, E = state.earth;
  const y1 = d.yearsToCoverage(0.01), y10 = d.yearsToCoverage(0.1);
  const ceil = d.reachableCoverage;
  $('build-prose').innerHTML = `
    <p>Nothing is visible for decades. Growth is exponential until the heat wall, reaching ${num('1%')} of the Sun's light by ${num(yr(p.seedYear + y1))}${Number.isFinite(y10) ? ` and ${num('10%')} by ${num(yr(p.seedYear + y10))}` : `; it never reaches ${num('10%')}`}. Then it levels off at ${num(pct(ceil, 1))}. The ceiling is set by upkeep, not by Mercury: sails wear out after ${num(`${p.serviceLife} years`)}, ${num(pct(p.recycleFrac, 0))} of each is recycled in orbit, and new exports only replace the rest. Earth's limit, the blue line, is crossed in ${num(yr(p.seedYear + d.yearsToCoverage(E.cap)))}.</p>`;
  const a = h.atYear(p, d, state.t);
  const markers = [
    { t: g.tCap, f: fForMass(state.table, g.builtAtYear(g.tCap)), label: `heat wall, ${yr(p.seedYear + g.tCap)}` },
    { t: y1, f: 0.01, label: `1%, ${yr(p.seedYear + y1)}` },
    { t: y10, f: 0.1, label: `10%, ${yr(p.seedYear + y10)}` },
    { t: g.tPeak, f: ceil, label: `ceiling ${pct(ceil, 1)}` },
  ];
  if (g.tRockOut != null) markers.push({ t: g.tRockOut, f: fForMass(state.table, g.builtAtYear(g.tRockOut)), label: 'rock exhausted' });
  buildChart($('build-chart'), {
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
  $('build-readout').innerHTML = readout(a);
  $('year').value = String(Math.round(xOf(state.t) * 1000));
}

function renderEarth() {
  const p = state.params, d = state.d, E = state.earth, far = state.far;
  const ceil = d.reachableCoverage;
  const fc = forcingAt(p, ceil);
  const runaway = EARTH.runawayAbsorbedLimit - EARTH.absorbedSolar;
  const yCap = d.yearsToCoverage(E.cap);
  $('earth-prose').innerHTML = `
    <p>Industry could take this swarm to ${num(pct(ceil, 1))} of the Sun's light. Earth cannot live with that. Every watt the sails intercept leaves them as infrared, and Earth absorbs its share. Spread evenly inside Earth's orbit, the sails add about ${num(`${forcingAt(p, 0.01).toFixed(1)} W/m²`)} of heat for every 1% of sunlight they capture, after subtracting the sunlight they block. At the ceiling that is ${num(`${fc.toFixed(0)} W/m²`)}${fc > runaway ? `, past the ${num(`${Math.round(runaway)} W/m²`)} that tips Earth into a runaway greenhouse` : `, ${Math.round(fc / EARTH.co2DoublingForcing)} times the effect of doubling CO₂`}.</p>
    <p>The night sky gives out first. Sails on the far side of the Sun show Earth their sunlit faces through the gaps, so after dusk a glow rises where the Sun went down. Film and hardware together reflect ${num(pct(p.rhoVis, 1))} of visible light, enough to light the ground like a full Moon once the swarm captures ${num(pct(E.sky, 2))}. Keeping Earth's extra heat under ${num(`${p.forcingLimit} W/m²`)} gives almost the same limit: ${num(pct(E.shell, 2))}.</p>
    <p>So the swarm Earth allows is about ${num(pct(E.cap, 2))} of the Sun, ${num(`${sci(E.flops, 2)} FLOP/s`)}. That is about ${num(sci(E.flops / WORLD_AI_FLOPS_2025, 1))} times all the AI hardware on Earth in 2025, or ${num(sci(E.flops / BRAIN_FLOPS, 1))} human brains at 10¹⁵ FLOP/s each. It is reached around ${num(yr(p.seedYear + yCap))}.</p>`;
  $('earth-prose-2').innerHTML = `
    <p>A better placement exists if a brighter night sky is accepted. Sails can share Earth's own orbit on the far side of the Sun, where they never pass in front of it. Each one then always faces both the Sun and Earth, so a fine aluminium mesh in the cover glass can make that face dark in the infrared and push the heat out of the back, away from Earth. A small cloud of sails at L1, 1.6 million km sunward of Earth, can shade away part of the rest. That allows ${num(pct(far.farside, 1))} of the Sun within ${num(`${p.forcingLimit} W/m²`)}. It costs about a third of the computing per watt, and a cloud that dense needs collision-free orbit lanes and the capture of every derelict, because lost parts drift toward Earth.</p>`;
  orbitMap($('orbit-map'), {
    shellR: Math.min(0.96, h.swarmAt(p, E.cap).rSail),
    shellLabel: `allowed now: ${pct(E.cap, 2)}, spread inside Earth's orbit`,
    cloudLabel: `option: ${pct(far.farside, 1)} on Earth's orbit`,
  });
  earthChart($('earth-chart'), {
    pts: state.table.map(r => [r.f, r.forcing]),
    refs: [
      { v: p.forcingLimit, label: `${p.forcingLimit} W/m², the budget used here` },
      { v: EARTH.co2DoublingForcing, label: `${EARTH.co2DoublingForcing} W/m², doubling CO₂` },
      { v: runaway, label: `${Math.round(runaway)} W/m², runaway greenhouse` },
    ],
    marks: [
      { f: E.cap, label: `allowed, ${pct(E.cap, 2)}`, color: 'var(--earth)', left: true },
      { f: ceil, label: `industry's ceiling, ${pct(ceil, 1)}`, color: 'var(--ink)', top: true, left: true },
    ],
  });
  $('earth-caption').innerHTML = `<b>Extra energy absorbed by Earth, against the share of sunlight captured</b>, for sails spread evenly inside Earth's orbit: their infrared minus the sunlight they block. The kink near 45% is where a dense swarm has to retreat outside Earth's orbit to stay cool.`;
}

function renderStar() {
  const p = state.params;
  const a = h.atYear(p, state.d, state.t);
  sedChart($('sed-chart'), { f: a.f, T: a.tSail });
  $('sed-legend').innerHTML = `<span><i style="background:var(--sun-mark)"></i>sunlight that escapes</span><span><i style="background:var(--swarm)"></i>waste heat from the sails</span><span>energy per log-wavelength, as a share of the Sun's output, in ${Math.round(a.calendarYear)}</span>`;
  $('star-prose').innerHTML = `
    <p>From another star the Sun would look ${num(pct(a.f, 2))} dimmer in ${num(Math.round(a.calendarYear))}. A second source would appear in the infrared, peaking near ${num(`${(2.897771955e-3 / a.tSail * 1e6).toFixed(1)} µm`)}: the ${num(`${Math.round(a.tSail)} K`)} glow of the sails. The two humps carry equal energy, because every watt the swarm absorbs it re-emits. This is the signature infrared surveys search for.</p>`;
}

function renderFuture() {
  const p26 = h.eraParams('2026');
  const p = state.params;
  const a = h.swarmAt(p26, 0.01), b = h.swarmAt(p, 0.01);
  $('future-prose').innerHTML = `
    <p>Industry needs half a century to reach the heat wall, and sails are re-skinned every 10 to 20 years, so nearly every sail ever flown carries hardware from after 2095. HBM memory, today's SRAM-heavy chips and 64 small laser terminals per sail are gone before the first launch. The architecture survives: sails still beat pods, chips still run near 85 °C, and silicon stays the only solar cell Mercury can supply in bulk. What changes is how much each kilogram does.</p>`;
  const sel = state.era !== '2026' && h.ERAS[state.era] ? h.ERAS[state.era].label : 'Selected';
  const rows = [
    ['Energy per operation', `${sci(a.sail.jPerFlop, 2)} J`, `${sci(b.sail.jPerFlop, 2)} J`],
    ['Memory per chiplet', '16 MB SRAM', '1–2 GB non-volatile'],
    ['Memory in pods', 'HBM stacks', 'memory bonded on logic'],
    ['Laser terminals per sail', '64 × 10 cm', '8 × 10 cm and 4 × 30 cm'],
    ['Solar cell efficiency', pct(p26.pvEta0, 1), pct(p.pvEta0, 1)],
    ['Orbit at 1% coverage', `${a.rSail.toFixed(3)} AU`, `${b.rSail.toFixed(3)} AU`],
    ['Swarm mass per watt of chips', `${(a.kgPerW * 1e3).toFixed(2)} g/W`, `${(b.kgPerW * 1e3).toFixed(2)} g/W`],
    ['Computing per watt of sunlight', `${sci(a.flops / a.intercepted, 2)} FLOP/J`, `${sci(b.flops / b.intercepted, 2)} FLOP/J`],
  ];
  $('future-table').innerHTML = `<thead><tr><th></th><th>2026 hardware</th><th>${sel}</th></tr></thead><tbody>${rows.map(([k, x, y]) => `<tr><td>${k}</td><td class="v">${x}</td><td class="v">${y}</td></tr>`).join('')}</tbody>`;
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
function renderYear() { renderBuild(); renderStar(); renderMercury(); }

// --------------------------------------------------------------------------------- wiring

let paramsUI;
function setEra(era) {
  state.era = era;
  state.params = { ...h.eraParams(era) };
  paramsUI.rebind(state.params);
  recompute();
}

function init() {
  $('sources-list').innerHTML = SOURCES.map(([what, where]) => `<li>${what}: <code>${where}</code></li>`).join('');
  paramsUI = renderParams($('params'), h.PARAMS, state.params, () => { state.era = 'custom'; recompute(); });
  for (const b of document.querySelectorAll('.era button')) b.addEventListener('click', () => setEra(b.dataset.era));
  $('year').addEventListener('input', e => { state.t = tOf(Number(e.target.value) / 1000); renderYear(); });
  let playing = false;
  $('play').addEventListener('click', () => {
    playing = !playing;
    $('play').textContent = playing ? '❚❚' : '▶';
    let u = xOf(state.t);
    if (u >= 0.999) u = 0;
    const step = () => {
      if (!playing) return;
      u = Math.min(1, u + 0.0025);
      state.t = tOf(u);
      renderYear();
      if (u >= 1) { playing = false; $('play').textContent = '▶'; return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  $('reset-params').addEventListener('click', () => setEra(state.era === 'custom' ? 'mid' : state.era));
  recompute();
  window.__ledger = { state, recompute, setEra, setYear: t => { state.t = t; renderYear(); } };
}

init();

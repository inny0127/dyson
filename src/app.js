// The page: a photo essay whose text, tables and charts are recomputed from model v4
// (src/model/hybrid.js) whenever an assumption, the hardware era or the year changes.
import * as h from './model/hybrid.js';
import { EARTH, MERCURY, PHYS } from './model/constants.js';
import { earthImpact } from './model/model.js';
import { sci, pct, kelvin, watts, kg, length } from './util/format.js';
import { renderParams } from './ui/params.js';
import { buildChart, earthChart, sedChart, orbitMap } from './ui/charts.js';

const { YEAR, AU } = PHYS;
const $ = id => document.getElementById(id);
const n = (v, cls = '') => `<span class="n ${cls}">${v}</span>`;
const yr = t => Number.isFinite(t) ? Math.round(t) : 'never';

// Reference points used in the prose (sources in docs/future-tech.md and docs/data/future/*.json)
const WORLD_AI_FLOPS_2025 = 3.2e22;     // FLOP/s of AI accelerators on Earth, 2025 (workloads study)
const BRAIN_FLOPS = 1e15;               // Carlsmith 2020 central estimate (1e13-1e17)
const FILM_THICKNESS = 80e-6;           // m, design spec laminate
const SAIL_SIDE = 279.01;               // m, design spec: square with catenary edges (area 69,543 m²)

const SPAN = 1500;                      // years shown on the timeline
const SPLIT = [120, 0.55];              // first 120 years take 55 % of the track
const xOf = t => t <= SPLIT[0] ? (t / SPLIT[0]) * SPLIT[1] : SPLIT[1] + ((t - SPLIT[0]) / (SPAN - SPLIT[0])) * (1 - SPLIT[1]);
const tOf = u => u <= SPLIT[1] ? (u / SPLIT[1]) * SPLIT[0] : SPLIT[0] + ((u - SPLIT[1]) / (1 - SPLIT[1])) * (SPAN - SPLIT[0]);

const state = { era: 'mid', params: { ...h.eraParams('mid') }, t: 80, d: null, table: null, curves: {}, playing: false };

/** Coverage grid for fast mass -> coverage lookups and Earth forcing. */
function coverageTable(p) {
  const rows = [];
  for (let i = 0; i <= 90; i++) {
    const f = 10 ** (-9 + (9 * i) / 90);
    const s = h.swarmAt(p, f);
    rows.push({ f, mass: s.mass, flops: s.flops, r: s.rSail, T: s.sail.T, forcing: forcingAt(p, f) });
  }
  return rows;
}
function fForMass(table, m) {
  if (!(m > 0)) return 0;
  if (m <= table[0].mass) return table[0].f * m / table[0].mass;
  for (let i = 1; i < table.length; i++) {
    if (table[i].mass >= m) {
      const a = table[i - 1], b = table[i];
      const w = Math.log(m / a.mass) / Math.log(b.mass / a.mass);
      return Math.exp(Math.log(a.f) + w * Math.log(b.f / a.f));
    }
  }
  return 1;
}
function curveFor(p, d, table) {
  const { t, B } = d.growth.samples;
  const pts = [];
  let last = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] > SPAN) break;
    const x = xOf(t[i]);
    if (x - last < 0.0015 && i < t.length - 1) continue;
    last = x;
    pts.push([t[i], Math.max(1e-12, fForMass(table, B[i]))]);
  }
  return pts;
}

function recompute() {
  const p = state.params;
  state.d = h.compute(p);
  state.earth = h.earthLimits(p);
  state.table = coverageTable(p);
  state.curve = curveFor(p, state.d, state.table);
  // faint comparison curves for the other presets (cached; they do not depend on slider edits)
  for (const era of ['2026', 'low', 'mid', 'high']) {
    if (!state.curves[era]) {
      const q = h.eraParams(era);
      const dq = h.compute(q);
      state.curves[era] = curveFor(q, dq, coverageTable(q));
    }
  }
  renderAll();
}

// ------------------------------------------------------------------------------------- text

function sailFacts(p) {
  const s = h.swarmAt(p, 0.01);
  const side = SAIL_SIDE * Math.sqrt(p.sailArea / 69543);
  const MW = (s.sail.chipWm2 * p.sailArea) / 1e6;
  const chips = (s.sail.chipWm2 * p.sailArea) / p.chipPower;
  const flops = (s.sail.chipWm2 * p.sailArea) / s.sail.jPerFlop;
  return { s, side, diag: side * Math.SQRT2, MW, chips, flops, mass: p.sailArea * p.filmAreal };
}

function renderSail() {
  const p = state.params;
  const f = sailFacts(p);
  $('sail-prose').innerHTML = `
    <p>Each satellite is a square of photovoltaic film ${n(`${Math.round(f.side)} m`)} on a side, flown corner-first as a diamond ${n(`${Math.round(f.diag)} m`)} tip to tip. The film is ${n('80 µm')} thick, a little thinner than office paper, so the sail is ${n(sci(f.side / FILM_THICKNESS, 2))} times wider than it is thick. It weighs ${n(kg(f.mass))}.</p>
    <p>Behind the cells sit ${n(sci(f.chips, 2))} chiplets, one every ${n(length(f.s.sail.chipPitch))}, each drawing ${n(`${p.chipPower} W`)}. Together they use ${n(`${f.MW.toFixed(1)} MW`, 'sun')} and compute ${n(`${sci(f.flops, 2)} FLOP/s`, 'sun')}, ${n(`${(f.flops / WORLD_AI_FLOPS_2025).toFixed(2)}×`)} all the AI hardware on Earth in 2025.</p>
    <p>It orbits at ${n(`${f.s.rSail.toFixed(3)} AU`)}, inside Earth's orbit, where sunlight is ${n(`${Math.round(f.s.sail.S)} W/m²`)}. That is as close as the chips allow: the film settles at ${n(kelvin(f.s.sail.T), 'ir')} and the chiplets run ${n(`${p.filmSpreadDT} K`)} hotter, right at their ${n(`${p.tjFilmC} °C`)} limit. Every flat surface faces the Sun all the time, steered by four mirror vanes at the tips.</p>`;
  $('sail-title').textContent = `A ${f.MW.toFixed(0)} MW computer, ${Math.round(f.diag)} metres across and thinner than paper`;
}

function renderComputer() {
  const p = state.params;
  const f = sailFacts(p);
  const absorbed = p.alpha * f.s.sail.S;
  $('computer-prose').innerHTML = `
    <p>The chips are spread through the film because a thin sheet cannot carry heat sideways. The mass of metal needed to spread a chip's heat grows with the square of its power: ${n('0.09 g/W')} at 0.1 W per chip, ${n('9.4 g/W')} at 10 W. At ${n(`${p.chipPower} W`)} each, the film itself is the radiator. Its two faces shed all the sunlight it absorbs, about ${n(`${Math.round(absorbed)} W/m²`, 'ir')}; ${n(`${Math.round(f.s.sail.chipWm2)} W/m²`)} of that passes through the chips on the way.</p>
    <p>Optical fibre lanes laid in the film make each sail one tightly coupled machine: a bit crosses the whole sail in about a microsecond. Neighbouring sails are hundreds of kilometres apart, a millisecond away by light, so the sail is the unit that works in lockstep. A sail of this era can serve roughly ten million AI agents at once, or train a model with about 10¹³ active parameters in a year.</p>`;
}

function renderWhy() {
  const p = state.params;
  const s = h.swarmAt(p, 0.01);
  const ratio = s.sail.flopsPerKg / s.pod.flopsPerKg;
  $('why-prose').innerHTML = `
    <p>Putting all of a satellite's chips in one module sounds natural, since synchronous work wants short wires. Then the heat has to travel: pumped loops carry it metres to radiator blades held edge-on to the Sun, and every pipe must be armoured against meteoroids. That transport costs more mass than the chips save. Per kilogram of Mercury, spread-out sails deliver ${n(`${ratio.toFixed(1)}×`, 'sun')} the computing of the best concentrated module.</p>
    <p>Concentrated pods still have a job: memory that cannot survive radiation unshielded, very large dies, archives, and agent sandboxes the film cannot host. Here they carry ${n(pct(s.q, 1))} of chip power. If every chiplet can run a sandbox, that falls toward 1%. If none can, it rises to 15%, and the swarm gets about a quarter heavier.</p>`;
  const rows = [
    ['Mass per watt of chips', `${(s.sail.kgPerW * 1e3).toFixed(2)} g/W`, `${(s.pod.kgPerW * 1e3).toFixed(2)} g/W`],
    ['Computing per kg', `${sci(s.sail.flopsPerKg, 2)} FLOP/s`, `${sci(s.pod.flopsPerKg, 2)} FLOP/s`],
    ['Where the heat goes', 'radiated where it is made, both faces', 'pumped to radiators at 80 °C'],
    ['One failure takes out', `one ${p.chipPower} W chiplet`, '0.5–1 MW (a loop or the module)'],
    ['Share of chip power', pct(1 - s.q, 1), pct(s.q, 1)],
  ];
  $('why-table').innerHTML = `<thead><tr><th></th><th>Compute sail</th><th>Concentrated pod</th></tr></thead><tbody>${rows.map(([k, a, b], i) => `<tr class="win"><td class="k">${k}</td><td class="v ${i < 2 ? 'best' : ''}">${a}</td><td class="v">${b}</td></tr>`).join('')}</tbody>`;
}

function renderMercury() {
  const p = state.params, d = state.d, g = d.growth;
  const capYr = g.capToSails * YEAR;
  const rockOut = g.tRockOut != null ? p.seedYear + g.tRockOut : null;
  const now = h.atYear(p, d, state.t);
  $('mercury-prose').innerHTML = `
    <p>Mercury is mostly iron. Its rocky crust and mantle, the part worth mining, are only ${n(pct(MERCURY.M_SHELL / MERCURY.M, 0))} of its mass. Factories reduce the rock to silicon, magnesium, aluminium and glass; about ${n(pct(p.yieldDelivered, 0))} of each kilogram ends up in spacecraft, and the oxygen becomes ion-thruster propellant. A mass driver fires each folded sail off the surface at ${n(`${(d.logistics.sail.vLaunch / 1e3).toFixed(1)} km/s`)}.</p>
    <p>Industry copies itself every ${n(`${g.doublingYearsEff.toFixed(2)} years`)}, slowed by the mass of chip fabs it has to build. In ${n(yr(p.seedYear + g.tCap), 'sun')} it hits the <b>heat wall</b>: Mercury's night side cannot radiate away the waste heat of mining any faster, and export stops growing at ${n(`${sci(capYr, 2)} kg a year`)}. By ${n(p.seedYear + Math.round(state.t))}, ${n(pct(now.mercuryRemoved, 2))} of the planet is gone${rockOut ? `; its rock runs out around ${n(Math.round(rockOut))}` : ''}.</p>`;
}

function readoutHTML(a, d) {
  const items = [
    ['Year', `${Math.round(a.calendarYear)}`, 'sun'],
    ['Sunlight captured', pct(a.f, 2)],
    ['Computing', `${sci(a.flops, 2)} FLOP/s`, 'sun'],
    ['Sails flying', sci(a.nSails, 2)],
    ['Mercury removed', pct(a.mercuryRemoved, 2)],
    ['Output replacing old sails', pct(a.replacementShare, 0)],
    ['Extra heat on Earth', `+${sci(a.earth.forcing, 2)} W/m²`, a.earth.forcing > state.params.forcingLimit ? 'warn' : ''],
    ['Night sky after dusk', `${sci(h.FIXED.skyLuxPerFRho * state.params.rhoVis * a.f, 2)} lux`, a.f > state.earth.sky ? 'warn' : ''],
  ];
  return items.map(([k, v, c]) => `<div><span>${k}</span><b class="${c || ''}">${v}</b></div>`).join('');
}

function renderBuild() {
  const p = state.params, d = state.d, g = d.growth;
  const y1 = d.yearsToCoverage(0.01), y10 = d.yearsToCoverage(0.1);
  const ceil = d.reachableCoverage;
  const ceilFlops = h.swarmAt(p, ceil).flops;
  $('build-prose').innerHTML = `
    <p>Nothing is visible for decades. Exponential growth takes the swarm to ${n('1%')} of the Sun's light by ${n(yr(p.seedYear + y1), 'sun')}${Number.isFinite(y10) ? ` and ${n('10%')} by ${n(yr(p.seedYear + y10), 'sun')}` : `, and it never reaches ${n('10%')}`}. Then it levels off at ${n(pct(ceil, 1), 'sun')} of the Sun (${n(`${sci(ceilFlops, 2)} FLOP/s`)}). The ceiling is set by maintenance, not by Mercury: sails wear out after ${n(`${p.serviceLife} years`)}, ${n(pct(p.recycleFrac, 0))} of each is recycled in orbit, and new export only replaces the rest.</p>`;
  const s = state.t;
  const a = h.atYear(p, d, s);
  const markers = [
    { t: g.tCap, f: fForMass(state.table, g.builtAtYear(g.tCap)), label: `heat wall ${yr(p.seedYear + g.tCap)}` },
    { t: y1, f: 0.01, label: `1% ${yr(p.seedYear + y1)}` },
    { t: y10, f: 0.1, label: `10% ${yr(p.seedYear + y10)}` },
    { t: g.tPeak, f: ceil, label: `ceiling ${pct(ceil, 1)}` },
  ];
  if (g.tRockOut != null) markers.push({ t: g.tRockOut, f: fForMass(state.table, g.builtAtYear(g.tRockOut)), label: 'rock gone', color: 'var(--warn)' });
  const curves = [];
  const colors = { '2026': 'var(--muted)', low: 'var(--muted)', mid: 'var(--muted)', high: 'var(--muted)' };
  for (const era of ['2026', 'low', 'mid', 'high']) if (era !== state.era) curves.push({ pts: state.curves[era], color: colors[era], width: 1.2, opacity: 0.45, dash: era === '2026' ? '3 4' : null });
  curves.push({ pts: state.curve, color: 'var(--sun)', width: 2.6 });
  buildChart($('build-chart'), {
    curves, markers, xOf, seedYear: p.seedYear, span: SPAN,
    hlines: [{ f: state.earth.cap, label: `Earth's limit ${pct(state.earth.cap, 2)} (${state.earth.binding})`, color: 'var(--ok)' }],
    cursor: { t: s, f: a.f },
  });
  $('build-legend').innerHTML = `<span><i style="background:var(--sun)"></i>${h.ERAS[state.era] ? h.ERAS[state.era].label : 'Your assumptions'}</span><span><i style="background:var(--muted)"></i>other hardware presets</span><span><i style="background:var(--ok)"></i>what Earth allows: night sky no brighter than full moon, heat under ${state.params.forcingLimit} W/m²</span>`;
  $('build-readout').innerHTML = readoutHTML(a, d);
  $('year').value = String(Math.round(xOf(s) * 1000));
}

function renderEarth() {
  const p = state.params, d = state.d;
  const pts = state.table.map(r => [r.f, r.forcing]);
  const runaway = EARTH.runawayAbsorbedLimit - EARTH.absorbedSolar;
  const ceil = d.reachableCoverage;
  const fc = forcingAt(p, ceil);
  const E = state.earth;
  const yCap = d.yearsToCoverage(E.cap);
  const far = h.earthLimits({ ...p, earthPlacement: 'farside' });
  earthChart($('earth-chart'), { pts, safeF: E.shell, ceilingF: ceil, runaway, co2: EARTH.co2DoublingForcing });
  $('earth-legend').innerHTML = `<span><i style="background:var(--cool)"></i>extra energy absorbed by Earth, W/m², sails spread evenly inside Earth's orbit (their infrared minus the sunlight they block)</span>`;
  orbitMap($('orbit-map'), {
    density: Math.min(1, far.farside / 0.08),
    shellLabel: `allowed now: sails inside Earth’s orbit, ${pct(E.cap, 2)}`,
    cloudLabel: `option: on Earth’s orbit, ${pct(far.farside, 1)}`,
  });
  $('earth-prose').innerHTML = `
    <p>Industry could take this swarm to ${n(pct(ceil, 1))} of the Sun's light. Earth cannot live with that. Every watt the sails intercept leaves them as infrared, and Earth absorbs its share. Spread evenly inside Earth's orbit, they add about ${n(`${forcingAt(p, 0.01).toFixed(1)} W/m²`, 'warn')} of heat for every 1% of sunlight captured, after subtracting the sunlight they block. At the ceiling that is ${n(`${fc.toFixed(0)} W/m²`, 'warn')}${fc > runaway ? `, past the ${n(`${Math.round(runaway)} W/m²`)} that tips Earth into a runaway greenhouse` : `, ${(fc / EARTH.co2DoublingForcing).toFixed(0)} times the effect of doubling CO₂`}.</p>
    <p>The night sky gives out first. Sails on the far side of the Sun show Earth their sunlit faces through the gaps, so after dusk a glow rises along the ecliptic where the Sun went down. With ${n(pct(p.rhoVis, 1))} of light reflected by film and hardware together, the ground is lit as brightly as by a full Moon once the swarm captures ${n(pct(E.sky, 2), 'sun')}. Keeping Earth's extra heat under ${n(`${p.forcingLimit} W/m²`)} gives almost the same limit for sails spread inside Earth's orbit: ${n(pct(E.shell, 2), 'sun')}.</p>
    <p>So the swarm Earth allows is about ${n(pct(E.cap, 2), 'sun')} of the Sun: ${n(`${sci(E.flops, 2)} FLOP/s`, 'sun')}, about ${n(sci(E.flops / WORLD_AI_FLOPS_2025, 1))} times all AI hardware on Earth in 2025, reached around ${n(yr(p.seedYear + yCap))}. Industry could build ${n(`${(h.swarmAt(p, ceil).flops / E.flops).toFixed(0)}×`)} more.</p>`;
  $('earth-prose-2').innerHTML = `
    <p>A better placement exists if a brighter night sky is accepted. Sails can share Earth's own orbit on the far side of the Sun, where they never pass in front of it. There each sail always faces both the Sun and Earth, so a fine aluminium mesh in the front glass can make that face dark in the infrared and push the heat out of the back, away from Earth. A small cloud of sails at the L1 point, 1.6 million km sunward of Earth, can offset what remains. That allows ${n(pct(far.farside, 1), 'sun')} of the Sun at ${n(`${p.forcingLimit} W/m²`)}. It costs about a third of the compute per watt, and a cloud that dense needs collision-free orbit lanes and the capture of every derelict, because lost parts drift toward Earth. The map shows both placements.</p>`;
}

/** Extra energy absorbed by Earth (W/m²) with sails spread evenly on their thermal orbits. */
function forcingAt(p, f) {
  const s = h.swarmAt(p, f);
  return earthImpact(h.filmOptics(p), s.rSail, s.f, s.sail.T, s.sail.S).forcing;
}

function renderStar() {
  const p = state.params;
  const a = h.atYear(p, state.d, state.t);
  sedChart($('sed-chart'), { f: a.f, T: a.tSail });
  $('sed-legend').innerHTML = `<span><i style="background:var(--sun)"></i>sunlight that escapes</span><span><i style="background:var(--swarm)"></i>swarm waste heat</span><span>λL<sub>λ</sub> / L☉, energy per log-wavelength, ${Math.round(a.calendarYear)}</span>`;
  $('star-prose').innerHTML = `
    <p>From another star the Sun would look ${n(pct(a.f, 2))} dimmer in ${n(Math.round(a.calendarYear))}, and a second source would appear in the infrared, peaking near ${n(`${(2.897771955e-3 / a.tSail * 1e6).toFixed(1)} µm`, 'ir')}: the ${n(`${Math.round(a.tSail)} K`)} glow of the sails. The two humps carry equal energy, because every watt the swarm absorbs it re-emits. This is the signature infrared surveys search for.</p>`;
}

function renderFuture() {
  const p26 = h.eraParams('2026');
  const p = state.params;
  const a = h.swarmAt(p26, 0.01), b = h.swarmAt(p, 0.01);
  $('future-prose').innerHTML = `
    <p>Industry needs about half a century to reach the heat wall, and sails are re-skinned every 10 to 20 years, so nearly every sail ever flown carries hardware from after 2095. HBM memory, today's SRAM-heavy chips and 64 small laser terminals per sail are all gone before the first launch. The architecture survives the change: sails still beat pods, chips still run near 85 °C, and silicon stays the only solar cell Mercury can supply in bulk. What changes is how much each kilogram does.</p>`;
  const rows = [
    ['Energy per operation', `${sci(a.sail.jPerFlop, 2)} J`, `${sci(b.sail.jPerFlop, 2)} J`],
    ['Memory per chiplet', '16 MB SRAM', '1–2 GB non-volatile, on the chip'],
    ['Pod memory', 'HBM stacks', 'memory bonded on logic'],
    ['Laser terminals per sail', '64 × 10 cm', '8 × 10 cm + 4 × 30 cm'],
    ['Solar cell (AM0)', pct(p26.pvEta0, 1), pct(p.pvEta0, 1)],
    ['Orbit at 1 % coverage', `${a.rSail.toFixed(3)} AU`, `${b.rSail.toFixed(3)} AU`],
    ['Swarm mass per watt of chips', `${(a.kgPerW * 1e3).toFixed(2)} g/W`, `${(b.kgPerW * 1e3).toFixed(2)} g/W`],
    ['Computing per watt of sunlight', `${sci(a.flops / a.intercepted, 2)} FLOP/J`, `${sci(b.flops / b.intercepted, 2)} FLOP/J`],
  ];
  $('future-table').innerHTML = `<thead><tr><th></th><th>2026 hardware</th><th>${h.ERAS[state.era] && state.era !== '2026' ? h.ERAS[state.era].label : 'Selected'}</th></tr></thead><tbody>${rows.map(([k, x, y]) => `<tr class="win"><td class="k">${k}</td><td class="v">${x}</td><td class="v best">${y}</td></tr>`).join('')}</tbody>`;
}

// ------------------------------------------------------------------------------------- ledger

function row(k, v, { note, cls } = {}) {
  return `<div class="row ${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div>${note ? `<div class="note">${note}</div>` : ''}</div>`;
}
const sec = (title, tag, rows) => `<section><h3>${title}${tag ? `<span>${tag}</span>` : ''}</h3>${rows.join('')}</section>`;

function renderLedger() {
  const p = state.params, d = state.d, g = d.growth;
  const a = h.atYear(p, d, state.t);
  const sf = sailFacts(p);
  const ceil = d.reachableCoverage;
  const sc = h.swarmAt(p, ceil);
  $('ledger-year').textContent = `${Math.round(a.calendarYear)}`;
  const body = $('ledger-body');
  const scroll = body.scrollTop;
  body.innerHTML = [
    sec('Now', `${Math.round(a.calendarYear)}`, [
      row('Sunlight captured', pct(a.f, 3), { cls: 'sun' }),
      row('Computing', `${sci(a.flops, 2)} FLOP/s`, { cls: 'sun', note: `${sci(a.flops / BRAIN_FLOPS, 1)} human-brain equivalents at 10¹⁵ FLOP/s each (the estimate spans 10¹³–10¹⁷).` }),
      row('Sails / pods flying', `${sci(a.nSails, 2)} / ${sci(a.nPods, 2)}`),
      row('Orbit', `${a.rSail.toFixed(3)} AU`),
      row('Export from Mercury', `${sci(a.exportRate * YEAR, 2)} kg/yr`, { note: a.heatLimited ? 'At the heat wall.' : '' }),
      row('Output replacing old sails', pct(a.replacementShare, 0)),
      row('Mercury removed', pct(a.mercuryRemoved, 3)),
      row('Extra heat on Earth', `+${sci(a.earth.forcing, 2)} W/m²`, { cls: a.earth.forcing > 1 ? 'warn' : 'ok' }),
    ]),
    sec('One sail', `${Math.round(sf.side)} m`, [
      row('Chip power', `${sf.MW.toFixed(1)} MW`),
      row('Chiplets', sci(sf.chips, 2)),
      row('Computing', `${sci(sf.flops, 2)} FLOP/s`),
      row('Mass', kg(sf.mass)),
      row('Film / chip temperature', `${Math.round(sf.s.sail.T)} / ${Math.round(sf.s.sail.T + p.filmSpreadDT)} K`),
    ]),
    sec('At the ceiling', pct(ceil, 1), [
      row('Computing', `${sci(sc.flops, 2)} FLOP/s`, { cls: 'sun' }),
      row('Sails', sci(sc.sailPower / sc.sail.chipWm2 / p.sailArea, 2)),
      row('Standing mass', kg(sc.mass)),
      row('Orbit', `${sc.rSail.toFixed(3)} AU`, { note: sc.rSail < 1 ? 'Inside Earth’s orbit.' : 'Outside Earth’s orbit.' }),
      row('Light-time across', `${((2 * sc.rSail * AU) / PHYS.C / 60).toFixed(0)} min`),
    ]),
    sec('Industry', '', [
      row('Doubling time (with fabs)', `${g.doublingYearsEff.toFixed(2)} yr`),
      row('Heat wall', `${yr(p.seedYear + g.tCap)}`),
      row('Export cap', `${sci(g.capToSails * YEAR, 2)} kg/yr`),
      row('Energy to make 1 kg', `${Math.round(p.energyPerKg)} MJ`),
      row('Rock exhausted', g.tRockOut != null ? `${yr(p.seedYear + g.tRockOut)}` : 'not within the timeline'),
    ]),
    sec('What Earth allows', pct(state.earth.cap, 2), [
      row('Coverage', pct(state.earth.cap, 2), { cls: 'ok', note: `Set by the ${state.earth.binding}.` }),
      row('Computing', `${sci(state.earth.flops, 2)} FLOP/s`, { cls: 'ok' }),
      row('Night-sky limit', pct(state.earth.sky, 2), { note: `${p.skyLimitLux} lux on the ground after dusk.` }),
      row('Climate limit, shell inside Earth’s orbit', pct(state.earth.shell, 2)),
      row('Climate limit, far side with L1 shade', pct(h.earthLimits({ ...p, earthPlacement: 'farside' }).farside, 2)),
      row('Heat at the industry’s ceiling', `+${forcingAt(p, ceil).toFixed(1)} W/m²`, { cls: 'warn' }),
    ]),
  ].join('');
  body.scrollTop = scroll;
}

const SOURCES = [
  ['Sail design, film stack, optics and structure', 'docs/data/design_spec.json'],
  ['Why sails beat concentrated modules', 'docs/architecture.md'],
  ['Hardware after 2095: logic, memory, links, solar cells, workloads, fabs', 'docs/future-tech.md'],
  ['MESSENGER albedo and elevation of Mercury', 'USGS Astrogeology / NASA PDS'],
  ['Runaway-greenhouse limit 282 W/m²', 'Goldblatt et al. 2013, Nature Geoscience 6, 661'],
  ['Climate forcing of doubled CO₂ and sensitivity', 'IPCC AR6 WG1, chapter 7'],
  ['Limits to the energy efficiency of CMOS', 'Ho, Erdil & Besiroglu 2023, arXiv:2312.08595'],
  ['Attojoule optoelectronics', 'Miller 2017, J. Lightwave Technology 35(3)'],
  ['Space-based AI infrastructure (Suncatcher)', 'Google 2025, arXiv:2511.19468'],
  ['Brain-equivalent computing estimate', 'Carlsmith 2020, Open Philanthropy'],
];

function renderAll() {
  renderSail(); renderComputer(); renderWhy(); renderMercury(); renderBuild(); renderEarth(); renderStar(); renderFuture(); renderLedger();
  for (const b of document.querySelectorAll('.eras button')) b.setAttribute('aria-pressed', String(b.dataset.era === state.era));
}

function renderYear() {
  renderBuild(); renderStar(); renderLedger(); renderMercury();
}

// ------------------------------------------------------------------------------------- wiring

let paramsUI;
function setEra(era) {
  state.era = era;
  state.params = { ...h.eraParams(era) };
  paramsUI?.rebind(state.params);
  recompute();
}

function init() {
  $('sources-list').innerHTML = SOURCES.map(([what, where]) => `<li>${what}: <span class="n">${where}</span></li>`).join('');
  paramsUI = renderParams($('params'), h.PARAMS, state.params, () => { state.era = 'custom'; recompute(); });
  for (const b of document.querySelectorAll('.eras button')) b.addEventListener('click', () => setEra(b.dataset.era));
  $('year').addEventListener('input', e => { state.t = tOf(Number(e.target.value) / 1000); renderYear(); });
  const chart = $('build-chart');
  const scrubTo = e => {
    const svg = chart.querySelector('svg');
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * 900;
    const u = Math.max(0, Math.min(1, (vx - 54) / (900 - 54 - 16)));
    state.t = tOf(u);
    renderYear();
  };
  chart.addEventListener('pointerdown', e => { chart.setPointerCapture(e.pointerId); scrubTo(e); });
  chart.addEventListener('pointermove', e => { if (e.buttons) scrubTo(e); });
  $('play').addEventListener('click', () => {
    state.playing = !state.playing;
    $('play').textContent = state.playing ? '❚❚' : '▶';
    let u = xOf(state.t);
    if (u >= 0.999) u = 0;
    const step = () => {
      if (!state.playing) return;
      u = Math.min(1, u + 0.0025);
      state.t = tOf(u);
      renderYear();
      if (u >= 1) { state.playing = false; $('play').textContent = '▶'; return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  $('open-assumptions').addEventListener('click', () => $('drawer').classList.add('open'));
  $('close-assumptions').addEventListener('click', () => $('drawer').classList.remove('open'));
  $('reset-params').addEventListener('click', () => setEra(state.era === 'custom' ? 'mid' : state.era));
  $('ledger-toggle').addEventListener('click', () => $('ledger').classList.toggle('open'));
  recompute();
  window.__ledger = { state, recompute, setEra, setYear: t => { state.t = t; renderYear(); } };
}

init();

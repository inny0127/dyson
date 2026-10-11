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
/** A large number in words, to two figures: 3.1e16 -> '31 million billion'. */
function words(x) {
  const names = [[1e18, 'billion billion'], [1e15, 'million billion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
  const two = v => (v >= 10 ? String(Math.round(Number(v.toPrecision(2)))) : v.toFixed(1).replace(/\.0$/, ''));
  for (const [v, w] of names) if (x >= v) return `${two(x / v)} ${w}`;
  return two(x);
}

const WORLD_AI_FLOPS_2025 = 3.2e22;
const MERCURY_BINDING_J = 1.8e30;       // gravitational binding energy, 3GM²/5R     // FLOP/s of AI accelerators on Earth, 2025 (workloads study)
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
  const q = { ...p, earthPlacement: 'shell' };
  const s = h.swarmAt(q, f);
  return earthImpact(h.filmOptics(q), s.rSail, s.f, s.sail.T, s.sail.S).forcing;
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
  // with infrared-dark fronts the same sail flies farther out than its thermal orbit (0.95 AU, or
  // 1 AU on the far side): less sunlight per m², hotter chips (FIXED.farsideFlopFactor)
  const dark = s.farside || s.uniform;
  const kS = dark ? (s.rSail / s.rOrbit) ** 2 : 1;
  const W = s.sail.chipWm2 * p.sailArea * kS;
  const flops = (W / s.sail.jPerFlop) * (dark ? h.FIXED.farsideFlopFactor : 1);
  return { s, side, diag: side * Math.SQRT2, MW: W / 1e6, chips: W / p.chipPower, flops, mass: p.sailArea * h.filmAreal(p),
    farside: s.farside, uniform: s.uniform, dark, S: s.sail.S * kS, pitch: s.sail.chipPitch / Math.sqrt(kS) };
}

function recompute() {
  const p = state.params;
  state.d = h.compute(p);
  state.earth = h.earthLimits(p, state.d);
  state.table = coverageTable(p);
  const g = state.d.growth;
  const when = f => { const t = state.d.yearsToCoverage(f); return Number.isFinite(t) ? t : g.tPeak; };
  state.moments = {
    first: 5,                                           // the first sails
    wall: g.tCap,                                       // Mercury's heat wall
    one: state.d.yearsToCoverage(0.01),                 // 1 % of the Sun's light
    cap: when(state.earth.cap * 0.995),                 // the finished swarm
  };
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

/** What stops the swarm growing, as a label. */
const LIMIT = { rock: "Mercury's rock", room: 'No room left', climate: "Earth's limit" };

function renderFigures() {
  const p = state.params, E = state.earth;
  const f = sailFacts(p);
  const tCap = state.moments.cap;
  const now = new Date().getFullYear();
  const cut = E.forcing.sunlightCut;
  const items = [
    [`${sci(E.flops, 2)} FLOP/s`, `calculations a second when it is finished, catching ${pct(E.cap, 0)} of the Sun's light`],
    Number.isFinite(tCap)
      ? [`${yr(p.seedYear + tCap)}`, `when it is finished, ${Math.max(0, Math.round(p.seedYear + tCap - now))} years from now`]
      : ['never', 'industry never finishes it'],
    [`${f.MW.toFixed(0)} MW`, `in one sail ${Math.round(f.diag)} m across`],
    cut > 0.0005
      ? [`−${pct(cut, cut < 0.1 ? 1 : 0)}`, "of Earth's sunlight, shaded away so the swarm's heat leaves Earth's temperature where it is"]
      : [`+${E.forcing.net.toFixed(1)} W/m²`, 'of extra heat on Earth, with no sunshade'],
  ];
  $('figures').innerHTML = items.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
}

// --------------------------------------------------------------------------------- the dashboard

/** Radiator temperature at which Mercury's paved surface sheds Q watts (see renderMercury). */
function radiatorTempFor(Q) {
  const bare = 0.9 * PHYS.SIGMA * 500 ** 4 * 4 * Math.PI * MERCURY.R ** 2;   // what bare 500 K ground sheds
  return Q > bare ? radiatorTemp(Q) : 0;
}

function stageOf(a) {
  const p = state.params, g = state.d.growth, E = state.earth;
  if (a.year < 0.5 || a.nSails < 1) return 'Before the first launch';
  if (a.f < 1e-7) return 'A few sails: invisible from Earth';
  if (a.year < g.tCap) return `Industry doubling every ${g.doublingYearsEff.toFixed(1)} years`;
  if (a.f < E.cap * 0.98) return "Mercury's heat wall: steady growth";
  if (g.tRockOut != null && a.year > g.tRockOut + 5) return 'The rock is gone: the fleet slowly wears down';
  if (a.f < E.cap * 1.05) return E.binding === 'rock' ? 'Finished: the rock runs out' : E.binding === 'room' ? 'Finished: no room left' : "Earth's limit";
  return p.coverage < 1 ? 'Holding at the target' : "Past Earth's limit";
}

function renderDash(a) {
  const p = state.params, E = state.earth, g = state.d.growth;
  $('dash-year').textContent = String(Math.round(a.calendarYear));
  $('dash-what').textContent = stageOf(a);
  // share of sunlight against time, log scale, with Earth's limit and the cursor
  const W = 300, H = 112, L = 4, R = 4, T = 8, B = 16;
  const tMax = Math.max(250, (state.moments.cap || 0) + 40);
  const X = t => L + (Math.min(t, tMax) / tMax) * (W - L - R);
  const Y = f => T + (1 - (Math.log10(Math.max(f, 1e-8)) + 8) / 8) * (H - T - B);
  const pts = state.curve.filter(([t]) => t <= tMax);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Share of the Sun's light captured over time">`;
  svg += `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--rule)"/>`;
  for (const e of [-6, -4, -2, 0]) svg += `<line x1="${L}" x2="${W - R}" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}" stroke="var(--rule)" stroke-dasharray="1 3"/>`;
  svg += `<text x="${L}" y="${Y(1) - 2}" fill="var(--ink-3)" font-size="9">100% of the Sun</text><text x="${L}" y="${Y(1e-6) - 2}" fill="var(--ink-3)" font-size="9">0.0001%</text>`;
  svg += `<line x1="${L}" x2="${W - R}" y1="${Y(E.cap)}" y2="${Y(E.cap)}" stroke="var(--earth)" stroke-dasharray="4 3"/>`;
  svg += `<text x="${W - R}" y="${Y(E.cap) + 10}" text-anchor="end" fill="var(--earth)" font-size="9">${LIMIT[E.binding]}: ${pct(E.cap, 0)}</text>`;
  svg += `<path d="${pts.map(([t, f], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(f).toFixed(1)}`).join('')}" fill="none" stroke="var(--ink)" stroke-width="1.6"/>`;
  if (Number.isFinite(g.tCap) && g.tCap < tMax) svg += `<line x1="${X(g.tCap)}" x2="${X(g.tCap)}" y1="${H - B - 4}" y2="${H - B + 3}" stroke="var(--heat)" stroke-width="1.5"/><text x="${X(g.tCap)}" y="${H - 3}" text-anchor="middle" fill="var(--heat)" font-size="9">heat wall</text>`;
  svg += `<text x="${L}" y="${H - 3}" fill="var(--ink-3)" font-size="9">${p.seedYear}</text><text x="${W - R}" y="${H - 3}" text-anchor="end" fill="var(--ink-3)" font-size="9">${p.seedYear + Math.round(tMax)}</text>`;
  svg += `<line x1="${X(a.year)}" x2="${X(a.year)}" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-width="0.75" opacity="0.5"/><circle cx="${X(a.year)}" cy="${Y(Math.max(a.f, 1e-8))}" r="3.2" fill="var(--sun-mark)" stroke="var(--ink)" stroke-width="0.75"/>`;
  $('dash-chart').innerHTML = svg + '</svg>';
  // the sails, as squares
  const sCap = h.swarmAt(p, E.cap);
  const nCap = sCap.filmArea / p.sailArea;
  const unit = 10 ** Math.floor(Math.log10(Math.max(nCap, 1) / 100));
  const n = a.nSails / unit;
  const full = Math.min(400, Math.floor(n));
  $('dash-sails-label').innerHTML = a.nSails >= 1
    ? `<b>${sci(a.nSails, 1)}</b> sails &nbsp;■ = ${sci(unit, 1)}`
    : `<b>0</b> sails &nbsp;■ = ${sci(unit, 1)}`;
  $('dash-grid').innerHTML = '<i></i>'.repeat(full) + (n - full > 0.05 && full < 400 ? '<i class="part"></i>' : '');
  // the numbers
  const fc = a.forcing;
  const lux = h.skyLux(p, a.f);
  const Trad = radiatorTempFor(a.heatOnMercury);
  const glow = Trad >= 1400 ? 'glowing orange' : Trad >= 1000 ? 'glowing dull red' : Trad >= 750 ? 'barely glowing' : 'dark to the eye';
  const vsAI = a.flops / WORLD_AI_FLOPS_2025;
  const items = [
    ['Sunlight captured', pct(a.f, a.f < 0.01 ? 3 : 1), ''],
    ['Computing', `${sci(a.flops, 1)} FLOP/s`, vsAI >= 1 ? `${words(vsAI)} × all AI chips of 2025` : `${pct(vsAI, 0)} of all AI chips of 2025`],
    ['Sunlight on Earth', fc.sunlightCut > 0.0005 ? `−${pct(fc.sunlightCut, 1)}` : 'unchanged',
      fc.net > p.forcingLimit + 1e-3 ? `+${fc.net.toFixed(2)} W/m² of heat left over` : fc.shade > 0 ? 'shaded to cancel the swarm’s heat' : '', fc.net > p.forcingLimit + 1e-3],
    ['Rainfall', fc.rainCut > 0.0005 ? `−${pct(fc.rainCut, 1)}` : 'unchanged', ''],
    ['Mercury dug out', pct(a.mercuryRemoved, a.mercuryRemoved < 0.01 ? 3 : 1), ''],
    ["Mercury's radiators", Trad > 0 ? `${(Math.round(Trad / 10) * 10).toLocaleString('en-US')} K` : 'not needed', Trad > 0 ? glow : 'bare ground copes'],
    ['Night sky, worst case', `${lux < 0.001 ? '<0.001' : lux.toFixed(lux < 0.1 ? 3 : 2)} lux`, 'full Moon 0.25'],
  ];
  $('dash-metrics').innerHTML = items.map(([k, v, sm, over]) => `<div class="${over ? 'over' : ''}"><dt>${k}</dt><dd>${v}${sm ? `<small>${sm}</small>` : ''}</dd></div>`).join('');
}

/** The year each chapter's kicker shows. */
function renderWhen() {
  const p = state.params;
  for (const el of document.querySelectorAll('.when')) {
    const t = state.moments[el.dataset.moment];
    el.textContent = Number.isFinite(t) ? String(Math.round(p.seedYear + t)) : 'Never';
  }
}

// scrolling moves the dashboard to each chapter's moment
let tween = 0;
function goTo(t) {
  if (!Number.isFinite(t)) return;
  const id = ++tween, t0 = state.t, t1 = t, start = performance.now(), dur = 700;
  const step = now => {
    if (id !== tween) return;
    const u = Math.min(1, (now - start) / dur);
    state.t = t0 + (t1 - t0) * (1 - (1 - u) ** 3);
    const a = h.atYear(state.params, state.d, state.t);
    renderDash(a);
    updateYear(a);
    if (u < 1) requestAnimationFrame(step); else renderYear();
  };
  requestAnimationFrame(step);
}
function watchChapters() {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) goTo(state.moments[e.target.dataset.moment]);
  }, { rootMargin: '-35% 0px -60% 0px' });
  for (const el of document.querySelectorAll('section[data-moment]')) io.observe(el);
}

// --------------------------------------------------------------------------------- explainers

const EXPLAIN = {
  what: `<p>A worked-out design for a Dyson swarm: a cloud of separate satellites around the Sun that catches part of its light and uses it to compute. It covers the satellites themselves, the factories on Mercury that make them, how fast they can be built, and what the swarm does to Earth.</p><p>Every number, chart and photograph on the page comes from one physics model. The photographs are not illustrations; they are rendered from the model's numbers, with every light in them at its true brightness.</p>`,
  how: `<p>Eight research studies came first: computer chips and memory after 2095, the solar cells Mercury's rock can make, the satellite's structure and optics, manufacturing and recycling, what the swarm does to Earth's climate and night sky, and an adversarial review of the results. A ninth asked what really stops the swarm from filling the sky round the Sun. Their numbers are in the project repository.</p><p>They feed a model that runs in your browser and builds the swarm year by year: industry doubles until Mercury can't shed the heat any faster, sails wear out and are recycled, and the swarm stops when Mercury's rock runs out. The pictures come from Blender scenes and our own renderer, fed the same numbers.</p>`,
  unsure: `<p>A lot. The hardware is seventy years beyond today's, and the swarm assumes a film half as heavy as the detailed design and launchers that waste only 1% of their energy. How Mercury gets rid of its heat is the least certain part of the build-out. On Earth, the rain lost to the sunshade is extrapolated far beyond anything climate models have run, and so is the idea of shaping climate region by region.</p><p>The buttons below switch between pessimistic and optimistic hardware, and every assumption can be changed at the bottom of the page. That energy is never the limit holds across all of them.</p>`,
  change: `<p>Yes. The hardware buttons below switch eras. Near the end you can choose between four swarms, and at the very bottom every assumption has a slider. The text, the charts and the dashboard all recompute; only the photographs stay fixed, at the finished swarm.</p><p>As you scroll, the dashboard ${matchMedia('(min-width: 1200px)').matches ? 'on the right' : 'at the top'} follows the story year by year.</p>`,
};
function wireExplainers() {
  const panel = $('explain-panel');
  for (const b of document.querySelectorAll('.explain button')) {
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', () => {
      const open = b.getAttribute('aria-expanded') === 'true';
      for (const o of document.querySelectorAll('.explain button')) o.setAttribute('aria-expanded', 'false');
      if (open) { panel.hidden = true; return; }
      b.setAttribute('aria-expanded', 'true');
      panel.innerHTML = EXPLAIN[b.dataset.explain];
      panel.hidden = false;
    });
  }
}

// --------------------------------------------------------------------------------- choose your swarm

const SWARMS = [
  { key: 'full', title: 'Everything Mercury can build', blurb: "All round the Sun, every sail's front dark in the infrared, empty only round the line to Earth. A shade at L1 keeps Earth's temperature.",
    params: { earthPlacement: 'uniform', forcingLimit: 0, shadeLimit: 300 } },
  { key: 'far', title: 'Only beyond the Sun', blurb: "The same sails, but only on the far side of Earth's orbit, farthest from Earth. The shade again keeps Earth's temperature.",
    params: { earthPlacement: 'farside', spillInside: 'stop', farsideLat: 60, forcingLimit: 0, shadeLimit: 300 } },
  { key: 'gentle', title: 'Barely there', blurb: 'The far side, kept small: Earth takes 1 W/m² of extra heat and the shade cancels half a watt more. Sunlight and rain hardly change.',
    params: { earthPlacement: 'farside', spillInside: 'stop', farsideLat: 30, forcingLimit: 1, shadeLimit: 0.5 } },
  { key: 'slit', title: 'Even, with plain glass', blurb: "The same gap round the line to Earth, but ordinary glass fronts that glow toward Earth. Each sail computes more, but with the same fifth of Earth's sunlight shaded away the swarm must stay far smaller.",
    params: { earthPlacement: 'cone', forcingLimit: 0, shadeLimit: 47 } },
];
function renderChoose() {
  const p = state.params;
  const rows = SWARMS.map(sw => {
    const q = { ...p, ...sw.params };
    const d = h.compute({ ...q, coverage: 1 });
    const E = h.earthLimits(q, d);
    const y = d.yearsToCoverage(E.cap * 0.995);
    return { sw, E, y: Number.isFinite(y) ? y : d.growth.tPeak, fc: E.forcing, rock: (E.mass * d.minedPerDelivered) / MERCURY.M_SHELL, q };
  });
  const active = SWARMS.find(sw => Object.entries(sw.params).every(([k, v]) => p[k] === v));
  $('choices').innerHTML = rows.map(({ sw, E }) => `<button data-swarm="${sw.key}" aria-pressed="${active && active.key === sw.key}"><b>${sw.title}</b><span>${sw.blurb}</span><span><b style="font:500 1rem/1 var(--sans)">${pct(E.cap, E.cap < 0.1 ? 1 : 0)}</b> of the Sun's light</span></button>`).join('');
  for (const b of $('choices').querySelectorAll('button')) b.addEventListener('click', () => {
    const sw = SWARMS.find(x => x.key === b.dataset.swarm);
    state.params = { ...state.params, ...sw.params };
    state.era = 'custom';
    paramsUI.rebind(state.params);
    recompute();
  });
  const minus = x => (x > 0.0005 ? `−${pct(x, x < 0.1 ? 1 : 0)}` : 'unchanged');
  const line = (k, f) => `<tr><td>${k}</td>${rows.map(r => `<td class="v">${f(r)}</td>`).join('')}</tr>`;
  $('choose-table').innerHTML = `<thead><tr><th></th>${rows.map(r => `<th>${r.sw.title}</th>`).join('')}</tr></thead><tbody>
    ${line("Share of the Sun's light", r => pct(r.E.cap, r.E.cap < 0.1 ? 1 : 0))}
    ${line('What stops it', r => LIMIT[r.E.binding])}
    ${line('Computing', r => `${sci(r.E.flops, 1)} FLOP/s`)}
    ${line('Finished around', r => yr(p.seedYear + r.y))}
    ${line("The swarm's heat on Earth", r => `${r.fc.gross.toFixed(1)} W/m²`)}
    ${line('Sunlight on Earth', r => minus(r.fc.sunlightCut))}
    ${line("World's rainfall", r => minus(r.fc.rainCut))}
    ${line('Extra heat at the poles', r => (r.fc.polar > 0.05 ? `+${r.fc.polar.toFixed(1)} W/m²` : '—'))}
    ${line('Night sky, worst case', r => `${r.E.skyLuxAtCap < 10 ? r.E.skyLuxAtCap.toFixed(1) : Math.round(r.E.skyLuxAtCap)} lux`)}
    ${line("Mercury's rock used", r => (r.E.binding === 'rock' ? 'all of it' : pct(Math.min(1, r.rock), 0)))}
  </tbody>`;
}

function renderSummary() {
  const p = state.params, d = state.d, E = state.earth;
  const f = sailFacts(p);
  const s = h.swarmAt(p, E.cap);
  const nSails = s.filmArea / p.sailArea;
  const yCap = state.moments.cap;
  const rock = Math.min(1, (E.mass * d.minedPerDelivered) / MERCURY.M_SHELL);
  const fc = E.forcing;
  const co2 = fc.gross / EARTH.co2DoublingForcing;
  const where = {
    uniform: `All round the Sun at ${num('0.95 AU')}, just inside Earth's orbit. Every sail's front is dark in the infrared, so the side Earth sees hardly glows. No sail flies within ${num('23°')} of the line from the Sun to Earth, where it would show Earth its hot back or cast a shadow.`,
    farside: `On Earth's own orbit, on the far side of the Sun, the part of the orbit farthest from Earth. Every sail's front is dark in the infrared.`,
    cone: `Spread evenly just inside Earth's orbit, empty round the line from the Sun to Earth, with ordinary glass fronts.`,
    shell: `Spread evenly just inside Earth's orbit, Earth's direction included, with ordinary glass fronts.`,
  }[p.earthPlacement];
  const stops = E.binding === 'rock'
    ? `It stops where Mercury's rock runs out${E.room < 1 ? `, just short of the ${num(pct(E.room, 0))} its layout has room for` : ''}. Energy is never short: the swarm could take the whole planet apart with ${num(`${Math.max(1, Math.round(MERCURY_BINDING_J / (E.cap * PHYS.L_SUN) / 3600))} hours`)} of its output.`
    : E.binding === 'room' ? `It stops when its layout is full.` : `It stops at the heat Earth is allowed to take.`;
  const items = [
    ['What it is', `About ${num(words(nSails))} separate satellites. Each is a square of solar film ${num(`${Math.round(f.side)} m`)} on a side, thinner than paper, with ${num(words(f.chips))} tiny computer chips spread over its back. There is no shell or ring: every sail flies its own orbit around the Sun.`],
    ['How big it gets', `${num(pct(E.cap, 0))} of all the light the Sun gives off. ${stops}`],
    ['What it is made of', `Rock from Mercury, dug up, thrown into orbit and turned into film and chips there. This swarm uses ${E.binding === 'rock' ? num('all') : num(pct(rock, 0))} of Mercury's rock. The planet's iron core is left: the swarm needs silicon, and the core has little.`],
    ['Where it flies', where],
    ['What it does to Earth', fc.shade > 0
      ? `Its heat would warm Earth like ${num(co2 >= 1.5 ? `${Math.round(co2)} doublings` : 'a doubling')} of CO₂. A sunshade between Earth and the Sun cancels it by taking ${num(pct(fc.sunlightCut, 0))} of Earth's sunlight, so Earth keeps its temperature. The price is about ${num(pct(fc.rainCut, 0))} less rain worldwide and warmer poles, unless the shade is shaped.`
      : `It adds ${num(`${fc.net.toFixed(1)} W/m²`)} of heat to Earth${fc.net > 0 ? `, ${pct(fc.net / EARTH.co2DoublingForcing, 0)} of a CO₂ doubling` : ''}.`],
    ['What it computes', `${num(`${sci(E.flops, 1)} calculations a second`)}, about ${num(words(E.flops / WORLD_AI_FLOPS_2025))} times all the AI chips on Earth in 2025. If building starts in ${num(p.seedYear)}, it is finished around ${num(yr(p.seedYear + yCap))}.`],
    ['What you would see', p.earthPlacement === 'uniform'
      ? `From Earth, a disc of light ${num('140°')} across round the Sun, as bright as the sky just after sunset, with a dark hole round the Sun itself. Most nights never get fully dark. From inside, an even glow in every direction, broken by two black windows. From another star, a Sun ${num(pct(E.cap, 0))} dimmer, outshone in the infrared by the swarm.`
      : `From Earth, a band or disc of light round the Sun after dusk. From another star, a Sun ${num(pct(E.cap, E.cap < 0.1 ? 1 : 0))} dimmer, with an infrared glow it never had before.`],
  ];
  $('summary-list').innerHTML = items.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

/** Why the near-uniform swarm flies at 0.95 AU: the same rock at other radii (h.orbitChoice). */
function orbitBox(p) {
  const rows = h.orbitChoice(p, state.earth);
  const r0 = h.FIXED.uniformR;
  const tr = rows.map(r => `<tr><td>${r.r === r0 ? '<b>' : ''}${r.r.toFixed(2)} AU${r.r === r0 ? '</b>' : ''}</td><td class="v">${Math.round(r.chipC)} °C</td><td class="v">${r.perWatt.toFixed(2)}×</td><td class="v">${r.filmPerW.toFixed(2)}×</td><td class="v">${Math.round(r.cone)}°</td><td class="v">${pct(r.f, 0)}${r.roomBound ? ', room full' : ''}</td><td class="v">${sci(r.flops, 2)}</td><td class="v">${Math.round(r.heat)} W/m²</td></tr>`).join('');
  return `<p>A sail with an infrared-dark front could fly anywhere from about 0.9 AU out to Earth's own orbit. Three things change with the distance. Nearer the Sun each square metre catches more sunlight, so the same rock catches more of the Sun. But the film runs hotter, as one over the square root of the distance, and hot chips and hot cells compute less per watt. And the gap round the line to Earth has to be wider, because from nearer the Sun more of the swarm would show Earth its hot back, so there is less room.</p>
    <div class="tablewrap" style="margin:1rem 0"><table class="compare"><thead><tr><th>Orbit</th><th>Chips</th><th>Computing per watt</th><th>Film per watt</th><th>Gap round Earth</th><th>Share of the Sun</th><th>FLOP/s</th><th>Heat on Earth</th></tr></thead><tbody>${tr}</tbody></table></div>
    <p>From 0.95 AU outward the two effects cancel almost exactly: each step out needs more film for every watt and gets it back from cooler chips, so the finished swarm computes the same. Nearer in, the swarm runs out of room before it runs out of rock and computes less. So 0.95 AU is the innermost orbit on that flat top. It catches the most sunlight for the same computing, keeps the nearest sails ${num('0.39 AU')} from Earth rather than 0.24 AU at Earth's own orbit, and holds the chips at about ${num('115 °C')}, under the 125 °C that dense, efficient logic is built for.</p>
    <p class="note">Computing per watt and film per watt are relative to 0.95 AU. The same rock is spread over film whose area per watt grows as the square of the distance; the share of the Sun is that, or the room left by the gap, whichever is smaller.</p>`;
}

function renderSail() {
  const p = state.params;
  const f = sailFacts(p);
  $('sail-title').textContent = 'A sheet, not a box';
  const atLimit = h.swarmAt(p, state.earth.cap);
  const nSails = atLimit.filmArea / p.sailArea;
  const deep = (title, body) => `<details class="deep"><summary>${title}</summary>${body}</details>`;
  $('sail-prose').innerHTML = `
    <p>Each satellite is a square of solar film ${num(`${Math.round(f.side)} m`)} on a side, flown corner-first as a diamond ${num(`${Math.round(f.diag)} m`)} from tip to tip. The film is ${num(`${Math.round(80 * (p.filmThin ?? 1) / 5) * 5} µm`)} thick, ${(p.filmThin ?? 1) < 0.8 ? 'half the thickness of office paper' : 'a little thinner than office paper'}. Shrink the sail to the width of a room and it would be as thin as the wall of a soap bubble. It weighs ${num(kg(f.mass))}, which works only because out there nothing pushes on it except sunlight.</p>
    <p>Behind the solar cells sit ${num(words(f.chips))} tiny chips, one every ${num(length(f.pitch))}. Together they use ${num(`${f.MW.toFixed(1)} MW`)} and do ${num(`${sci(f.flops, 2)} calculations a second`)}, ${f.flops >= WORLD_AI_FLOPS_2025 ? `${num(`${(f.flops / WORLD_AI_FLOPS_2025).toFixed(1)} times`)}` : `${num(pct(f.flops / WORLD_AI_FLOPS_2025, 0))} of`} all the AI hardware on Earth in 2025. That is one sail. The finished swarm has about ${num(words(nSails))} of them.</p>
    ${f.dark
      ? `<p>${f.uniform
          ? `It flies at ${num('0.95 AU')}, just inside Earth's orbit, in one of several hundred nested bands that wrap the Sun without ever crossing. Its cover glass carries a fine aluminium mesh that makes its front dark in the infrared, so it sheds its heat from its back, away from the Sun.`
          : `It flies on Earth's own orbit, but on the far side of the Sun, between a quarter and three quarters of a turn away from Earth. From there a sail never passes between Earth and the Sun, and it can turn its warm back away from Earth.`}</p>
        ${deep(f.uniform ? 'Why every sail gives up 40% of its computing' : 'Why every sail gives up a third of its computing', `<p>From almost anywhere round the Sun, Earth sits on a sail's sunny side, so Earth sees its front. A glass front would glow at Earth in the infrared almost as brightly as the back. So the cover glass carries an aluminium mesh, finer than the wavelength of heat, that is dark in the infrared: the film can barely radiate forward and pushes its heat out of the back instead. With one face doing all the radiating, the film runs hotter, and the chips run at about ${num(f.uniform ? '115 °C' : '106 °C')}. The mesh also blocks a fifth of the light the cells could use, hot transistors need more energy per operation, and hot cells convert less, so each watt of sunlight computes ${f.uniform ? 'about 40%' : 'about a third'} less.</p><p>It is worth it. With glass fronts the swarm would send Earth about four times as much heat for each watt it catches, and the shade would have to take away most of Earth's sunlight.</p>`)}
        ${f.uniform ? deep('How the distance from the Sun was chosen', orbitBox(p)) : ''}`
      : `<p>The sail orbits at ${num(`${f.s.rSail.toFixed(3)} AU`)}, just inside Earth's orbit, in sunlight of ${num(`${Math.round(f.s.sail.S)} W/m²`)}. You might expect a solar computer to crowd in toward the Sun for more power, but the chips decide where it flies: the film settles at ${num(kelvin(f.s.sail.T))}, the chips run at their ${num(`${p.tjFilmC} °C`)} limit, and any closer in they would overheat.</p>`}
    <p>The photograph at the top was taken by a simulated camera a kilometre away. The film reflects about 0.2% of visible light, so it comes out nearly black, which is what a good solar cell should look like: light it reflects is power it didn't collect. The bright line is the Sun's reflection in the cover glass, broken into segments where each 1.6 m fold panel curls slightly beside its hinge.</p>`;
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
    <p>The chips are spread through the film because a thin sheet can't carry heat sideways. Each chip uses only ${num(`${p.chipPower} W`)}, so its heat doesn't have to go anywhere: the film right around it radiates it into space. Thermally, the computing is almost free. The film has to get rid of all the sunlight it absorbs whether the chips are there or not, and the chips' share simply passes through them on the way out.</p>
    <details class="deep"><summary>What it would cost to gather the heat in one place</summary><p>The metal you would need to spread a chip's heat sideways grows with the square of its power: ${num('0.09 g/W')} at 0.1 W per chip, ${num('9.4 g/W')} at 10 W. The film sheds about ${num(`${Math.round(p.alpha * f.S)} W/m²`)} in all, and ${num(`${Math.round(f.s.sail.chipWm2 * f.S / f.s.sail.S)} W/m²`)} of that happens to pass through the chips first.</p></details>
    <p>${optical
      ? 'Light guided in fibres laid through the film links the chips, so a whole sail works as one machine: a signal crosses it in about two microseconds.'
      : 'With 2026 hardware the chips talk over an electrical mesh, hop by hop, so a sail works as many loosely linked patches. Light guides in the film, expected from about 2050, would make it one machine.'}
      Neighbouring sails are tens to hundreds of kilometres apart, up to a millisecond away at the speed of light, so each sail computes on its own and works with the others more loosely. One sail could serve about ${num(words(agents))} AI agents at once, or train a model with about ${num(words(params))} active parameters in a year.</p>`;
}

function renderWhy() {
  const p = state.params;
  const s = h.swarmAt(p, 0.01);
  const ratio = s.sail.flopsPerKg / s.pod.flopsPerKg;
  const at15 = h.swarmAt({ ...p, podFrac: 0.15 }, 0.01).kgPerW / s.kgPerW;
  const podLine = s.q >= 0.149
    ? `Here pods carry ${num(pct(s.q, 1))} of the chips' power, the share needed if the film's chips cannot safely run AI agents walled off from each other. If every chip could, it would fall toward 1%.`
    : `Here pods carry ${num(pct(s.q, 1))} of the chips' power. If every chip in the film can safely run AI agents walled off from each other, that falls toward 1%. If none can, it rises to 15%, and the swarm gets ${num(pct(at15 - 1, 0))} heavier.`;
  $('why-prose').innerHTML = `
    <p>Putting a satellite's chips together in one box looks like the obvious design, since chips that work together want short wires between them. The trouble is the heat. Once it is gathered in one place it has to be carried somewhere big enough to radiate it, and the pumps, pipes and radiators that do the carrying weigh more than the short wires save. For each kilogram of Mercury, spread-out sails compute ${num(`${ratio.toFixed(1)} times`)} as much as the best box.</p>
    <p>Boxes, called pods here, still earn a place. Some memory has to be shielded from radiation, some chips are too big to print into the film, and some data wants a sealed case.</p>
    <details class="deep"><summary>How much of the work goes to pods</summary><p>${podLine}</p></details>`;
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
    <p>Mercury is mostly iron. Its crust and mantle, the part worth mining, are ${num(pct(MERCURY.M_SHELL / MERCURY.M, 0))} of its mass. Surprisingly little happens on the surface: machines dig the rock, and electromagnetic launchers throw it, unrefined, into low orbit at about ${num('3 km/s')}. Everything else happens up there. Catapults in orbit speed it up to the ${num(`${(d.logistics.sail.vLaunch / 1e3).toFixed(1)} km/s`)} the sails need, and factories turn it into silicon, magnesium, aluminium and glass. About ${num(pct(p.yieldDelivered, 0))} of each kilogram ends up in spacecraft, and the oxygen becomes rocket propellant.</p>
    <p>The reason is heat. Energy is not scarce, since the swarm can beam down as much as anyone wants. What is scarce is a way to get rid of it, and on a planet with no air or water the only way is to radiate it into space. Even paved with radiators heat-pumped to about ${num(`${(Math.round(Tr / 50) * 50).toLocaleString('en-US')} K`)}, Mercury can shed only ${num(`${sci(p.mercuryHeatLimit, 1)} W`)}. So the less heat each kilogram leaves behind, the faster the swarm can be built.</p>
    <details class="deep"><summary>Why a planet paved with radiators is the limit</summary><p>Bare ground at ${num('500 K')}, about the temperature of the machines, radiates only ${num(`${sci(bare, 1)} W`)} from the whole planet. Heat pumps lift the waste heat to about ${num(`${(Math.round(Tr / 50) * 50).toLocaleString('en-US')} K`)}, where each square metre radiates ${num(`${Math.round((Tr / 500) ** 4)} times`)} more. Going hotter helps only a little: at ${num('2,000 K')}, about as hot as a radiator can be built, the same planet sheds under ${num('10¹⁹ W')}, because the pumps' own work has to be radiated too.</p><p>What can still be changed is the heat each kilogram leaves behind. Digging and the first ${num('3 km/s')} leave about ${num(`${p.heatPerKg} MJ`)}${p.heatPerKg <= 0.15 ? `, with superconducting launchers that lose only 1% of the energy they give the rock. At 95% it would be ${num('0.3 MJ')}, and the swarm would finish smaller and about a century later` : ''}. Launching all the way from the ground would leave ${num('1.8 MJ')}, and refining on the ground tens of MJ.</p></details>
    <details class="deep"><summary>Why not take the whole planet apart?</summary><p>It could be done. Pulling Mercury apart against its own gravity takes ${num('1.8×10³⁰ J')}, a couple of hours of the finished swarm's output, and the molten core would be thrown out hot, taking its own heat with it. But the swarm is short of silicon, not of mass. The rock outside the core is a quarter silicon. The core is ${num(pct(MERCURY.M_CORE / MERCURY.M, 0))} of the planet, but it is iron with perhaps ${num('4–8%')} silicon, so every kilogram of silicon from it comes with about 16 kg of iron to lift, and four times the heat on Mercury. So the core is left as the swarm's reserve for repairs once the rock is gone.</p></details>
    <p>Industry copies itself every ${num(`${g.doublingYearsEff.toFixed(2)} years`)}, slowed by the chip fabs it has to build. In ${num(yr(p.seedYear + g.tCap))} it hits the <em>heat wall</em>, and exports stop growing at ${num(`${sci(g.capToSails * YEAR, 2)} kg`)} a year. By ${num(Math.round(now.calendarYear))}, ${num(pct(now.mercuryRemoved, 2))} of the planet has been taken apart. The finished swarm is built from ${num(pct(Math.min(1, rockUsed), rockUsed < 0.1 ? 1 : 0))} of Mercury's rock${rockOut ? `; the rest goes into replacing worn-out sails, and by ${num(rockOut)} all of it has been dug out` : ''}.</p>`;
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

/** How long a sail lasts, and how the model counts replacements. */
function refreshBox(p, d, E) {
  const g = d.growth, L = p.serviceLife, rho = p.recycleFrac, Td = g.doublingYearsEff;
  if (!(L > 0)) return '';
  const deep = (title, body) => `<details class="deep"><summary>${title}</summary>${body}</details>`;
  const grow = 2 ** (-L / Td);
  const decay = (1 - rho) / L;
  const Bss = g.capToSails * YEAR * L / Math.max(1e-9, 1 - rho);
  // the wear clocks, for the near-uniform swarm's sails: 0.95 AU, film ~380 K, chips ~115 °C
  const k = 8.617e-5, Ea = 0.9;                                  // Cu electromigration, eV
  const em = (t1, t2) => Math.exp((Ea / k) * (1 / (t2 + 273.15) - 1 / (t1 + 273.15)));   // life at t2 vs t1
  const chip = em(105, 115) * 10;                                // a chip built for 10 yr at 105 °C, full current
  const dose = [142, 466].map(x => x * (0.92 / 0.95) ** 2);     // krad per decade, unshielded film chiplet
  const cell = 0.08 * (0.92 / 0.95) ** 2;                        // fraction of output lost per decade
  const wear = [
    ['Solar cells', 'protons from solar flares knock silicon atoms out of place', `${pct(cell, 1)} of output a decade`, `80% of new after about ${Math.round(0.2 / cell * 10)} years; the damage slows as it builds up, and some of it heals at the film's 107 °C`],
    ['Chip wiring', 'electromigration: current slowly drags copper atoms along the wires, faster the hotter they are', `at 115 °C, ${em(115, 105).toFixed(0)}× as fast as at 105 °C and ${em(115, 85).toFixed(0)}× as fast as at 85 °C`, `about ${chip.toFixed(0)} years for a chip built to today's standard at full current; about ${Math.round(chip * 4 / 5) * 5} at the sail's 60% clock; about ${Math.round(chip * 16 / 10) * 10} with wires twice as wide`],
    ['Memory', `radiation, ${Math.round(dose[0])}–${Math.round(dose[1])} krad a decade with no shielding`, 'magnetic RAM fails above about 1 Mrad, resistive RAM above 10–20 Mrad', `magnetic RAM ${Math.round(1000 / dose[1] * 10)}–${Math.round(1000 / dose[0] * 10)} years, resistive RAM centuries`],
    ['Film and chiplets', 'dust grains punching through the film', '0.007–1.2% of the area a year, depending on whether a crack kills a whole tile', 'the 10% spare area lasts from 8 years to many centuries'],
    ['Cover glass', 'hydrogen from the solar wind', 'saturates the surface within a year', 'a one-off loss of about 3% if the anti-reflection layer goes'],
    ['Booms, tethers, vanes', 'nothing much: no day and night, no air, no plastics', 'very slow', 'many decades'],
  ];
  const wearRows = wear.map(([a, b, c, e]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td><td>${e}</td></tr>`).join('');
  const astar = gy => Math.log(1 / rho) / Math.log(1 + gy);
  const lives = [15, 20, 30, 50].map(Ly => {
    const q = { ...p, serviceLife: Ly };
    const dq = Ly === L ? d : h.compute({ ...q, coverage: 1 });
    const Eq = Ly === L ? E : h.earthLimits(q, dq);
    return `<tr><td>${Ly} years${Ly === L ? ' (used here)' : ''}</td><td class="v">${pct(Eq.cap, 0)}${Eq.binding === 'room' ? ', room full' : ''}</td><td class="v">${sci(Eq.flops, 2)}</td><td class="v">${Math.round(Math.LN2 * Ly / (1 - rho))} years</td></tr>`;
  }).join('');
  return deep('How long a sail lasts, and how replacements are counted', `
    <p>Two clocks decide when a sail is replaced: how fast it wears out, and how fast it falls behind newer chips.</p>
    <p><b>Wearing out.</b> These are the rates for this swarm's sails, at 0.95 AU with the film at about 107 °C and the chips at about 115 °C:</p>
    <div class="tablewrap" style="margin:1rem 0"><table class="compare"><thead><tr><th>Part</th><th>What wears it</th><th>How fast</th><th>How long it lasts</th></tr></thead><tbody>${wearRows}</tbody></table></div>
    <p>The figure of 20 to 30 years in the studies came from the first two rows: cells that keep about 92% of their output after ten years, and chips built the way chips are built today. It is not a law of physics. Chips with wider wiring and resistive memory, at the cost of some chip area, would push the whole sail past 50 years, and then the cells set the pace, fading slowly rather than failing. The hot chips are this layout's price: in a shell at 85 °C the same wiring would last ten times longer.</p>
    <p><b>Falling behind.</b> Replacing a sail early pays when what the new chips gain beats what recycling loses. That happens at an age of ln(1/ρ) ÷ ln(1 + g), where ρ is the share of the old sail recycled and g the yearly gain in computing per joule. With ${num(pct(rho, 0))} recycled, that is ${Math.round(astar(0.01))} years if chips still improve 1% a year, ${Math.round(astar(0.004))} at 0.4% and ${Math.round(astar(0.002))} at 0.2%. While the swarm is being built, around 2140–2200, chips are still creeping toward their floor, so the model uses ${num(`${L} years`)}. Once they stop improving, only wear matters, and sails could stay up much longer.</p>
    <div class="tablewrap" style="margin:1rem 0"><table class="compare"><thead><tr><th>Service life</th><th>Finished swarm</th><th>FLOP/s</th><th>Half-life once the rock is gone</th></tr></thead><tbody>${lives}</tbody></table></div>
    <p>A longer life helps twice. Less rock is lost to refreshes, so the swarm fills all the room it has; and once the rock is gone the fleet wears down far more slowly.</p>
    <p><b>The refresh itself</b> is a swap. A depot craft brings new film rolls, chips already in them, and fits them onto the sail's existing hub, booms and vanes; the old film is rolled up and recycled in orbit.</p>
    <p><b>The model counts it like this.</b> Every kilogram exported retires ${num(`${L} years`)} later, and ${num(pct(rho, 0))} of it goes back into production. While industry doubles every ${num(`${Td.toFixed(2)} years`)}, the sails retiring were built when industry was 2<sup>${L}/${Td.toFixed(2)}</sup> times smaller, so replacements take only ${num(pct(grow, grow < 0.01 ? 2 : 0))} of the output. After the heat wall, exports stop growing and replacements catch up, passing half of the output within one service life. Left alone, the fleet would level off where retirements balance exports, at export × life ÷ (1 − ρ) = ${num(kg(Bss))}. That is more than Mercury's rock can supply, so the rock runs out first. From then on every refresh loses ${num(pct(1 - rho, 0))} of a sail, and the fleet shrinks by ${num(pct(decay, 1))} a year, halving every ${num(`${Math.round(Math.LN2 / decay)} years`)}.</p>
    <p class="note">Cells: 8% a decade at 0.92 AU behind 20 µm of glass (the hot-power study), scaled as 1/r². Wiring: Black's law, current density squared, activation energy 0.9 eV. Doses: the memory study's 10-year range at 0.92 AU. Dust: the thermal-mass study, from the Grün meteoroid flux. A once-in-a-millennium solar storm could deliver 10–100 times a decade's dose in days, which magnetic RAM would not survive.</p>`);
}

/** After Mercury's rock: what could keep the swarm repaired. */
function afterRockBox(p, d, E) {
  const L = p.serviceLife, rho = p.recycleFrac;
  if (!(L > 0) || d.growth.tRockOut == null) return '';
  const deep = (title, body) => `<details class="deep"><summary>${title}</summary>${body}</details>`;
  const lossKg = E.mass * (1 - rho) / L;                 // spacecraft lost per year at the finished size
  const siYr = (lossKg / p.yieldDelivered) * 0.25;        // silicon to replace it (Mercury's rock is ~25 % Si)
  const yrs = si => { const y = si / siYr; return y < 20 ? `${y.toFixed(0)} years` : `${words(Math.round(Number(y.toPrecision(2))))} years`; };
  const src = [
    ['The whole asteroid belt', '2.4×10²¹ kg', 2.4e21 * 0.12, 'almost none'],
    ["Mercury's iron core", '2.5×10²³ kg', 1.5e22, '4.3 km/s'],
    ['The Moon', '7.3×10²² kg', 1.5e22, '2.4 km/s'],
    ['Mars', '6.4×10²³ kg', 1.0e23, '5.0 km/s'],
    ['Venus', '4.9×10²⁴ kg', 7e23, '10.4 km/s, under 90 bar of CO₂'],
  ];
  const rows = src.map(([n, m, si, v]) => `<tr><td>${n}</td><td class="v">${m}</td><td class="v">${sci(si, 2)} kg</td><td class="v">${v}</td><td class="v">${yrs(si)}</td></tr>`).join('');
  return deep('After the rock: could asteroids keep the swarm going?', `
    <p>Once Mercury's rock is gone, the swarm wears down. At its finished size, refreshes lose about ${num(`${sci(lossKg, 2)} kg`)} of spacecraft a year, and replacing that takes about ${num(`${sci(siYr, 2)} kg`)} of silicon a year.</p>
    <p>Asteroids look like the obvious top-up. There is no gravity well to climb, mining spread over thousands of small bodies has no heat wall, and the trip to the swarm, about 11 km/s, is easy for a solar sail. But the whole main belt weighs only 2.4×10²¹ kg, about 3% of Mercury's rock. Ceres alone is 39% of it, and most of it is carbon-rich rock and ice with only 10–15% silicon. It would cover the swarm's repairs for a few years.</p>
    <div class="tablewrap" style="margin:1rem 0"><table class="compare"><thead><tr><th>Source</th><th>Mass</th><th>Silicon</th><th>Escape speed</th><th>Repairs it covers</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p>What asteroids do offer is what Mercury lacks: hydrogen, carbon and nitrogen. Mercury has only about 5×10¹³ kg of hydrogen, which forces every factory to run on dry chemistry; Ceres alone probably holds around 10²⁰ kg of water. For bulk silicon, the next sources are Mercury's own core, then the Moon and Mars, each climbed out of with beamed power. Better recycling stretches all of them: at 99% instead of ${pct(rho, 0)}, the losses fall ${Math.round((1 - rho) / 0.01)}-fold.</p>
    <p class="note">Silicon: the core at ~6%, the Moon, Mars and Venus at ~20% of their rocky part, the belt at ~12%. Belt mass from Pitjeva and Pitjev 2018. Years at the finished swarm's loss rate.</p>`);
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
  const earthLine = E.binding === 'rock' ? '' : Number.isFinite(yCap)
    ? `${LIMIT[E.binding]}, the blue line, is reached in ${num(yr(p.seedYear + yCap))}.`
    : `It never reaches ${LIMIT[E.binding].toLowerCase()}, the blue line.`;
  $('build-prose').innerHTML = `<p>For decades there is nothing to see, which is how exponential growth always looks from the inside. ${growthLine} Then it tops out at ${num(pct(ceil, 1))}. ${upkeep} ${earthLine}</p>${refreshBox(p, d, E)}${afterRockBox(p, d, E)}`;
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
    limit: { f: E.cap, label: `${LIMIT[E.binding]}: ${pct(E.cap, E.cap < 0.1 ? 1 : 0)}` },
    cursor: { t: state.t, f: a.f },
    describe: (t, f) => `<b>${Math.round(p.seedYear + t)}</b><br>${pct(f, 3)} of sunlight captured`,
    onPick: t => { state.t = t; renderYear(); },
  });
  const label = h.ERAS[state.era] ? h.ERAS[state.era].label : 'Your assumptions';
  $('build-legend').innerHTML = `<span><i style="background:var(--sun-mark)"></i>${label}</span><span><i style="background:var(--ink-3)"></i>the other hardware presets</span><span><i style="background:var(--earth)"></i>the finished swarm</span>`;
  updateYear(a);
}

/** The year cursor, readout and slider, without redrawing the chart. */
function updateYear(a) {
  state.chart?.setCursor(state.t, a.f);
  $('build-readout').innerHTML = readout(a);
  $('year').value = String(Math.round(xOf(state.t) * 1000));
}

function renderEarth() {
  const p = state.params, E = state.earth;
  const F = h.FIXED;
  const fc = E.forcing;
  const deep = (title, body) => `<details class="deep"><summary>${title}</summary>${body}</details>`;
  const co2 = fc.gross / EARTH.co2DoublingForcing;
  const runaway = EARTH.runawayAbsorbedLimit - EARTH.absorbedSolar;
  const uniform = p.earthPlacement === 'uniform';
  // infrared Earth absorbs per 1 % of the Sun's light, by layout
  const sh = h.swarmAt({ ...p, earthPlacement: 'shell' }, 0.01);
  const irShell = earthImpact(h.filmOptics(p), sh.rSail, 0.01, sh.sail.T, sh.sail.S).irForcing;
  const per = { shell: irShell, cone: F.keepoutIR * irShell, farside: h.farsideIRPerF({ ...p, farsideLat: 60 }) / 100, uniform: F.uniformIRPerF / 100 };
  const perHere = fc.gross / Math.max(E.cap * 100, 1e-9);
  const p1 = `Every watt the sails catch leaves them again as heat, and Earth sits in the middle of it. ${uniform
    ? `Even with their fronts dark in the infrared and none of them between Earth and the Sun, the sails add ${num(`${per.uniform.toFixed(2)} W/m²`)} to Earth for every 1% of the Sun's light they catch.`
    : `In this layout the sails add ${num(`${perHere.toFixed(2)} W/m²`)} to Earth for every 1% of the Sun's light they catch.`} The finished swarm would add ${num(`${fc.gross.toFixed(fc.gross < 10 ? 1 : 0)} W/m²`)}, ${co2 >= 1.5 ? `${Math.round(co2)} times` : `${pct(co2, 0)} of`} what doubling CO₂ does${fc.gross > runaway ? `, more than the ${num(`${Math.round(runaway)} W/m²`)} that would tip Earth into a runaway greenhouse` : ''}.`;
  const slit = deep('Why a gap round the line to Earth works, and what it needs', `<p>A sail between Earth and the Sun would show Earth its back, the hot side that does the radiating, and cast a shadow on it. So no sail flies within ${num('23°')} of that line, as seen from the Sun: a gap just wide enough that, from Earth, every line of sight toward the Sun misses the near side of the swarm. What Earth sees instead is the far side of the swarm, across the Sun, and from there every sail shows Earth its front.</p><p>So the fronts decide it. What Earth absorbs for every 1% of the Sun's light caught:</p>
    <table class="compare"><tbody>
      <tr><td>Even shell, glass fronts</td><td class="v">${per.shell.toFixed(1)} W/m², and its shadow</td></tr>
      <tr><td>Even, with the gap, glass fronts</td><td class="v">${per.cone.toFixed(1)} W/m²</td></tr>
      <tr><td>Only beyond the Sun, dark fronts</td><td class="v">${per.farside.toFixed(2)} W/m²</td></tr>
      <tr><td>Even, with the gap, dark fronts</td><td class="v">${per.uniform.toFixed(2)} W/m²</td></tr>
    </tbody></table>
    <p>With dark fronts, spreading the sails all round the Sun costs Earth only a third more heat per watt than hiding them all beyond the Sun, and there is room for three times as many.</p>`);
  const shadeKm2 = fc.sunlightCut * Math.PI * 6371 ** 2 * 2.5;   // radiation pressure holds the shade sunward of L1
  const p2 = fc.shade > 0
    ? `So Earth gets a sunshade. A cloud of thin sails near L1, the balance point ${num('1.5 million km')} toward the Sun, takes ${num(pct(fc.sunlightCut, 1))} of the sunlight Earth absorbs: exactly the swarm's heat, so Earth's average temperature stays where it is today. It is about ${num(`${sci(shadeKm2, 1)} km²`)} of film, a few grams per square metre, a speck next to the swarm.${fc.net > 1e-3 ? ` The ${num(`${fc.net.toFixed(1)} W/m²`)} it leaves is the heat Earth is allowed to take.` : ''}`
    : `This swarm needs no sunshade: Earth simply takes its ${num(`${fc.net.toFixed(2)} W/m²`)}.`;
  const p3 = fc.swapped > 0.5
    ? `It is not a clean swap. Sunlight drives evaporation, and the swarm's infrared mostly warms the air instead, so the world's rainfall falls, by about ${num(pct(fc.rainCut, 0))}. Sunlight also falls hardest on the tropics while the swarm's heat reaches every latitude, so a shade that dims Earth evenly leaves the poles warmer, by ${num(`${fc.polar.toFixed(1)} W/m²`)}, and the tropics cooler. Plants get ${num(pct(fc.sunlightCut, 0))} less light.`
    : '';
  const costs = fc.swapped > 0.5 ? deep('How sure are these costs?', `<p>The rain figure is the least certain number on this page. Climate models put the loss near ${num('0.76%')} per W/m² of sunlight traded for infrared, at a few W/m²; this swarm trades ${num(`${fc.swapped.toFixed(0)} W/m²`)}, so the rate is extrapolated and allowed to level off. The polar figure comes from the same studies. Both can be cut down, which is what the next chapter is about.</p>`) : '';
  const noIR = deep('Why not block the infrared instead?', `<p>Anything that turned the swarm's heat away from Earth would also turn back Earth's own heat along the same paths, because a filter treats light the same way in both directions. The swarm fills most of the sky on the Sun's side, so such a filter would trap much of the heat Earth has to lose. The only knobs are sunlight, and how brightly the sails' fronts glow.</p>`);
  const failsafe = fc.shade > 1 ? deep('What if the shade fails?', `<p>Then ${num(`${fc.gross.toFixed(0)} W/m²`)} would arrive unopposed, and Earth would warm by degrees within years. But the swarm can switch its heat off: a sail turned edge-on to the Sun stops absorbing sunlight and cools in minutes. Any part of the shade that fails can be matched within the hour by turning an equal share of the swarm edge-on, at the cost of its computing.</p>`) : '';
  const lux = E.skyLuxAtCap;
  const discCd = Math.min(0.999, E.cap / F.uniformShare) * p.rhoVis * 1361 / F.uniformR ** 2 / Math.PI * 93;
  const p4 = uniform
    ? `From Earth the swarm is a disc of light ${num('72°')} in radius round the Sun, about ${num(`${Math.round(discCd)} cd/m²`)}, as bright as the sky just after sunset, with a dark hole ${num('15°')} across round the Sun itself, where sails stay clear of the point behind it. By day it is lost in the blue. After sunset it stays up for hours: with the Sun ${num('18°')} below the horizon it still lights the ground at about ${num(`${Math.round(lux)} lux`)}, what the ground gets a few minutes after sunset. The sky gets dark only once the Sun is more than ${num('72°')} below the horizon, around midnight in the tropics and on winter nights at mid-latitudes. On summer nights it never does.`
    : `After sunset the swarm glows round the Sun's position, lighting the ground at up to ${num(`${lux < 10 ? lux.toFixed(1) : Math.round(lux)} lux`)}, ${lux / 0.25 >= 1.5 ? `${Math.round(lux / 0.25)} times` : 'about'} a full Moon.`;
  $('earth-prose').innerHTML = `<p>${p1}</p>${slit}<p>${p2}</p>${noIR}${failsafe}${p3 ? `<p>${p3}</p>` : ''}${costs}<p>${p4}</p>`;

  const sCap = h.swarmAt(p, E.cap);
  orbitMap($('orbit-map'), uniform
    ? { mode: 'uniform', r: F.uniformR, cone: 23, l3: 15, label: `the swarm: ${pct(E.cap, 0)} of the Sun's light` }
    : p.earthPlacement === 'farside'
    ? { shellR: null, cloudLabel: `the swarm: ${pct(E.cap, E.cap < 0.1 ? 1 : 0)}`, latMax: p.farsideLat }
    : { shellR: Math.min(0.96, sCap.rSail), shellLabel: `the swarm: ${pct(E.cap, 0)}`, cloudLabel: '', spans: [] });
  let kink = null;
  for (const r of state.table) if (h.swarmAt({ ...p, earthPlacement: 'shell' }, r.f).rSail > 1) { kink = r.f; break; }
  const name = { uniform: 'the near-uniform swarm with dark fronts', farside: 'sails only beyond the Sun, dark fronts', cone: 'even with a gap, glass fronts', shell: 'the same even shell' }[p.earthPlacement];
  earthChart($('earth-chart'), {
    pts: state.table.map(r => [r.f, r.forcing]),
    pts2: state.table.map(r => [r.f, h.earthForcing(p, r.f).gross]),
    refs: [
      { v: EARTH.co2DoublingForcing, label: `${EARTH.co2DoublingForcing} W/m², doubling CO₂` },
      { v: runaway, label: `${Math.round(runaway)} W/m², runaway greenhouse` },
    ],
    marks: [{ f: E.cap, label: `finished swarm, ${pct(E.cap, E.cap < 0.1 ? 1 : 0)}`, color: 'var(--ink)', top: true, left: true }],
  });
  $('earth-caption').innerHTML = `<b>Heat the swarm adds to Earth, against the share of the Sun's light it catches, before the sunshade.</b> Solid: sails spread evenly inside Earth's orbit with glass fronts, their infrared minus the sunlight they block.${kink ? ` The kink near ${pct(kink, 0)} is where so dense a shell has to retreat outside Earth's orbit to stay cool.` : ''} Dashed: ${name}. The shade takes away whatever is above zero.`;
}

function renderDesign() {
  const E = state.earth, fc = E.forcing;
  const deep = (title, body) => `<details class="deep"><summary>${title}</summary>${body}</details>`;
  const swap = fc.swapped > 0.5;
  $('design-prose').innerHTML = `
    <p>${swap ? `The shade above dims all of Earth evenly. It does not have to.` : `A shade does not have to dim Earth evenly.`} With the swarm's energy, adding or removing sunlight anywhere on Earth is almost free: adding ${num('50 W/m²')} of daylight to a million square kilometres takes ${num('5×10¹³ W')}, two ten-trillionths of the swarm's output, and about ten million tonnes of mirrors in Earth orbit. What limits it is how sharply light can be placed, and how the atmosphere answers.</p>
    <p>The Sun is half a degree across, so a shade or mirror blurs its shadow or spot over about a hundredth of its distance. From L1 that is ${num('14,000 km')}, more than Earth's diameter: a shade there can only shift its weight across Earth's disc, north against south, season by season. That is still useful. In climate models, sunlight cut by latitude and season leaves the worst-off region about a third less changed than an even cut, and four control points have held global temperature and both its north–south and equator-to-pole gradients at once. Mirrors and shades in orbits ${num('10,000 km')} up blur over ${num('90 km')}, enough to aim at a country; at ${num('1,000 km')}, ${num('9 km')}, enough for a valley. They turn edge-on when they are not over their target.</p>
    <div class="tablewrap" style="margin:1.4rem 0"><table class="compare"><thead><tr><th>Shade or mirror at</th><th>Blur</th><th>What it can steer</th></tr></thead><tbody>
      <tr><td>L1, 1.5 million km</td><td class="v">14,000 km</td><td>Earth's overall sunlight, north vs south, seasons</td></tr>
      <tr><td>10,000 km orbit</td><td class="v">90 km</td><td>Regions and countries</td></tr>
      <tr><td>1,000 km orbit</td><td class="v">9 km</td><td>Valleys, cities, farms</td></tr>
    </tbody></table></div>
    <p>The atmosphere is the harder part. Temperature follows sunlight closely: with tens of W/m² a region's winters can be made milder or its summers cooler by several degrees. Rain does not. It needs water carried in from the sea, and that is moved by weather systems thousands of kilometres across. Shading land in summer weakens the heating that pulls in monsoon rain, so summers dry out. But winter rain needs an ocean upwind and a storm track overhead, and shading can move those only a few degrees north or south. Water is also conserved: rain moved to one place is taken from another.</p>
    ${deep('Could more of the world have a Mediterranean climate?', `<p>A Mediterranean climate has mild winters, dry summers under a summer high, and rain in winter when the storm track swings toward the equator. It sits on west coasts between about 30° and 45° of latitude: California, central Chile, the Cape, south-west Australia and the Mediterranean itself.</p>
      <p><b>Coasts farther from the equator: plausibly yes.</b> Shading shaped by season could push the dry-summer belt a few degrees toward the poles, onto France and Britain, the Pacific Northwest, southern Chile, Tasmania and New Zealand. Its equator-side edge would then dry toward steppe: Morocco, southern Spain, southern California. In the north there is more land at 45–55° than at 30–40°, so the area could still grow.</p>
      <p><b>The interior of continents: only half.</b> The temperatures can be made Mediterranean, adding winter daylight and capping summer heat, and summers can be dried by shading. The winter rain cannot be supplied. It can be replaced: desalinating and pumping half a metre of water a year onto ten million square kilometres takes a few terawatts, a rounding error for the swarm. That is irrigated Mediterranean farming rather than a Mediterranean climate.</p>
      <p><b>What nobody knows yet.</b> No climate model has yet run shading aimed country by country. The studies so far work by latitude and season, and regional outcomes depend on circulation changes that simple models leave out and full models disagree on.</p>`)}
    <p>${swap ? `The same tools can take most of the sting out of the swarm's own costs. A shade weighted toward high latitudes in summer cancels the polar warming, and the rain the shade costs can be made up from the sea.` : ''} What they cannot remove is the politics. One region's new Mediterranean summer is another's lost monsoon, and whoever steers the mirrors holds everyone's weather.</p>`;
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
  // the hardware itself, on its thermal orbit (the swarm's layout then adds its own costs)
  const a = h.swarmAt({ ...p26, earthPlacement: 'shell' }, 0.01), b = h.swarmAt({ ...right, earthPlacement: 'shell' }, 0.01);
  const f1 = x => `${(x * 100).toFixed(1)}%`;
  $('future-prose').innerHTML = `
    <p>Industry needs most of a century to reach the heat wall, and sails get new film every 10 to 20 years, so nearly every sail that ever flies carries hardware built after 2095. Today's memory chips, today's processors and the small lasers they would use to talk are long gone before the swarm is big enough to see.</p>
    <p>The design itself outlives all of that. Spread-out sails still beat boxes, chips still run near 85 °C, and silicon is still the only solar cell Mercury's rock can make in bulk. What changes is how much each kilogram does. The table compares today's hardware with the hardware the swarm is actually built from.</p>`;
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
  const cpw = s => s.chipPower / s.intercepted;
  const notes = [
    ['Energy per operation', `<p>The 2026 figure, ${num(`${sci(a.sail.jPerFlop, 2)} J`)}, is what today's AI accelerators spend per 8-bit operation, memory and links included, slowed to 60% of full clock speed where they are most efficient, at 85 °C. The mature figure follows each part of that energy forward. Transistors keep shrinking for another decade or two, but their supply voltage is stuck near 0.6 V, so each switch saves only a few times more. 4-bit arithmetic halves the work per operation. Memory stacked directly on the logic removes most of the energy spent moving data. By 2100 that reaches about ${num('1.4×10⁻¹⁵ J')}, twice the practical floor for ordinary logic at 85 °C (about 7×10⁻¹⁶ J, still 400 times the thermodynamic minimum per switch). Going further needs reversible logic, which costs chip area the film doesn't have; the optimistic era assumes some of it.</p>`],
    ['Memory per chiplet', `<p>A chiplet in the film has no shielding and takes 140–470 krad of radiation in ten years. DRAM fails at 2–100 krad, so the 2026 design had to use SRAM: 16 MB, which at 85 °C leaks 10–59% of the chip's power. Non-volatile memories shrug the dose off (magnetic RAM above 1 Mrad, resistive RAM 5–20 Mrad, ferroelectric RAM 10 Mrad) and can be stacked in layers on top of the logic. By about 2040 that gives 1–2 GB per 0.15 W chiplet, kept to the useful minimum because every gigabyte costs fab area. It holds its contents with no power, so the leakage disappears.</p>`],
    ['Memory in pods', `<p>Pods are shielded, 5 g/cm² for 0.4–3.3 krad a decade, so they can keep dense volatile memory. HBM, today's stacked DRAM beside the processor, carries about 0.115 GB per watt, and its last generation is expected around 2038. After that, memory is bonded directly onto the logic, about 10 GB per watt.</p>`],
    ['Laser terminals', `<p>Each terminal's data rate is set by optical bandwidth and how many bits each hertz carries, not by photons: about 50 Tbps by 2040, 200 by 2070 and 400 by 2100. A 10 cm telescope reaches every neighbouring sail, within about 330 km; a 30 cm one reaches 3,000–5,000 km. So a mature sail needs about a dozen terminals instead of 64, under 3% of its mass.</p>`],
    ['Solar cell efficiency', `<p>Silicon is the only solar cell Mercury's rock can make in bulk: perovskites need iodine, and III-V cells indium and germanium, enough for a millionth of the swarm. Today's thin space silicon converts ${num(pct(p26.pvEta0, 0))} of sunlight above the atmosphere. Made without hydrogen, which Mercury lacks, mature cells reach about ${num('21.5%')}, against a theoretical 30%. The optimistic ${pct(h.eraParams('high').pvEta0, 0)} needs a top cell of silicon nanocrystals in glass, which works only in the lab so far. Thinner, better cells also lose less in the heat: 0.34% per kelvin instead of 0.42%.</p>`],
    ['Orbit at 1% coverage', `<p>A sail flies where its chips reach their 85 °C limit. Its temperature depends on how much sunlight it absorbs and how well it radiates, not on how efficient its cells are, because the chips turn all the electricity back into heat in the same sheet. Mature cells reflect the infrared that silicon can't use, so the film absorbs ${pct(right.alpha, 0)} of the sunlight instead of ${pct(p26.alpha, 0)}, runs cooler, and can fly nearer the Sun: ${b.rSail.toFixed(3)} AU instead of ${a.rSail.toFixed(3)}.</p>`],
    ['Swarm mass per watt', `<p>The film's weight per square metre, divided by the chip power each square metre carries, plus the pods' share. Nearer the Sun each square metre collects more, mature cells convert a little more, and pods shrink from ${pct(a.q, 0)} of the chip power to ${pct(b.q, 0)} as memory moves onto the film. Together that takes the swarm from ${(a.kgPerW * 1e3).toFixed(2)} to ${(b.kgPerW * 1e3).toFixed(2)} g/W${(right.filmThin ?? 1) < 1 ? `, with the film thinned to ${pct(right.filmThin, 0)} of the design spec` : ''}.</p>`],
    ['Computing per watt of sunlight', `<p>The end-to-end figure. Of each watt of sunlight, about ${num(pct(cpw(a), 0))} becomes chip power in 2026 and ${num(pct(cpw(b), 0))} in the mature era, after the cells, the packing of the film and the power the sail keeps for itself. Each joule of chip power then does one operation per ${sci(a.sail.jPerFlop, 2)} J in 2026 and per ${sci(b.sail.jPerFlop, 2)} J later. Multiplied out, that is ${sci(a.flops / a.intercepted, 2)} and ${sci(b.flops / b.intercepted, 2)} operations per joule of sunlight, ${Math.round((b.flops / b.intercepted) / (a.flops / a.intercepted))} times more, almost all of it from cheaper operations. These are for the hardware on its own; the near-uniform swarm then gives about 40% back for its infrared-dark fronts and its hotter orbit.</p>`],
  ];
  $('future-notes').innerHTML = `<p class="notes-title">How these figures were obtained</p>${notes.map(([k, v]) => `<details class="deep"><summary>${k}</summary>${v}</details>`).join('')}`;
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
  renderWhen(); renderFigures(); renderSummary(); renderChoose(); renderSail(); renderComputer(); renderWhy(); renderMercury(); renderBuild(); renderEarth(); renderDesign(); renderStar(); renderFuture();
  for (const b of document.querySelectorAll('.era button')) b.setAttribute('aria-pressed', String(b.dataset.era === state.era));
  renderDash(h.atYear(state.params, state.d, state.t));
}
function renderYear() {
  const a = h.atYear(state.params, state.d, state.t);
  updateYear(a); renderDash(a); renderStar(); renderMercury();
}

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
  wireExplainers();
  recompute();
  watchChapters();
  window.__ledger = { state, recompute, setEra, setYear: t => { state.t = t; renderYear(); } };
}

init();

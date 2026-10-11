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
  return { s, side, diag: side * Math.SQRT2, MW: W / 1e6, chips: W / p.chipPower, flops, mass: p.sailArea * h.filmAreal(p),
    farside: s.farside, S: s.sail.S * kS, pitch: s.sail.chipPitch / Math.sqrt(kS) };
}

function recompute() {
  const p = state.params;
  state.d = h.compute(p);
  state.earth = h.earthLimits(p);
  state.far = h.earthLimits({ ...p, earthPlacement: 'farside' });
  state.shellE = h.earthLimits({ ...p, earthPlacement: 'shell' });
  state.table = coverageTable(p);
  const g = state.d.growth;
  state.moments = {
    first: 5,                                           // the first sails
    wall: g.tCap,                                       // Mercury's heat wall
    one: state.d.yearsToCoverage(0.01),                 // 1 % of the Sun's light
    cap: state.d.yearsToCoverage(state.earth.cap),      // what Earth allows
    big: h.compute({ ...p, earthPlacement: 'farside', coverage: 1 }).yearsToCoverage(0.2),
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
    [`${sci(E.flops, 2)} FLOP/s`, `calculations a second, in the swarm Earth allows: ${pct(E.cap, 2)} of the Sun's light`],
    reached,
    [`${f.MW.toFixed(0)} MW`, `in one sail ${Math.round(f.diag)} m across`],
    ratio > 1.05 ? [`${Math.round(ratio)}×`, 'more than Earth allows, if industry ran unchecked'] : ['within', 'industry never outgrows what Earth allows'],
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
  if (a.f < E.cap * 1.05) return "Earth's limit";
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
  svg += `<text x="${W - R}" y="${Y(E.cap) + 10}" text-anchor="end" fill="var(--earth)" font-size="9">Earth's limit ${pct(E.cap, 1)}</text>`;
  svg += `<path d="${pts.map(([t, f], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(f).toFixed(1)}`).join('')}" fill="none" stroke="var(--ink)" stroke-width="1.6"/>`;
  if (Number.isFinite(g.tCap) && g.tCap < tMax) svg += `<line x1="${X(g.tCap)}" x2="${X(g.tCap)}" y1="${H - B - 4}" y2="${H - B + 3}" stroke="var(--heat)" stroke-width="1.5"/><text x="${X(g.tCap)}" y="${H - 3}" text-anchor="middle" fill="var(--heat)" font-size="9">heat wall</text>`;
  svg += `<text x="${L}" y="${H - 3}" fill="var(--ink-3)" font-size="9">${p.seedYear}</text><text x="${W - R}" y="${H - 3}" text-anchor="end" fill="var(--ink-3)" font-size="9">${p.seedYear + Math.round(tMax)}</text>`;
  svg += `<line x1="${X(a.year)}" x2="${X(a.year)}" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-width="0.75" opacity="0.5"/><circle cx="${X(a.year)}" cy="${Y(Math.max(a.f, 1e-8))}" r="3.2" fill="var(--sun-mark)" stroke="var(--ink)" stroke-width="0.75"/>`;
  $('dash-chart').innerHTML = svg + '</svg>';
  // the sails, as squares
  const sCap = h.swarmAt(p, E.cap);
  const nCap = (sCap.sailPower / sCap.sail.chipWm2 / p.sailArea) * sCap.areaFactor;
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
  const heatMax = Math.max(2 * p.forcingLimit, EARTH.co2DoublingForcing);
  const items = [
    ['Sunlight captured', pct(a.f, a.f < 0.01 ? 3 : 1), ''],
    ['Computing', `${sci(a.flops, 1)} FLOP/s`, vsAI >= 1 ? `${words(vsAI)} × all AI chips of 2025` : `${pct(vsAI, 0)} of all AI chips of 2025`],
    ['Extra heat on Earth', `+${fc.net.toFixed(2)} W/m²`, `budget ${p.forcingLimit} W/m²<span class="gauge"><i style="width:${Math.min(100, (fc.net / heatMax) * 100)}%"></i><b style="left:${(p.forcingLimit / heatMax) * 100}%"></b></span>`, fc.net > p.forcingLimit * 1.001],
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
  how: `<p>Eight research studies came first: computer chips and memory after 2095, the solar cells Mercury's rock can make, the satellite's structure and optics, manufacturing and recycling, what the swarm does to Earth's climate and night sky, and an adversarial review of the results. Their numbers are in the project repository.</p><p>They feed a model that runs in your browser and builds the swarm year by year: industry doubles until Mercury can't shed the heat any faster, sails wear out and are recycled, and Earth's climate sets the size. The pictures come from Blender scenes and our own renderer, fed the same numbers.</p>`,
  unsure: `<p>A lot. The hardware is seventy years beyond today's. The heat budget for Earth is a choice about how much warming to accept, not a fact. How Mercury gets rid of its heat is the least certain part of the build-out, and the far-side layout needs orbit-keeping and debris capture nobody has demonstrated.</p><p>The buttons below switch between pessimistic and optimistic hardware, and every assumption can be changed at the bottom of the page. The conclusion that heat, not energy or rock, limits the swarm holds across all of them.</p>`,
  change: `<p>Yes. The hardware buttons below switch eras. Near the end you can choose between three swarms, and at the very bottom every assumption has a slider. The text, the charts and the dashboard all recompute; only the photographs stay fixed, at the swarm Earth allows.</p><p>As you scroll, the dashboard ${matchMedia('(min-width: 1200px)').matches ? 'on the right' : 'at the top'} follows the story year by year.</p>`,
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
  { key: 'far', title: 'The swarm Earth allows', blurb: "On Earth's orbit beyond the Sun, fronts dark in the infrared, a shade at L1. Earth takes 1 W/m² of extra heat.", params: { earthPlacement: 'farside', forcingLimit: 1 } },
  { key: 'shell', title: 'The cautious swarm', blurb: "Spread evenly inside Earth's orbit. No shade, no change to rainfall, nothing drifting toward Earth. The same 1 W/m².", params: { earthPlacement: 'shell', forcingLimit: 1 } },
  { key: 'hot', title: 'A hotter Earth', blurb: 'The far side again, but Earth accepts 4 W/m², about as much as doubling CO₂, and the shade cancels twice as much.', params: { earthPlacement: 'farside', forcingLimit: 4 } },
];
function renderChoose() {
  const p = state.params;
  const rows = SWARMS.map(sw => {
    const q = { ...p, ...sw.params };
    const E = h.earthLimits(q);
    const d = h.compute({ ...q, coverage: 1 });
    const y = d.yearsToCoverage(E.cap);
    const fc = h.earthForcing(q, E.cap);
    return { sw, E, y, fc, rain: fc.shade * 0.76, rock: (E.mass * d.minedPerDelivered) / MERCURY.M_SHELL, q };
  });
  const active = SWARMS.find(sw => Object.entries(sw.params).every(([k, v]) => p[k] === v));
  $('choices').innerHTML = rows.map(({ sw, E }) => `<button data-swarm="${sw.key}" aria-pressed="${active && active.key === sw.key}"><b>${sw.title}</b><span>${sw.blurb}</span><span><b style="font:500 1rem/1 var(--sans)">${pct(E.cap, 1)}</b> of the Sun's light</span></button>`).join('');
  for (const b of $('choices').querySelectorAll('button')) b.addEventListener('click', () => {
    const sw = SWARMS.find(x => x.key === b.dataset.swarm);
    state.params = { ...state.params, ...sw.params };
    state.era = 'custom';
    paramsUI.rebind(state.params);
    recompute();
  });
  const line = (k, f) => `<tr><td>${k}</td>${rows.map(r => `<td class="v">${f(r)}</td>`).join('')}</tr>`;
  $('choose-table').innerHTML = `<thead><tr><th></th>${rows.map(r => `<th>${r.sw.title}</th>`).join('')}</tr></thead><tbody>
    ${line("Share of the Sun's light", r => pct(r.E.cap, r.E.cap < 0.01 ? 2 : 1))}
    ${line('Computing', r => `${sci(r.E.flops, 1)} FLOP/s`)}
    ${line('Reached around', r => yr(p.seedYear + r.y))}
    ${line('Extra heat on Earth', r => `${r.fc.net.toFixed(1)} W/m²`)}
    ${line("World's rainfall", r => (r.rain > 0 ? `−${r.rain.toFixed(1)}%` : 'unchanged'))}
    ${line('Night sky, worst case', r => `${r.E.skyLuxAtCap.toFixed(1)} lux`)}
    ${line("Mercury's rock used", r => pct(r.rock, 1))}
  </tbody>`;
}

function renderSummary() {
  const p = state.params, d = state.d, E = state.earth;
  const f = sailFacts(p);
  const s = h.swarmAt(p, E.cap);
  const nSails = (s.sailPower / s.sail.chipWm2 / p.sailArea) * s.areaFactor;
  const yCap = d.yearsToCoverage(E.cap);
  const rock = (E.mass * d.minedPerDelivered) / MERCURY.M_SHELL;
  const farside = p.earthPlacement === 'farside';
  const items = [
    ['What it is', `About ${num(words(nSails))} separate satellites. Each is a square of solar film ${num(`${Math.round(f.side)} m`)} on a side, thinner than paper, with ${num(`${words(f.chips)}`)} tiny computer chips spread over its back. There is no shell or ring: every sail flies its own orbit around the Sun.`],
    ['What it is made of', `Rock from Mercury, dug up, thrown into orbit and turned into film and chips there. The swarm described here uses ${num(pct(rock, rock < 0.1 ? 1 : 0))} of Mercury's rock.`],
    ['What stops it growing', `Not energy, not materials, but heat. Every watt the sails catch is turned into heat, and some of that heat reaches Earth. Keeping Earth's extra heating to ${num(`${p.forcingLimit} W/m²`)}, about a quarter of what doubling CO₂ does, limits the swarm to ${num(pct(E.cap, 1))} of the Sun's light.`],
    ['Where it flies', farside
      ? `On Earth's own orbit, but on the far side of the Sun. There the sails never pass between us and the Sun, and they can turn their warm backs away from us. A thin screen of sails at L1, a balance point between Earth and the Sun, shades away a little sunlight to make room for their heat. Spread evenly round the Sun instead, the same sails would be allowed only ${num(pct(E.shell, 2))}.`
      : `Spread evenly round the Sun just inside Earth's orbit, where the chips run at their temperature limit. Moved to Earth's orbit on the far side of the Sun, with a sunshade at L1, the same heat budget would allow ${num(pct(state.far.cap, 1))}.`],
    ['What it computes', `${num(`${sci(E.flops, 1)} calculations a second`)}, about ${num(words(E.flops / WORLD_AI_FLOPS_2025))} times all the AI chips on Earth in 2025. If building starts in ${num(p.seedYear)}, it gets there around ${num(yr(p.seedYear + yCap))}.`],
    ['What you would see', farside
      ? `From Earth, a band of light along the Sun's path across the sky, as bright as twilight, after sunset and before dawn. From inside the swarm, a sky split in two. From another star, a Sun ${num(pct(E.cap, 1))} dimmer, with a faint infrared glow that was never there before.`
      : `From Earth, a disc of light 60° across round the Sun after dusk. From inside, a sky of faint points and a second sun opposite the real one. From another star, a Sun ${num(pct(E.cap, 1))} dimmer with a faint infrared glow.`],
  ];
  $('summary-list').innerHTML = items.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

function renderSail() {
  const p = state.params;
  const f = sailFacts(p);
  $('sail-title').textContent = 'A sheet, not a box';
  const atLimit = h.swarmAt(p, state.earth.cap);
  const nSails = (atLimit.sailPower / atLimit.sail.chipWm2 / p.sailArea) * atLimit.areaFactor;
  const deep = (title, body) => `<details class="deep"><summary>${title}</summary>${body}</details>`;
  $('sail-prose').innerHTML = `
    <p>Each satellite is a square of solar film ${num(`${Math.round(f.side)} m`)} on a side, flown corner-first as a diamond ${num(`${Math.round(f.diag)} m`)} from tip to tip. The film is ${num('80 µm')} thick, a little thinner than office paper. Shrink the sail to the width of a room and it would be as thin as the wall of a soap bubble. It weighs ${num(kg(f.mass))}, which works only because out there nothing pushes on it except sunlight.</p>
    <p>Behind the solar cells sit ${num(words(f.chips))} tiny chips, one every ${num(length(f.pitch))}. Together they use ${num(`${f.MW.toFixed(1)} MW`)} and do ${num(`${sci(f.flops, 2)} calculations a second`)}, ${f.flops >= WORLD_AI_FLOPS_2025 ? `${num(`${(f.flops / WORLD_AI_FLOPS_2025).toFixed(1)} times`)}` : `${num(pct(f.flops / WORLD_AI_FLOPS_2025, 0))} of`} all the AI hardware on Earth in 2025. That is one sail. The swarm Earth allows has about ${num(words(nSails))} of them.</p>
    ${f.farside
      ? `<p>It flies on Earth's own orbit, but on the far side of the Sun, between a quarter and three quarters of a turn away from Earth. That spot is chosen for Earth's sake, not the chips'. From there a sail never passes between Earth and the Sun, and it can turn its warm back away from Earth.</p>
        ${deep('Why the far side costs a third of the computing', `<p>From out there Earth always sits within 45° of the Sun, on the sail's sunny side. So the cover glass carries a fine aluminium mesh that is dark in the infrared: the film can barely radiate forward, toward Earth, and pushes its heat out of the back instead. With one face doing all the radiating, the film runs hotter, and the chips run at about ${num('110 °C')}. Hot transistors need more energy per operation and hot solar cells convert less, so each watt of sunlight computes about a third less.</p><p>Spread evenly inside Earth's orbit, the same sail would settle at ${num(`${f.s.rSail.toFixed(3)} AU`)}, where its chips sit at their ${num(`${p.tjFilmC} °C`)} limit and it computes more. But Earth would then allow a swarm only ${num(`1/${Math.round(state.earth.cap / state.earth.shell)}`)} as large.</p>`)}`
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
    <details class="deep"><summary>Why a planet paved with radiators is the limit</summary><p>Bare ground at ${num('500 K')}, about the temperature of the machines, radiates only ${num(`${sci(bare, 1)} W`)} from the whole planet. Heat pumps lift the waste heat to about ${num(`${(Math.round(Tr / 50) * 50).toLocaleString('en-US')} K`)}, where each square metre radiates ${num(`${Math.round((Tr / 500) ** 4)} times`)} more. Going hotter helps only a little: at ${num('2,000 K')}, about as hot as a radiator can be built, the same planet sheds under ${num('10¹⁹ W')}, because the pumps' own work has to be radiated too.</p><p>What can still be changed is the heat each kilogram leaves behind. Digging and the first ${num('3 km/s')} leave about ${num(`${p.heatPerKg} MJ`)}. Launching all the way from the ground would leave ${num('1.8 MJ')}, and refining on the ground tens of MJ.</p></details>
    <p>Industry copies itself every ${num(`${g.doublingYearsEff.toFixed(2)} years`)}, slowed by the chip fabs it has to build. In ${num(yr(p.seedYear + g.tCap))} it hits the <em>heat wall</em>, and exports stop growing at ${num(`${sci(g.capToSails * YEAR, 2)} kg`)} a year. By ${num(Math.round(now.calendarYear))}, ${num(pct(now.mercuryRemoved, 2))} of the planet has been taken apart. The swarm Earth allows takes ${num(pct(rockUsed, rockUsed < 0.1 ? 1 : 0))} of Mercury's rock${rockOut ? `. Left alone, industry would dig out all of it by ${num(rockOut)}` : ''}.</p>`;
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
  const deep = (title, body) => `<details class="deep"><summary>${title}</summary>${body}</details>`;
  const perPct = farside
    ? `Even from the far side of the Sun, with their fronts dark in the infrared, the sails add ${num(`${(F.farsideIRPerF / 100).toFixed(2)} W/m²`)} to Earth for every 1% of sunlight they catch.`
    : `Spread evenly inside Earth's orbit, the sails add about ${num(`${forcingAt(p, 0.01).toFixed(1)} W/m²`)} to Earth for every 1% of sunlight they catch, even after you subtract the sunlight they block.`;
  const p1 = over
    ? `Left alone, industry would take this swarm to ${num(pct(ceil, 1))} of the Sun's light${farside && ceil > F.farsideGeomCap ? ', more than the far side even has room for' : ''}. Earth can't live with that. Every watt a sail catches leaves it again as heat, and some of that heat lands on Earth. ${perPct} At ${pct(ceil, 0)} that would be ${num(`${fc.toFixed(0)} W/m²`)}${consequence}.`
    : `With these assumptions industry stops at ${num(pct(ceil, 2))} of the Sun's light, within what Earth allows. Every watt the sails catch still leaves them as heat, and some of it lands on Earth. ${perPct}`;
  const whyHeat = deep('Why sails heat Earth wherever they are', `<p>A sail gets rid of everything it absorbs as infrared, from both faces or, on the far side, mostly from its back. How bright that infrared is depends on the sunlight it gets, so its distance from the Sun cancels out: all that matters is how far it is from Earth and which face it shows us.</p><p>Spread evenly inside Earth's orbit, sails surround Earth on every side and show it their warm fronts through the gaps, adding about ${num(`${forcingAt(p, 0.01).toFixed(1)} W/m²`)} per 1% even after subtracting the sunlight they block. Moving them outside Earth's orbit doesn't help: they would need more film for each watt, and Mercury's rock would run out first.</p>`);
  const shadeW = (p.thermostatCredit - 1) * p.forcingLimit;
  const p2 = farside
    ? `So the limit is the climate. The budget used here is ${num(`${p.forcingLimit} W/m²`)} of extra heat, ${co2 < 0.45 ? `about ${pct(co2, 0)} of` : `${co2.toFixed(1)} times`} what doubling CO₂ does. One more trick helps: a thin cloud of ordinary sails at L1, 1.5 million km sunward of Earth, takes a little sunlight off Earth to make room for more infrared. Letting it cancel ${num(`${shadeW.toFixed(1)} W/m²`)}, Earth allows ${num(pct(E.cap, 2))} of the Sun's light. The same sails spread evenly inside Earth's orbit would be allowed only ${num(pct(E.shell, 2))}.`
    : `So the limit is the climate. The budget used here is ${num(`${p.forcingLimit} W/m²`)} of extra heat, ${co2 < 0.45 ? `about ${pct(co2, 0)} of` : `${co2.toFixed(1)} times`} what doubling CO₂ does, and with the sails spread evenly inside Earth's orbit it allows ${num(pct(E.cap, 2))} of the Sun's light.`;
  const shadeCost = farside ? deep('What the sunshade costs', `<p>It is not a clean swap. Sunlight drives evaporation and infrared mostly doesn't, so every W/m² traded this way costs about ${num('0.76%')} of the world's rainfall, and it leaves the poles slightly warmer than before. That is why the shade is allowed to cancel only half a budget here: ${num(`${shadeW.toFixed(1)} W/m²`)}, or ${num(`${(shadeW * 0.76).toFixed(2)}%`)} of the rain.</p>`) : '';
  const p3 = `So the swarm Earth allows catches about ${num(pct(E.cap, 2))} of the Sun's light and does ${num(`${sci(E.flops, 2)} calculations a second`)}: about ${num(words(E.flops / WORLD_AI_FLOPS_2025))} times all the AI hardware on Earth in 2025, or the thinking of ${num(sci(E.flops / BRAIN_FLOPS, 1))} human brains. ${Number.isFinite(yCap) ? `It is reached around ${num(yr(p.seedYear + yCap))}.` : 'With these assumptions industry never gets there.'}`;
  const lux = E.skyLuxAtCap;
  const moons = lux / 0.25;
  const p4 = farside
    ? `What it does to the night sky is a side effect, and not a small one. From Earth the swarm is a band of even light along the path the Sun and planets follow, reaching 45° from the Sun on either side. After dark it can light the ground at up to ${num(`${lux.toFixed(1)} lux`)}, ${moons >= 1.5 ? `${Math.round(moons)} times` : 'about'} a full Moon, but how much of it you see depends on the season.`
    : `What it does to the night sky is a side effect, and not a small one. The sails beyond the Sun show Earth their sunlit faces through the gaps in the near ones, so a disc of light about 60° in radius stays up round the set Sun. At the end of twilight it lights the ground at ${num(`${lux.toFixed(2)} lux`)}, ${moons >= 1.5 ? `${Math.round(moons)} times` : 'about'} a full Moon.`;
  const season = farside ? deep('Why the night sky depends on the season', `<p>The band lies along the ecliptic, the line the Sun follows across the sky. After sunset that line sometimes rises steeply from the western horizon and sometimes lies almost flat along it. On spring evenings at mid-latitudes, and most evenings in the tropics, it stands upright, and the band towers over the horizon, lighting the ground at ${num(`${lux.toFixed(1)} lux`)} once twilight ends. On autumn evenings it lies low, and most of the band stays below the horizon.</p><p>The sails reflect ${num(pct(p.rhoVis, 1))} of the light that hits them, but there are so many that the band is ${num(`${Math.round((E.cap / ((150 / 360) * 0.5)) * p.rhoVis * 1361 / Math.PI * 93)} cd/m²`)}, as bright as the sky shortly after sunset. Wherever the Sun sinks more than 45° below the horizon, the band sets and the rest of the night is natural.</p>`) : '';
  $('earth-prose').innerHTML = `<p>${p1}</p>${whyHeat}<p>${p2}</p>${shadeCost}<p>${p3}</p><p>${p4}</p>${season}`;

  // How far the far side could go: 20 % of the Sun
  const q = { ...p, earthPlacement: 'farside' };
  const f20 = 0.2, gross20 = f20 * F.farsideIRPerF * 1.06, credit = 2.5;   // a ±60° cloud: ~6 % more infrared per 1 %
  const budget20 = gross20 / credit, rain20 = (gross20 - budget20) * 0.76;
  const flops20 = h.swarmAt(q, f20).flops;
  const y20 = h.compute({ ...q, coverage: 1 }).yearsToCoverage(f20);
  $('earth-prose-2').innerHTML = `<p>Four things decide how far this could go: Earth's heat budget, how much the sunshade may cancel, room on the far side, and Mercury's rock. Room runs out first. Within 30° of Earth's orbital plane, the far side can hold sails catching at most ${num(pct(F.farsideGeomCap, 0))} of the Sun's light. ${num('20%')} needs the swarm stretched to 60° above and below that plane.</p>
    ${deep('Room on the far side', `<p>The far side is the stretch of Earth's orbit from a quarter to three quarters of a turn away from Earth, minus 15° either side of the point straight behind the Sun, where sails would reflect near-infrared straight back at Earth. Sails can't fill more than about 90% of it without shading one another. Stretched to 60° from the orbital plane, they see Earth less squarely and send it about 6% more heat per watt.</p>`)}
    <p>Earth would then take ${num(`${gross20.toFixed(1)} W/m²`)} of infrared. Even if the shade cancelled ${num(pct(1 - 1 / credit, 0))} of that, Earth would be left with ${num(`${budget20.toFixed(1)} W/m²`)}, ${Math.abs(budget20 / EARTH.co2DoublingForcing - 1) < 0.2 ? 'about as much as doubling CO₂' : `${(budget20 / EARTH.co2DoublingForcing).toFixed(1)} times the effect of doubling CO₂`}, and the shade alone would cut the world's rainfall by about ${num(`${rain20.toFixed(0)}%`)}. Packed that densely the sails would also start to shade one another, so the real figure is lower still. That swarm would do ${num(`${sci(flops20, 1)} calculations a second`)}, ${(flops20 / far.flops).toFixed(0)} times the one Earth allows, and ${Number.isFinite(y20) ? `Mercury could supply it by ${num(yr(p.seedYear + y20))}` : 'Mercury could not supply it'}. Below is what its sky would look like.</p>
    <p>The far side has one more cost, whatever its size. A swarm this dense needs every sail kept in its own lane and every broken one caught, because anything lost there drifts back toward Earth.</p>`;
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
  renderWhen(); renderFigures(); renderSummary(); renderChoose(); renderSail(); renderComputer(); renderWhy(); renderMercury(); renderBuild(); renderEarth(); renderStar(); renderFuture();
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

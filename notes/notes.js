// The technical notes: the list of notes (top-bar menu and the links to the next and previous
// note), the contents list with the current section marked, and every chart and drawing, computed
// from the same model as the main page (src/model/hybrid.js, central assumptions).
import * as h from '../src/model/hybrid.js';
import { sci, sup, pct } from '../src/util/format.js';
import { sailAnatomy, heatPaths, lightPaths } from '../src/ui/illustrations.js';
import { windowSim } from '../src/ui/windowSim.js';
import { FIGURES } from './figures.js';

export const NOTES = [
  ['sail.html', 'The compute sail', 'One satellite, layer by layer'],
  ['compute.html', 'Chips in the film', 'Why the computer is spread through the panel'],
  ['hardware.html', 'Hardware after 2095', 'What the swarm is actually built with'],
  ['mercury.html', 'Taking Mercury apart', 'Rock, heat and the pace of the build'],
  ['sphere.html', 'Closing the sphere', 'Orbits, overlap, heat and windows'],
  ['earth.html', 'Earth inside the swarm', 'Heat, night sky and a climate by design'],
  ['pictures.html', 'How the pictures were made', 'Light, air and cameras'],
];
const here = location.pathname.split('/').pop() || 'index.html';

// ------------------------------------------------------------------------- navigation
function navigation() {
  const menu = document.getElementById('notes-menu');
  if (menu) menu.innerHTML = NOTES.map(([file, title, dek]) =>
    `<li><a href="${file}"${file === here ? ' aria-current="page"' : ''}>${title}<span>${dek}</span></a></li>`).join('');
  const i = NOTES.findIndex(n => n[0] === here);
  const on = document.getElementById('onward');
  if (on && i >= 0) {
    const prev = NOTES[i - 1], next = NOTES[i + 1];
    on.innerHTML = (prev ? `<a href="${prev[0]}"><span>Previous note</span><b>${prev[1]}</b></a>` : '<a href="../index.html"><span>Back to</span><b>A Dyson Swarm, Made Real</b></a>')
      + (next ? `<a class="next" href="${next[0]}"><span>Next note</span><b>${next[1]}</b></a>` : '<a class="next" href="../index.html"><span>Back to</span><b>A Dyson Swarm, Made Real</b></a>');
  }
  const kick = document.getElementById('note-no');
  if (kick && i >= 0) kick.textContent = `Technical note ${i + 1} of ${NOTES.length}`;
}

function contents() {
  const heads = [...document.querySelectorAll('.note h2[id]:not(.plain)')];
  if (!heads.length) return;
  const items = heads.map((h2, k) => `<li><a href="#${h2.id}">${k + 1}. ${h2.textContent}</a></li>`).join('');
  const side = document.getElementById('toc');
  if (side) side.innerHTML = `<b>Contents</b><ol>${items}</ol>`;
  const mob = document.getElementById('toc-m');
  if (mob) mob.innerHTML = `<summary>Contents</summary><ol>${heads.map(h2 => `<li><a href="#${h2.id}">${h2.textContent}</a></li>`).join('')}</ol>`;
  if (!side) return;
  const links = [...side.querySelectorAll('a')];
  const mark = () => {
    let k = 0;
    heads.forEach((h2, j) => { if (h2.getBoundingClientRect().top < 140) k = j; });
    links.forEach((a, j) => a.classList.toggle('on', j === k));
  };
  addEventListener('scroll', mark, { passive: true });
  mark();
}

// ------------------------------------------------------------------------- charts
const AX = 'stroke:var(--rule);stroke-width:1';
const TK = 'fill:var(--ink-3);font:12px var(--sans)';
const LB = 'fill:var(--ink-2);font:12px var(--sans)';
const TT = 'fill:var(--ink);font:500 12.5px var(--sans)';
const HALO = ';paint-order:stroke;stroke:var(--paper);stroke-width:4px;stroke-linejoin:round';   // labels stay legible over lines

/**
 * A line chart: one x scale, one y scale (either may be logarithmic), hairline grid, labelled
 * marks and points, and a crosshair whose tooltip comes from tip(x).
 */
function lineChart(el, { W = 720, H = 360, x, y, series, marks = [], hlines = [], points = [], tip, legend = true }) {
  const L = 62, R = 20, T = 30, B = 46;
  const tx = v => (x.log ? Math.log10(v) : v), ty = v => (y.log ? Math.log10(v) : v);
  const X = v => L + ((tx(v) - tx(x.min)) / (tx(x.max) - tx(x.min))) * (W - L - R);
  const Y = v => T + (1 - (ty(Math.min(y.max, Math.max(y.min, v))) - ty(y.min)) / (ty(y.max) - ty(y.min))) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${y.title} against ${x.title}">`;
  for (const v of y.ticks) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" style="${AX}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" style="${TK}">${y.fmt(v)}</text>`;
  for (const v of x.ticks) s += `<text x="${X(v)}" y="${H - B + 20}" text-anchor="middle" style="${TK}">${x.fmt(v)}</text>`;
  s += `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" style="stroke:var(--ink-3);stroke-width:1"/>`;
  s += `<text x="${L}" y="${T - 14}" style="${TT}">${y.title}</text>`;
  s += `<text x="${W - R}" y="${H - 6}" text-anchor="end" style="${LB}">${x.title}</text>`;
  for (const m of hlines) s += `<line x1="${L}" x2="${W - R}" y1="${Y(m.y)}" y2="${Y(m.y)}" style="stroke:${m.color || 'var(--ink-3)'};stroke-width:1;stroke-dasharray:4 4"/><text x="${m.left ? L + 6 : W - R - 4}" y="${Y(m.y) - 6}" text-anchor="${m.left ? 'start' : 'end'}" style="${LB}${HALO}">${m.label}</text>`;
  for (const m of marks) s += `<line x1="${X(m.x)}" x2="${X(m.x)}" y1="${T}" y2="${H - B}" style="stroke:var(--ink-3);stroke-width:1;stroke-dasharray:2 4"/><text x="${X(m.x) + (m.right ? -5 : 5)}" y="${T + 12 + (m.dy || 0)}" text-anchor="${m.right ? 'end' : 'start'}" style="${LB}${HALO}">${m.label}</text>`;
  for (const sr of series) {
    // points outside the y range break the line rather than being drawn along its edge
    let d = '', pen = false;
    for (const [a, b] of sr.pts) {
      const ok = Number.isFinite(b) && b >= y.min && b <= y.max && (!y.log || b > 0);
      if (ok) { d += `${pen ? 'L' : 'M'}${X(a).toFixed(1)},${Y(b).toFixed(1)}`; }
      pen = ok;
    }
    s += `<path d="${d}" style="fill:none;stroke:${sr.color};stroke-width:2;stroke-linejoin:round${sr.dash ? ';stroke-dasharray:6 4' : ''}"/>`;
    if (sr.end) {   // a direct label beside the line, at sr.end.at along x (or its last point)
      const pts = sr.pts.filter(([, b]) => Number.isFinite(b) && b >= y.min && b <= y.max);
      const [ex, ey] = sr.end.at != null ? pts.reduce((m, q) => (Math.abs(q[0] - sr.end.at) < Math.abs(m[0] - sr.end.at) ? q : m)) : pts[pts.length - 1];
      s += `<text x="${X(ex) + (sr.end.dx ?? 0)}" y="${Y(ey) + (sr.end.dy ?? -8)}" text-anchor="${sr.end.anchor ?? 'end'}" style="fill:var(--ink);font:500 12px var(--sans)${HALO}">${sr.end.text}</text>`;
    }
  }
  for (const pt of points) s += `<circle cx="${X(pt.x)}" cy="${Y(pt.y)}" r="4" style="fill:var(--paper);stroke:${pt.color || 'var(--ink)'};stroke-width:2"/><text x="${X(pt.x) + (pt.left ? -8 : 8)}" y="${Y(pt.y) + (pt.dy ?? -8)}" text-anchor="${pt.left ? 'end' : 'start'}" style="${LB}${HALO}">${pt.label}</text>`;
  s += `<line class="xh" y1="${T}" y2="${H - B}" style="stroke:var(--ink-3);stroke-width:1" visibility="hidden"/></svg>`;
  el.innerHTML = s + (legend ? `<div class="legend">${series.filter(sr => sr.label).map(sr => `<span><i class="${sr.dash ? 'dash' : ''}" style="background:${sr.color};color:${sr.color}"></i>${sr.label}</span>`).join('')}</div>` : '');
  if (!tip) return;
  const svg = el.querySelector('svg'), line = svg.querySelector('.xh');
  const box = document.createElement('div'); box.className = 'tip'; box.hidden = true; el.appendChild(box);
  const inv = u => { const t = tx(x.min) + u * (tx(x.max) - tx(x.min)); return x.log ? 10 ** t : t; };
  svg.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), k = r.width / W;
    const u = Math.max(0, Math.min(1, ((e.clientX - r.left) / k - L) / (W - L - R)));
    const v = inv(u);
    line.setAttribute('x1', X(v)); line.setAttribute('x2', X(v)); line.setAttribute('visibility', 'visible');
    box.innerHTML = tip(v); box.hidden = false;
    box.style.left = `${Math.max(80, Math.min(r.width - 80, X(v) * k))}px`;
    box.style.top = `${(T + 30) * k}px`;
  });
  svg.addEventListener('pointerleave', () => { box.hidden = true; line.setAttribute('visibility', 'hidden'); });
}

const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
const P = h.eraParams('mid');
let D = null;
const model = () => (D ??= h.compute({ ...P }));
const yearOf = f => { const t = model().yearsToCoverage(Math.min(f, 0.9999) * h.FIXED.closedRoom); return Math.round(P.seedYear + t); };
// the year the sphere closes, as the main page counts it (app.js state.moments.cap)
const closedYear = () => Math.round(P.seedYear + model().yearsToCoverage(h.earthLimits(P, model()).cap * (1 - 1e-5)));
const sigma = 5.670374419e-8;
const fluxAt = r => 1361 / r ** 2;
const sharePct = f => pct(f, 2);
const lead = s => `<b>${s}</b>`;

const CHARTS = {
  // Where a lone sail can fly: its chips' temperature against its distance from the Sun.
  filmTemp(el) {
    const glass = r => (P.alpha * fluxAt(r) / ((P.epsFront + P.epsBack) * sigma)) ** 0.25 + P.filmSpreadDT - 273.15;
    const dark = r => (P.alpha * fluxAt(r) / ((h.FIXED.epsFrontBuild + P.epsBack) * sigma)) ** 0.25 + P.filmSpreadDT - 273.15;
    const rs = range(0.55, 1.1, 110);
    const rT = h.swarmAt(P, 0.01).rSail, closedC = h.closedFilmT(P, 1) + P.filmSpreadDT - 273.15;
    lineChart(el, {
      x: { min: 0.55, max: 1.1, ticks: [0.6, 0.7, 0.8, 0.9, 1.0, 1.1], fmt: v => `${v.toFixed(1)} AU`, title: 'distance from the Sun' },
      y: { min: 40, max: 200, ticks: [50, 85, 100, 125, 150, 175, 200], fmt: v => `${v} °C`, title: 'Chip temperature' },
      series: [
        { pts: rs.map(r => [r, glass(r)]), color: 'var(--sun)', label: 'Glass front: radiates from both faces', end: { text: 'glass front', at: 1.06 } },
        { pts: rs.map(r => [r, dark(r)]), color: 'var(--heat)', label: 'Infrared-dark front: radiates from the back only', dash: true, end: { text: 'dark front', at: 1.06 } },
      ],
      hlines: [{ y: 85, label: 'the chips’ 85 °C limit', left: true }],
      marks: [{ x: rT, label: `${rT.toFixed(3)} AU`, right: true }, { x: 0.95, label: 'the sphere, 0.95 AU', dy: 16 }],
      points: [{ x: 0.95, y: closedC, label: `closed sphere: ${Math.round(closedC)} °C`, color: 'var(--heat)' }],
      tip: r => `${lead(`${r.toFixed(3)} AU`)}, ${Math.round(fluxAt(r))} W/m²<br>glass front ${Math.round(glass(r))} °C · dark front ${Math.round(dark(r))} °C`,
    });
  },
  // The size trade: the share of a sail's mass that is fixed hardware, by its side.
  sizeTrade(el) {
    // design study (docs/data/design_spec.json, sizing_rationale.size_trade): fixed mass ~0.34 t
    const pts = [[82, 0.191, 8.1], [142, 0.0744, 14.1], [260, 0.0237, 25.7], [450, 0.0081, 44.5], [822, 0.0024, 81.3]];
    const at = side => { let i = pts.findIndex(q => q[0] >= side); if (i === 0) i = 1; if (i < 0) i = pts.length - 1; const [a, b] = [pts[i - 1], pts[i]]; const u = Math.log(side / a[0]) / Math.log(b[0] / a[0]); return [Math.exp(Math.log(a[1]) + u * Math.log(b[1] / a[1])), a[2] + u * (b[2] - a[2])]; };
    const xs = range(Math.log(70), Math.log(900), 100).map(Math.exp);
    lineChart(el, {
      x: { min: 70, max: 900, log: true, ticks: [100, 200, 279, 500, 800], fmt: v => `${v} m`, title: 'side of the sail' },
      y: { min: 0.002, max: 0.3, log: true, ticks: [0.003, 0.01, 0.03, 0.1, 0.3], fmt: v => `${+(v * 100).toPrecision(2)}%`, title: 'Share of the sail’s mass that is hub, vanes and tensioners' },
      series: [{ pts: xs.map(x => [x, at(x)[0]]), color: 'var(--ink-2)', label: '' }],
      points: [{ x: 82, y: 0.191, label: '82 m: a fifth of the mass', dy: -10 }, { x: 279, y: at(279)[0], label: '279 m: 2.4%', dy: -10 }, { x: 822, y: 0.0024, label: '822 m', left: true, dy: -10 }],
      tip: x => `${lead(`${Math.round(x)} m`)}: fixed hardware ${(at(x)[0] * 100).toFixed(1)}% of the mass<br>full shadow ${Math.round(at(x)[1])} km long`,
      legend: false,
    });
  },
  // Mass of the swarm per watt of chips against the share of chip power put in pods.
  podShare(el) {
    const qs = range(0, 0.3, 60);
    const at = (p, q) => h.swarmAt({ ...p, podFrac: q }, 0.01).kgPerW * 1e3;
    const p26 = h.eraParams('2026');
    lineChart(el, {
      x: { min: 0, max: 0.3, ticks: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3], fmt: v => `${Math.round(v * 100)}%`, title: 'share of chip power in pods' },
      y: { min: 0, max: 2.5, ticks: [0, 0.5, 1, 1.5, 2, 2.5], fmt: v => `${v} g/W`, title: 'Swarm mass per watt of chips' },
      series: [
        { pts: qs.map(q => [q, at(P, q)]), color: 'var(--swarm)', label: 'Hardware after 2095 (central)' },
        { pts: qs.map(q => [q, at(p26, q)]), color: 'var(--ink-3)', label: '2026 hardware', dash: true },
      ],
      points: [{ x: P.podFrac, y: at(P, P.podFrac), label: `central: ${Math.round(P.podFrac * 100)}%, ${at(P, P.podFrac).toFixed(2)} g/W`, dy: 18 }, { x: 0.15, y: at(p26, 0.15), label: `2026 design: 15%, ${at(p26, 0.15).toFixed(2)} g/W`, dy: -10 }],
      tip: q => `${lead(`${(q * 100).toFixed(1)}% in pods`)}<br>after 2095: ${at(P, q).toFixed(2)} g/W (${(at(P, q) / at(P, 0)).toFixed(2)}× all-sail)<br>2026: ${at(p26, q).toFixed(2)} g/W`,
    });
  },
  // Energy per operation against junction temperature.
  hotLogic(el) {
    const ts = range(60, 175, 115);
    const rel = (t, slope) => h.energyPenalty(t, slope);
    const pts = [[85, 'sails on their own orbit'], [Math.round(h.closedFilmT(P, 0.01) + P.filmSpreadDT - 273.15), 'sphere, sparse'], [Math.round(h.closedFilmT(P, 1) + P.filmSpreadDT - 273.15), 'sphere, closed']];
    lineChart(el, {
      x: { min: 60, max: 175, ticks: [60, 85, 100, 125, 150, 175], fmt: v => `${v} °C`, title: 'chip junction temperature' },
      y: { min: 0.9, max: 2.4, ticks: [1, 1.25, 1.5, 1.75, 2, 2.25], fmt: v => `${v.toFixed(2)}×`, title: 'Energy per operation, relative to 85 °C' },
      series: [
        { pts: ts.map(t => [t, rel(t, P.hotLogicSlope)]), color: 'var(--heat)', label: 'After 2095: +0.56% per kelvin' },
        { pts: ts.map(t => [t, rel(t, null)]), color: 'var(--ink-3)', label: '2026 logic re-optimised for heat', dash: true },
      ],
      points: pts.map(([t, label], i) => ({ x: t, y: rel(t, P.hotLogicSlope), label: `${label}, ${t} °C`, left: i === 2, dy: i === 2 ? -10 : 18 })),
      tip: t => `${lead(`${Math.round(t)} °C`)}<br>after 2095: ${rel(t, P.hotLogicSlope).toFixed(2)}× · 2026: ${rel(t, null).toFixed(2)}×`,
    });
  },
  // The build-out: share of the Sun caught, and share of Mercury taken apart, by year.
  timeline(el) {
    const d = model(), g = d.growth, M = 3.3011e23;
    const ys = range(P.seedYear, 2420, 370 * 2);
    const f = yr => h.coverageForMass(P, g.builtAtYear(yr - P.seedYear));
    const merc = yr => h.minedFor(P, g.deliveredBy(yr - P.seedYear)) / M;
    lineChart(el, {
      x: { min: P.seedYear, max: 2420, ticks: [2050, 2100, 2150, 2200, 2250, 2300, 2350, 2400], fmt: v => `${v}`, title: 'year' },
      y: { min: 1e-12, max: 1, log: true, ticks: [1e-12, 1e-10, 1e-8, 1e-6, 1e-4, 1e-2, 1], fmt: v => (v >= 0.01 ? `${v * 100}%` : `10${sup(Math.round(Math.log10(v)) + 2)}%`), title: 'Share (logarithmic)' },
      series: [
        { pts: ys.map(yr => [yr, f(yr)]), color: 'var(--sun)', label: 'Share of the Sun’s light caught' },
        { pts: ys.map(yr => [yr, merc(yr)]), color: 'var(--ink-2)', label: 'Share of Mercury taken apart', dash: true },
      ],
      marks: [{ x: P.seedYear + g.tCap, label: `heat wall ${Math.round(P.seedYear + g.tCap)}`, right: true }, { x: P.seedYear + g.tMantleOut, label: `crust and mantle gone ${Math.round(P.seedYear + g.tMantleOut)}`, dy: 120 }, { x: closedYear(), label: `closed ${closedYear()}`, right: true, dy: 150 }],
      tip: yr => `${lead(Math.round(yr))}<br>Sun caught: ${sharePct(f(yr))}<br>Mercury taken apart: ${sharePct(merc(yr))}`,
    });
  },
  // After the wall: the same two shares on a linear scale, from the wall to closure.
  fill(el) {
    const d = model(), g = d.growth, M = 3.3011e23;
    const ys = range(2130, 2400, 540);
    const f = yr => h.coverageForMass(P, g.builtAtYear(yr - P.seedYear));
    const merc = yr => h.minedFor(P, g.deliveredBy(yr - P.seedYear)) / M;
    const mantle = P.seedYear + g.tMantleOut;
    lineChart(el, {
      x: { min: 2130, max: 2400, ticks: [2150, 2200, 2250, 2300, 2350, 2400], fmt: v => `${v}`, title: 'year' },
      y: { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: v => `${v * 100}%`, title: 'Share' },
      series: [
        { pts: ys.map(yr => [yr, f(yr)]), color: 'var(--sun)', label: 'Share of the Sun’s light caught' },
        { pts: ys.map(yr => [yr, merc(yr)]), color: 'var(--ink-2)', label: 'Share of Mercury taken apart', dash: true },
      ],
      marks: [{ x: P.seedYear + g.tCap, label: 'heat wall', dy: 0 }, { x: mantle, label: 'rock gone; the core from here', dy: 150 }, { x: closedYear(), label: `closed ${closedYear()}`, right: true, dy: 150 }],
      points: [{ x: mantle, y: f(mantle), label: `${Math.round(f(mantle) * 100)}% in ${Math.round(mantle)}`, dy: -10 }],
      tip: yr => `${lead(Math.round(yr))}<br>Sun caught: ${sharePct(f(yr))}<br>Mercury taken apart: ${sharePct(merc(yr))}`,
    });
  },
  // Sails flown per sail lit, against coverage: formation bands and independent orbits.
  overlap(el) {
    const Fs = range(0.005, 0.995, 198);
    const band = F => h.bandArea(F) / F, rnd = F => -Math.log(1 - F) / F;
    lineChart(el, {
      x: { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: v => `${Math.round(v * 100)}%`, title: 'share of the Sun caught' },
      y: { min: 1, max: 5, ticks: [1, 1.5, 2, 3, 4, 5], fmt: v => `${v}×`, title: 'Sails flown for every sail lit' },
      series: [
        { pts: Fs.map(F => [F, band(F)]), color: 'var(--swarm)', label: 'Formation bands sharing one axis (the least possible)' },
        { pts: Fs.map(F => [F, rnd(F)]), color: 'var(--ink-3)', label: 'Independent orbits, overlapping at random', dash: true },
      ],
      hlines: [{ y: Math.PI / 2, label: 'π/2 = 1.57, closed', left: true }],
      points: [0.1, 0.5, 0.9, 0.99].map(F => ({ x: F, y: band(F), label: `${band(F).toFixed(2)}`, dy: F > 0.95 ? -10 : 18, left: F > 0.95 })),
      tip: F => `${lead(`${(F * 100).toFixed(1)}% caught`)}<br>bands: ${band(F).toFixed(3)}× · random: ${rnd(F).toFixed(2)}×`,
    });
  },
  // The closed swarm's computing against coverage, and what the heat costs.
  cavity(el) {
    const fs = range(0.01, 1, 99);
    const at = f => h.swarmAt(P, f);
    const cool = f => at(0.01).flops * (f / 0.01);
    lineChart(el, {
      x: { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: v => `${Math.round(v * 100)}%`, title: 'share of the Sun caught' },
      y: { min: 0, max: 3e40, ticks: [0, 1e40, 2e40, 3e40], fmt: v => (v ? `${v / 1e40}×10⁴⁰` : '0'), title: 'Computing, FLOP/s' },
      series: [
        { pts: fs.map(f => [f, at(f).flops]), color: 'var(--swarm)', label: 'Closed swarm: the sails run hotter as the gaps close' },
        { pts: fs.map(f => [f, cool(f)]), color: 'var(--ink-3)', label: 'If every sail stayed as cool as in a sparse swarm', dash: true },
      ],
      points: [{ x: 0.5, y: at(0.5).flops, label: `half: ${sci(at(0.5).flops, 2)}`, left: true, dy: -10 }, { x: 1, y: at(1).flops, label: `closed: ${sci(at(1).flops, 2)}`, left: true, dy: 18 }],
      tip: f => { const s = at(f); return `${lead(`${Math.round(f * 100)}% caught`)}<br>${sci(s.flops, 2)} FLOP/s · film ${Math.round(s.filmT)} K, chips ${Math.round(s.filmT + P.filmSpreadDT - 273.15)} °C`; },
    });
  },
  // Heat the open sphere sends Earth, before the window is narrowed to cancel it.
  earthHeat(el) {
    const fs = range(0.001, 0.999, 200);
    const fc = f => h.earthForcing(P, f * h.FIXED.closedRoom);
    lineChart(el, {
      x: { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: v => `${Math.round(v * 100)}%`, title: 'share of the Sun caught' },
      y: { min: 0, max: 10, ticks: [0, 2, 4, 6, 8, 10], fmt: v => `${v}`, title: 'Extra heat on Earth, W/m², before the window narrows' },
      series: [{ pts: fs.map(f => [f, fc(f).gross]), color: 'var(--heat)', label: '' }],
      hlines: [{ y: 3.93, label: 'one CO₂ doubling, 3.93 W/m²', left: true }, { y: h.FIXED.capIR, label: `closed: the cap’s back, ${h.FIXED.capIR} W/m²` }],
      points: [{ x: 0.5, y: fc(0.5).gross, label: `half built: ${fc(0.5).gross.toFixed(1)} W/m²`, dy: -10, left: true }],
      tip: f => { const q = fc(f); return `${lead(`${(f * 100).toFixed(1)}% caught`)}<br>heat ${q.gross.toFixed(2)} W/m²<br>window narrowed ${pct(q.sunlightCut, 2)} · rain −${pct(q.rainCut, 1)}`; },
      legend: false,
    });
  },
  // Light on the ground at the end of twilight, by coverage.
  glow(el) {
    const fs = range(0.001, 0.999, 200);
    const lux = f => h.skyLux(P, f * h.FIXED.closedRoom);
    const cd = f => f * (1 - f) * P.rhoVis * (1361 / 0.95 ** 2) / Math.PI * h.FIXED.lumensPerW;
    lineChart(el, {
      x: { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: v => `${Math.round(v * 100)}%`, title: 'share of the Sun caught' },
      y: { min: 0, max: 30, ticks: [0, 5, 10, 15, 20, 25, 30], fmt: v => `${v} lux`, title: 'Light on the ground, Sun 18° below the horizon' },
      series: [{ pts: fs.map(f => [f, lux(f)]), color: 'var(--swarm)', label: '' }],
      hlines: [{ y: 0.25, label: 'full Moon, 0.25 lux', left: true }, { y: 15, label: 'a lit street, 10–20 lux' }],
      points: [{ x: 0.5, y: lux(0.5), label: `half: ${lux(0.5).toFixed(0)} lux`, dy: -10 }],
      tip: f => `${lead(`${(f * 100).toFixed(1)}% caught`)}<br>${lux(f).toFixed(2)} lux on the ground<br>the glow itself ${cd(f) >= 1 ? cd(f).toFixed(1) : cd(f).toPrecision(2)} cd/m²`,
      legend: false,
    });
  },
  // How far from the Sun the sky is dark or glowing, through the year.
  disc(el) {
    const ds = range(0, 365, 365);
    const dist = day => 1 - 0.0167 * Math.cos((2 * Math.PI * (day - 3)) / 365.25);
    const edge = (r, day) => { const q = r / dist(day); return q >= 1 ? 90 : (Math.asin(q) * 180) / Math.PI; };
    const date = day => new Date(Date.UTC(2026, 0, 1 + Math.round(day))).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    lineChart(el, {
      x: { min: 0, max: 365, ticks: [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], fmt: v => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][[0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334].indexOf(v)], title: 'date' },
      y: { min: 65, max: 90, ticks: [65, 70, 75, 80, 85, 90], fmt: v => `${v}°`, title: 'Angle from the Sun to the edge' },
      series: [
        { pts: ds.map(dd => [dd, edge(0.98, dd)]), color: 'var(--ink)', label: 'Closed: the black disc (the cap at 0.98 AU)' },
        { pts: ds.map(dd => [dd, edge(0.95, dd)]), color: 'var(--swarm)', label: 'Open: the glowing disc (the shell at 0.95 AU)', dash: true },
      ],
      marks: [{ x: 233, label: '22 Aug (the lake)', right: true }, { x: 264, label: '22 Sep (orbit)', dy: 16 }],
      tip: dd => `${lead(date(dd))}: Earth ${dist(dd).toFixed(4)} AU out<br>black disc ${edge(0.98, dd).toFixed(1)}° · glow ${edge(0.95, dd).toFixed(1)}°`,
    });
  },
};

// ------------------------------------------------------------------------- drawings
const DRAWINGS = {
  anatomy(el) {
    // the page's sail: the closed swarm's, at 0.95 AU while the sphere is sparse (app.js sailFacts)
    const s = h.swarmAt(P, 0.01), kS = (s.rSail / s.rOrbit) ** 2;
    const W = s.sail.chipWm2 * P.sailArea * kS, side = 279.01 * Math.sqrt(P.sailArea / 69543);
    sailAnatomy(el, { side, diag: side * Math.SQRT2, pitchMm: (s.sail.chipPitch / Math.sqrt(kS)) * 1e3, chipW: P.chipPower, mw: W / 1e6, chips: W / P.chipPower, lanes: true, thin: true, closed: true });
  },
  heatpaths(el) {
    const s = h.swarmAt(P, 0.01);
    heatPaths(el, { sailGW: s.sail.kgPerW * 1e3, podGW: s.pod.kgPerW * 1e3, chipW: P.chipPower });
  },
  lightpaths(el) { lightPaths(el); },
  windowsim(el) { windowSim(el, { cut: h.earthLimits(P, model()).forcing.sunlightCut }); },
};

navigation();
contents();
for (const el of document.querySelectorAll('[data-chart]')) {
  try { CHARTS[el.dataset.chart](el); } catch (e) { console.error(e); el.textContent = 'This chart could not be drawn.'; }
}
for (const el of document.querySelectorAll('[data-draw]')) {
  try { (DRAWINGS[el.dataset.draw] ?? FIGURES[el.dataset.draw])(el); } catch (e) { console.error(e); }
}

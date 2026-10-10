// SVG charts for the essay. Every mark, tick and label is placed with one scale per axis.
import { sci, pct, sup } from '../util/format.js';

const AX = 'stroke:var(--line);stroke-width:1';
const TK = 'fill:var(--muted);font:11px var(--font-mono)';
const LB = 'fill:var(--fg);font:500 11.5px var(--font-mono)';

/**
 * Coverage (log) against calendar year. x uses a piecewise scale so the fast early decades and
 * the slow later centuries both get room: xOf(yearsSinceSeed) -> 0..1.
 */
export function buildChart(el, { curves, markers, hlines, cursor, xOf, seedYear, span, yMin = -8 }) {
  const W = 900, H = 330, L = 54, R = 16, T = 14, B = 34;
  const X = t => L + xOf(Math.max(0, Math.min(span, t))) * (W - L - R);
  const Y = f => T + (1 - (Math.log10(Math.max(f, 10 ** yMin)) - yMin) / (0 - yMin)) * (H - T - B);
  const yTicks = [];
  for (let e = yMin; e <= 0; e += 2) yTicks.push(e);
  const xTicks = [0, 25, 50, 75, 100, 250, 500, 1000, 1500].filter(t => t <= span);
  const path = pts => pts.map(([t, f], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(f).toFixed(1)}`).join('');
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Share of sunlight captured by the swarm against year">`;
  svg += yTicks.map(e => `<line x1="${L}" x2="${W - R}" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}" style="${AX}"/><text x="${L - 6}" y="${Y(10 ** e) + 4}" text-anchor="end" style="${TK}">${e === 0 ? '100%' : e === -2 ? '1%' : `10${sup(e + 2)}%`}</text>`).join('');
  svg += xTicks.map(t => `<line x1="${X(t)}" x2="${X(t)}" y1="${H - B}" y2="${H - B + 4}" style="${AX}"/><text x="${X(t)}" y="${H - B + 17}" text-anchor="middle" style="${TK}">${seedYear + t}</text>`).join('');
  for (const hl of hlines || []) {
    const y = Y(hl.f);
    svg += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" style="stroke:${hl.color};stroke-width:1.2;stroke-dasharray:5 4"/>`;
    svg += `<text x="${W - R - 4}" y="${y - 5}" text-anchor="end" style="fill:${hl.color};font:500 11px var(--font-mono)">${hl.label}</text>`;
  }
  for (const c of curves) {
    svg += `<path d="${path(c.pts)}" fill="none" stroke="${c.color}" stroke-width="${c.width || 2}" stroke-opacity="${c.opacity ?? 1}" stroke-linejoin="round"${c.dash ? ` stroke-dasharray="${c.dash}"` : ''}/>`;
  }
  // markers along the main curve: close neighbours share one label; others stagger in rows
  const ms = (markers || []).filter(m => Number.isFinite(m.t) && m.t <= span).sort((a, b) => a.t - b.t);
  const merged = [];
  for (const m of ms) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(X(m.t) - X(prev.t)) < 24) prev.label += ` · ${m.label}`;
    else merged.push({ ...m });
  }
  // place each label in the first slot (above, then below the point) whose box hits no other label
  const boxes = [];
  const hits = bx => boxes.some(o => bx.x0 < o.x1 && bx.x1 > o.x0 && bx.y0 < o.y1 && bx.y1 > o.y0);
  for (const m of merged) {
    const x = X(m.t), y = Y(m.f);
    const w = m.label.length * 7 + 4;
    const right = x > W - 220;
    const x0 = right ? x - 6 - w : Math.max(L + 2, x + 6);
    let ly = null;
    for (const dy of [-12, -27, -42, 18, 33, 48]) {
      const cand = y + dy;
      if (cand < T + 10 || cand > H - B - 4) continue;
      const bx = { x0, x1: x0 + w, y0: cand - 11, y1: cand + 3 };
      if (!hits(bx)) { ly = cand; boxes.push(bx); break; }
    }
    if (ly === null) ly = Math.max(T + 10, y - 12);
    svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="${m.color || 'var(--sun)'}" stroke="var(--bg)" stroke-width="1.5"/>`;
    svg += `<text x="${right ? x - 6 : x0}" y="${ly}" style="${LB}" ${right ? 'text-anchor="end"' : ''}>${m.label}</text>`;
  }
  if (cursor) {
    const x = X(cursor.t);
    svg += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" style="stroke:var(--fg);stroke-width:1;stroke-opacity:0.6"/>`;
    if (cursor.f > 0) svg += `<circle cx="${x}" cy="${Y(cursor.f)}" r="5" fill="var(--fg)" stroke="var(--bg)" stroke-width="2"/>`;
  }
  svg += `<rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>`;
  svg += `</svg>`;
  el.innerHTML = svg;
  return { L, R, W };
}

/** Added energy absorbed by Earth (W/m²) against coverage, with reference lines. */
export function earthChart(el, { pts, safeF, ceilingF, runaway, co2 }) {
  const W = 900, H = 300, L = 54, R = 16, T = 14, B = 34;
  const xMin = -5, xMax = 0, yMin = -3, yMax = 3;
  const X = f => L + ((Math.log10(f) - xMin) / (xMax - xMin)) * (W - L - R);
  const Y = v => T + (1 - (Math.log10(Math.max(v, 10 ** yMin)) - yMin) / (yMax - yMin)) * (H - T - B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Extra heat absorbed by Earth against the share of sunlight captured">`;
  const yLabel = { '-3': '0.001', '-2': '0.01', '-1': '0.1', 0: '1', 1: '10', 2: '100', 3: '1000' };
  for (let e = yMin; e <= yMax; e++) svg += `<line x1="${L}" x2="${W - R}" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}" style="${AX}"/><text x="${L - 6}" y="${Y(10 ** e) + 4}" text-anchor="end" style="${TK}">${yLabel[e]}</text>`;
  for (let e = xMin; e <= xMax; e++) svg += `<text x="${X(10 ** e)}" y="${H - B + 17}" text-anchor="middle" style="${TK}">${pct(10 ** e, 0)}</text><line x1="${X(10 ** e)}" x2="${X(10 ** e)}" y1="${H - B}" y2="${H - B + 4}" style="${AX}"/>`;
  const ref = (v, label, color) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:${color};stroke-width:1.2;stroke-dasharray:5 4"/><text x="${L + 6}" y="${Y(v) - 5}" style="fill:${color};font:500 11px var(--font-mono)">${label}</text>`;
  svg += ref(1, '1 W/m²: the Earth-safe budget used here', 'var(--ok)');
  svg += ref(co2, `${co2} W/m²: one CO₂ doubling`, 'var(--sun)');
  svg += ref(runaway, `${Math.round(runaway)} W/m²: runaway greenhouse`, 'var(--warn)');
  const d = pts.filter(([f]) => f >= 10 ** xMin).map(([f, v], i) => `${i ? 'L' : 'M'}${X(f).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  svg += `<path d="${d}" fill="none" stroke="var(--cool)" stroke-width="2.2"/>`;
  const mark = (f, label, color, below) => {
    if (!(f > 10 ** xMin)) return '';
    const x = X(f);
    return `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" style="stroke:${color};stroke-width:1;stroke-opacity:0.7"/><text x="${x + (x > W - 200 ? -6 : 6)}" y="${below ? H - B - 8 : T + 12}" ${x > W - 200 ? 'text-anchor="end"' : ''} style="fill:${color};font:500 11px var(--font-mono)">${label}</text>`;
  };
  svg += mark(safeF, `safe: ${pct(safeF, 2)}`, 'var(--ok)', true);
  svg += mark(ceilingF, `buildable: ${pct(ceilingF, 1)}`, 'var(--warn)', false);
  svg += `</svg>`;
  el.innerHTML = svg;
}

// Spectrum of the whole system seen from far away, as λL_λ / L☉ (energy per log-wavelength).
// A blackbody of luminosity L has λL_λ = L · (15/π⁴) x⁴ / (eˣ − 1), x = hc / (λ k T): the curve's
// height depends only on L, so the swarm's infrared hump is as tall as the sunlight it absorbs.
const HC_K = 0.0143877688; // m·K
const shape = x => (15 / Math.PI ** 4) * x ** 4 / Math.expm1(x);
export function sedChart(el, { f, T }) {
  const W = 900, H = 260, L = 54, R = 16, Tp = 14, B = 34;
  const pts = [];
  for (let i = 0; i <= 240; i++) {
    const lgl = -7 + (i / 240) * 3.3;                // 0.1 µm .. 200 µm
    const lam = 10 ** lgl;
    pts.push({ lam, sun: (1 - f) * shape(HC_K / (lam * 5772)), swarm: f * shape(HC_K / (lam * T)) });
  }
  const x = lam => L + ((Math.log10(lam) + 7) / 3.3) * (W - L - R);
  const ymin = -5, ymax = 0;
  const y = v => Tp + (1 - (Math.log10(Math.max(v, 1e-9)) - ymin) / (ymax - ymin)) * (H - Tp - B);
  const path = key => pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.lam).toFixed(1)},${Math.min(H - B, y(q[key])).toFixed(1)}`).join('');
  const area = key => `${path(key)}L${x(pts[pts.length - 1].lam).toFixed(1)},${H - B}L${x(pts[0].lam).toFixed(1)},${H - B}Z`;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spectrum of the Sun and the swarm seen from far away">`;
  svg += `<rect x="${x(3.8e-7)}" y="${Tp}" width="${x(7.5e-7) - x(3.8e-7)}" height="${H - Tp - B}" fill="var(--fg)" fill-opacity="0.05"/>`;
  svg += `<text x="${(x(3.8e-7) + x(7.5e-7)) / 2}" y="${Tp + 12}" text-anchor="middle" style="${TK}">visible</text>`;
  for (let e = ymin; e <= ymax; e++) svg += `<line x1="${L}" x2="${W - R}" y1="${y(10 ** e)}" y2="${y(10 ** e)}" style="${AX}"/><text x="${L - 6}" y="${y(10 ** e) + 4}" text-anchor="end" style="${TK}">${e === 0 ? '1' : `10${sup(e)}`}</text>`;
  for (const [v, t] of [[1e-7, '0.1 µm'], [1e-6, '1 µm'], [1e-5, '10 µm'], [1e-4, '100 µm']]) svg += `<text x="${x(v)}" y="${H - B + 17}" text-anchor="middle" style="${TK}">${t}</text>`;
  svg += `<path d="${area('sun')}" fill="var(--sun)" fill-opacity="0.14"/><path d="${area('swarm')}" fill="var(--swarm)" fill-opacity="0.16"/>`;
  svg += `<path d="${path('sun')}" fill="none" stroke="var(--sun)" stroke-width="2"/><path d="${path('swarm')}" fill="none" stroke="var(--swarm)" stroke-width="2"/>`;
  const peak = 2.897771955e-3 / T;
  if (f > 1e-5) svg += `<text x="${Math.min(W - 150, x(peak) + 6)}" y="${Math.max(Tp + 26, y(f * 0.74) - 6)}" style="${LB}">swarm, ${Math.round(T)} K</text>`;
  svg += `<text x="${x(5.5e-7) + 6}" y="${Math.max(Tp + 26, y((1 - f) * 0.74) - 6)}" style="${LB}">Sun, ${pct(1 - f, 2)} escapes</text>`;
  svg += `</svg>`;
  el.innerHTML = svg;
}

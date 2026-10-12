// SVG charts. One scale per axis, hairline solid grid, 2 px lines, ringed markers, text in ink
// colours (never the series colour), a crosshair + tooltip on every chart.
import { pct, sup, sci } from '../util/format.js';

const AX = 'stroke:var(--rule);stroke-width:1';
const TK = 'fill:var(--ink-3);font:12px var(--sans)';
const LB = 'fill:var(--ink);font:500 12.5px var(--sans)';
const LB2 = 'fill:var(--ink-2);font:12px var(--sans)';

/** Crosshair + tooltip. geom: viewBox frame; at(u) -> { x, y, html } for u in 0..1 across the plot. */
function hover(el, geom, at, onPick) {
  let tip = el.querySelector('.tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; el.appendChild(tip); }
  const svg = el.querySelector('svg');
  const line = svg.querySelector('.xhair');
  const dot = svg.querySelector('.xdot');
  const toU = e => {
    const box = svg.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * geom.W;
    return { u: Math.max(0, Math.min(1, (vx - geom.L) / (geom.W - geom.L - geom.R))), box };
  };
  const show = e => {
    const { u, box } = toU(e);
    const q = at(u);
    if (!q) return;
    line.setAttribute('x1', q.x); line.setAttribute('x2', q.x); line.setAttribute('visibility', 'visible');
    if (q.y != null) { dot.setAttribute('cx', q.x); dot.setAttribute('cy', q.y); dot.setAttribute('visibility', 'visible'); }
    tip.innerHTML = q.html;
    tip.hidden = false;
    const sx = box.width / geom.W;
    tip.style.left = `${Math.max(70, Math.min(box.width - 70, q.x * sx))}px`;
    tip.style.top = `${(q.y ?? geom.T + 20) * sx}px`;
  };
  const hide = () => { tip.hidden = true; line.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointermove', e => { show(e); if (e.buttons && onPick) onPick(toU(e).u); });
  svg.addEventListener('pointerdown', e => { if (onPick) { svg.setPointerCapture(e.pointerId); onPick(toU(e).u); } });
  svg.addEventListener('pointerleave', hide);
}
const xhair = (T, B) => `<line class="xhair" y1="${T}" y2="${B}" style="stroke:var(--ink-3);stroke-width:1" visibility="hidden"/><circle class="xdot" r="4.5" style="fill:var(--ink);stroke:var(--paper);stroke-width:2" visibility="hidden"/>`;

/**
 * Share of sunlight captured (log) against calendar year. x uses a piecewise scale (xOf) so the
 * fast early decades and the slow later centuries both get room.
 */
export function buildChart(el, { main, others, markers, limit, cursor, xOf, tOf, seedYear, span, describe, onPick, yMin = -8 }) {
  const W = 1100, H = 380, L = 64, R = 24, T = 18, B = 40;
  const X = t => L + xOf(Math.max(0, Math.min(span, t))) * (W - L - R);
  const Y = f => T + (1 - (Math.log10(Math.max(f, 10 ** yMin)) - yMin) / (0 - yMin)) * (H - T - B);
  const path = pts => pts.map(([t, f], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(f).toFixed(1)}`).join('');
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Share of sunlight captured by the swarm, by year">`;
  for (let e = yMin; e <= 0; e += 2) {
    const lab = e === 0 ? '100%' : e === -2 ? '1%' : e === -4 ? '0.01%' : `10${sup(e + 2)}%`;
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}" style="${AX}"/><text x="${L - 10}" y="${Y(10 ** e) + 4}" text-anchor="end" style="${TK}">${lab}</text>`;
  }
  for (const t of [0, 25, 50, 75, 100, 250, 500, 1000, 1500].filter(t => t <= span)) {
    s += `<text x="${X(t)}" y="${H - B + 22}" text-anchor="middle" style="${TK}">${seedYear + t}</text>`;
  }
  if (limit) {
    const y = Y(limit.f);
    s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" style="stroke:var(--earth);stroke-width:1.5"/>`;
    s += `<text x="${W - R}" y="${y + 17}" text-anchor="end" style="${LB}">${limit.label}</text>`;
  }
  for (const o of others) s += `<path d="${path(o.pts)}" style="fill:none;stroke:var(--ink-3);stroke-width:1.25;stroke-opacity:0.45;stroke-linejoin:round"/>`;
  s += `<path d="${path(main)}" style="fill:none;stroke:var(--sun-mark);stroke-width:2.25;stroke-linejoin:round;stroke-linecap:round"/>`;
  // markers on the main curve, labels placed where no other label sits
  const boxes = [];
  const free = b => !boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
  const ms = (markers || []).filter(m => Number.isFinite(m.t) && m.t <= span).sort((a, b) => a.t - b.t);
  const merged = [];
  for (const m of ms) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(X(m.t) - X(prev.t)) < 26) prev.label += ` · ${m.label}`;
    else merged.push({ ...m });
  }
  for (const m of merged) {
    const x = X(m.t), y = Y(m.f), w = m.label.length * 6.9 + 6;
    const right = x > W - 260;
    const x0 = right ? x - 8 - w : x + 8;
    let ly = y - 12;
    for (const dy of [-12, -28, -44, 22, 38]) {
      const c = y + dy;
      if (c < T + 12 || c > H - B - 6) continue;
      const b = { x0, x1: x0 + w, y0: c - 12, y1: c + 4 };
      if (free(b)) { ly = c; boxes.push(b); break; }
    }
    s += `<circle cx="${x}" cy="${y}" r="4.5" style="fill:var(--sun-mark);stroke:var(--paper);stroke-width:2"/>`;
    s += `<text x="${right ? x - 8 : x + 8}" y="${ly}" ${right ? 'text-anchor="end"' : ''} style="${LB2}">${m.label}</text>`;
  }
  // the axis changes scale after the first 120 years: mark the break
  const xb = X(120);
  s += `<path d="M${xb - 5},${H - B + 5} l4,-10 M${xb + 1},${H - B + 5} l4,-10" style="stroke:var(--ink-3);stroke-width:1;fill:none"/>`;
  s += `<text x="${L}" y="${T - 6}" style="${TK}">share of the Sun's light captured</text>`;
  s += `<line class="cursor" y1="${T}" y2="${H - B}" style="stroke:var(--ink);stroke-width:1"/><circle class="cdot" r="5.5" style="fill:var(--ink);stroke:var(--paper);stroke-width:2"/>`;
  s += xhair(T, H - B);
  s += `</svg>`;
  el.innerHTML = s;
  const cur = el.querySelector('.cursor'), cdot = el.querySelector('.cdot');
  const setCursor = (t, f) => {
    const x = X(t);
    cur.setAttribute('x1', x); cur.setAttribute('x2', x);
    cdot.setAttribute('cx', x); cdot.setAttribute('cy', Y(f));
    cdot.setAttribute('visibility', f > 10 ** yMin ? 'visible' : 'hidden');
  };
  if (cursor) setCursor(cursor.t, cursor.f);
  hover(el, { W, L, R, T }, u => {
    const t = tOf(u);
    let f = main[0][1];
    for (const [tt, ff] of main) { if (tt > t) break; f = ff; }
    return { x: X(t), y: Y(f), html: describe(t, f) };
  }, onPick ? u => onPick(tOf(u)) : null);
  return { setCursor };
}

/** Extra energy absorbed by Earth (W/m², log) against share of sunlight captured (log). */
export function earthChart(el, { pts, pts2, refs, marks }) {
  const W = 1100, H = 340, L = 64, R = 24, T = 18, B = 40;
  const xMin = -5, xMax = 0, yMin = -3, yMax = 3;
  const X = f => L + ((Math.log10(f) - xMin) / (xMax - xMin)) * (W - L - R);
  const Y = v => T + (1 - (Math.log10(Math.max(v, 10 ** yMin)) - yMin) / (yMax - yMin)) * (H - T - B);
  const yLab = { '-3': '0.001', '-2': '0.01', '-1': '0.1', 0: '1', 1: '10', 2: '100', 3: '1,000' };
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Extra energy absorbed by Earth against the share of sunlight the swarm captures">`;
  for (let e = yMin; e <= yMax; e++) s += `<line x1="${L}" x2="${W - R}" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}" style="${AX}"/><text x="${L - 10}" y="${Y(10 ** e) + 4}" text-anchor="end" style="${TK}">${yLab[e]}</text>`;
  for (let e = xMin; e <= xMax; e++) s += `<text x="${X(10 ** e)}" y="${H - B + 22}" text-anchor="middle" style="${TK}">${pct(10 ** e, 0)}</text>`;
  s += `<text x="${L}" y="${T - 4}" style="${TK}">W/m²</text>`;
  for (const r of refs) {
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(r.v)}" y2="${Y(r.v)}" style="stroke:var(--ink-3);stroke-width:1"/>`;
    s += `<text x="${L + 8}" y="${Y(r.v) - 6}" style="${LB2}">${r.label}</text>`;
  }
  const area = pts.filter(([f]) => f >= 10 ** xMin);
  s += `<path d="${area.map(([f, v], i) => `${i ? 'L' : 'M'}${X(f).toFixed(1)},${Y(v).toFixed(1)}`).join('')}" style="fill:none;stroke:var(--heat);stroke-width:2.25;stroke-linejoin:round"/>`;
  if (pts2) {
    const b = pts2.filter(([f]) => f >= 10 ** xMin);
    s += `<path d="${b.map(([f, v], i) => `${i ? 'L' : 'M'}${X(f).toFixed(1)},${Y(v).toFixed(1)}`).join('')}" style="fill:none;stroke:var(--heat);stroke-width:2;stroke-dasharray:7 5;stroke-linejoin:round"/>`;
  }
  for (const m of marks) {
    const x = X(m.f);
    s += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" style="stroke:${m.color};stroke-width:1.5"/>`;
    s += `<text x="${x + (m.left ? -8 : 8)}" y="${m.top ? T + 14 : H - B - 10}" ${m.left ? 'text-anchor="end"' : ''} style="${LB}">${m.label}</text>`;
  }
  s += xhair(T, H - B);
  s += `</svg>`;
  el.innerHTML = s;
  hover(el, { W, L, R, T }, u => {
    const lf = xMin + u * (xMax - xMin);
    let best = area[0];
    for (const p of area) if (Math.abs(Math.log10(p[0]) - lf) < Math.abs(Math.log10(best[0]) - lf)) best = p;
    return { x: X(best[0]), y: Y(best[1]), html: `<b>${pct(best[0], 2)}</b> of sunlight captured<br>+${sci(best[1], 2)} W/m² on Earth` };
  });
}

// Spectrum seen from far away, as λL_λ / L☉ (energy per log-wavelength). A blackbody of luminosity
// L has λL_λ = L · (15/π⁴) x⁴ / (eˣ − 1), x = hc / (λ k T), so the swarm's hump is as tall as the
// share of sunlight it absorbs.
const HC_K = 0.0143877688;
const shape = x => (15 / Math.PI ** 4) * x ** 4 / Math.expm1(x);
export function sedChart(el, { f, T }) {
  const W = 1100, H = 300, L = 64, R = 24, Tp = 18, B = 40;
  const pts = [];
  for (let i = 0; i <= 300; i++) {
    const lam = 10 ** (-7 + (i / 300) * 3.3);
    pts.push({ lam, sun: (1 - f) * shape(HC_K / (lam * 5772)), swarm: f * shape(HC_K / (lam * T)) });
  }
  const x = lam => L + ((Math.log10(lam) + 7) / 3.3) * (W - L - R);
  const ymin = -5, ymax = 0;
  const y = v => Tp + (1 - (Math.log10(Math.max(v, 1e-9)) - ymin) / (ymax - ymin)) * (H - Tp - B);
  const line = k => pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.lam).toFixed(1)},${Math.min(H - B, y(q[k])).toFixed(1)}`).join('');
  const area = k => `${line(k)}L${x(pts[pts.length - 1].lam).toFixed(1)},${H - B}L${x(pts[0].lam).toFixed(1)},${H - B}Z`;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spectrum of the Sun and the swarm seen from another star">`;
  s += `<rect x="${x(3.8e-7)}" y="${Tp}" width="${x(7.5e-7) - x(3.8e-7)}" height="${H - Tp - B}" style="fill:var(--wash)"/>`;
  s += `<text x="${(x(3.8e-7) + x(7.5e-7)) / 2}" y="${Tp + 14}" text-anchor="middle" style="${TK}">visible</text>`;
  for (let e = ymin; e <= ymax; e++) s += `<line x1="${L}" x2="${W - R}" y1="${y(10 ** e)}" y2="${y(10 ** e)}" style="${AX}"/><text x="${L - 10}" y="${y(10 ** e) + 4}" text-anchor="end" style="${TK}">${e === 0 ? '1' : `10${sup(e)}`}</text>`;
  for (const [v, tl] of [[1e-7, '0.1 µm'], [1e-6, '1 µm'], [1e-5, '10 µm'], [1e-4, '100 µm']]) s += `<text x="${x(v)}" y="${H - B + 22}" text-anchor="middle" style="${TK}">${tl}</text>`;
  s += `<path d="${area('sun')}" style="fill:var(--sun-mark);fill-opacity:0.1"/><path d="${area('swarm')}" style="fill:var(--swarm);fill-opacity:0.1"/>`;
  s += `<path d="${line('sun')}" style="fill:none;stroke:var(--sun-mark);stroke-width:2"/><path d="${line('swarm')}" style="fill:none;stroke:var(--swarm);stroke-width:2"/>`;
  const pk = 2.897771955e-3 / T;
  s += `<text x="${x(1.0e-6)}" y="${Math.max(Tp + 30, y((1 - f) * shape(HC_K / (1e-6 * 5772))) - 10)}" style="${LB}">Sun, 5,772 K</text>`;
  if (f > 1e-5) s += `<text x="${Math.min(W - 140, x(pk) + 10)}" y="${Math.max(Tp + 30, y(f * 0.74) - 10)}" style="${LB}">sails, ${Math.round(T)} K</text>`;
  s += xhair(Tp, H - B);
  s += `</svg>`;
  el.innerHTML = s;
  hover(el, { W, L, R, T: Tp }, u => {
    const q = pts[Math.round(u * 300)];
    const um = q.lam * 1e6;
    const top = Math.max(q.sun, q.swarm);
    return { x: x(q.lam), y: y(top), html: `<b>${um < 1 ? um.toFixed(2) : um.toFixed(um < 10 ? 1 : 0)} µm</b><br>Sun ${sci(q.sun, 2)} · sails ${sci(q.swarm, 2)}` };
  });
}

/**
 * The inner solar system to scale, turning with Earth (Earth fixed on the right): the allowed
 * swarm as an even shell inside Earth's orbit, and the option as a cloud on Earth's orbit
 * beyond the Sun (projected radius cos(lat)·1 AU) with a gap round L3 and a shade at L1.
 */
export function orbitMap(el, { mode, r = 0.95, cone = 23, l3 = 15, capR = 0.98, label, shellR = 0.86, shellLabel, cloudLabel, spans = [[90, 165], [195, 270]], latMax = 30 }) {
  const W = 1100, H = 560, cx = 470, cy = 280, s = 240;
  const P = (r, deg) => [cx + r * s * Math.cos((deg * Math.PI) / 180), cy - r * s * Math.sin((deg * Math.PI) / 180)];
  const ring = (r, style) => `<circle cx="${cx}" cy="${cy}" r="${r * s}" style="fill:none;${style}"/>`;
  const band = (r0, r1, a0, a1) => {
    const [x0, y0] = P(r1, a0), [x1, y1] = P(r1, a1), [x2, y2] = P(r0, a1), [x3, y3] = P(r0, a0);
    return `M${x0},${y0} A${r1 * s},${r1 * s} 0 0 0 ${x1},${y1} L${x2},${y2} A${r0 * s},${r0 * s} 0 0 1 ${x3},${y3} Z`;
  };
  const r0 = Math.cos((latMax * Math.PI) / 180);
  const txt = (x, y, str, style = LB2, anchor = 'start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" style="${style}">${str}</text>`;
  let o = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Map to scale: where the swarm's sails fly round the Sun, Earth, and a sunshade at L1">`;
  o += ring(0.387, 'stroke:var(--rule);stroke-width:1') + ring(0.723, 'stroke:var(--rule);stroke-width:1');
  o += ring(1.0, 'stroke:var(--earth);stroke-width:1;stroke-opacity:0.6');
  if (mode === 'closed') {
    // the closed swarm: compute sails all round at r, except a cap round the Sun-Earth line held by
    // co-orbiting mirrors at capR, with a window on the line itself
    const arc = (rr, a0, a1) => { const [x0, y0] = P(rr, a0), [x1, y1] = P(rr, a1); return `M${x0},${y0} A${rr * s},${rr * s} 0 ${a1 - a0 > 180 ? 1 : 0} 0 ${x1},${y1}`; };
    o += `<path d="${arc(r, cone, 360 - cone)}" style="fill:none;stroke:var(--swarm);stroke-width:6;stroke-opacity:0.85"/>`;
    for (const [a0, a1] of [[-cone, -1.2], [1.2, cone]]) o += `<path d="${arc(capR, a0, a1)}" style="fill:none;stroke:var(--ink-2);stroke-width:2.5"/>`;
    const [ex0, ey0] = P(1.0, 0);
    o += `<line x1="${cx + 10}" y1="${cy}" x2="${ex0 - 8}" y2="${ey0}" style="stroke:var(--sun-mark);stroke-width:1.5"/>`;
    // any other window is sails turning edge-on along the line: Mars, if it is given one
    const [mx, my] = P(1.524, 205);
    o += `<line x1="${cx}" y1="${cy}" x2="${mx}" y2="${my}" style="stroke:var(--sun-mark);stroke-width:1.2;stroke-dasharray:4 4"/>`;
    o += `<circle cx="${mx}" cy="${my}" r="4.5" style="fill:var(--heat)"/>`;
  } else if (mode === 'uniform') {
    // the near-uniform swarm in the plane of Earth's orbit: a ring at r, open round the Sun-Earth
    // line (cone) and round L3; out of the plane it wraps the whole Sun
    const arc = (a0, a1) => { const [x0, y0] = P(r, a0), [x1, y1] = P(r, a1); return `M${x0},${y0} A${r * s},${r * s} 0 ${a1 - a0 > 180 ? 1 : 0} 0 ${x1},${y1}`; };
    for (const [a0, a1] of [[cone, 180 - l3], [180 + l3, 360 - cone]]) o += `<path d="${arc(a0, a1)}" style="fill:none;stroke:var(--swarm);stroke-width:6;stroke-opacity:0.85"/>`;
    for (const a of [cone, -cone]) { const [x, y] = P(1.0, a); o += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" style="stroke:var(--earth);stroke-width:1;stroke-dasharray:3 4"/>`; }
  } else {
    for (const [a0, a1] of spans) o += `<path d="${band(r0, 1.0, a0, a1)}" style="fill:var(--swarm);fill-opacity:0.08;stroke:var(--swarm);stroke-width:1"/>`;
    if (shellR) o += ring(shellR, 'stroke:var(--sun-mark);stroke-width:5;stroke-opacity:0.85');
  }
  o += `<circle cx="${cx}" cy="${cy}" r="7" style="fill:var(--sun-mark)"/>`;
  const [ex, ey] = P(1, 0);
  o += `<circle cx="${ex}" cy="${ey}" r="6" style="fill:var(--earth);stroke:var(--paper);stroke-width:2"/><circle cx="${ex - 10}" cy="${ey}" r="2.5" style="fill:var(--ink)"/>`;
  o += txt(ex + 14, ey + 4, 'Earth', LB);
  o += txt(ex + 14, ey + 22, mode === 'closed' ? 'its window in the mirror cap, 3 million km sunward' : 'sunshade at L1, 1.6 million km sunward');
  o += txt(cx, cy + 26, 'Sun', LB, 'middle');
  { const [x, y] = P(0.723, 60); o += txt(x - 6, y + 16, 'Venus', LB2, 'end'); }
  { const [x, y] = P(0.387, 55); o += txt(x - 6, y + 16, 'Mercury', LB2, 'end'); }
  if (mode === 'closed') {
    { const [x, y] = P(r, 128); o += txt(x - 10, y - 10, label, LB, 'end'); }
    { const [x, y] = P(capR, -cone); o += txt(x + 12, y + 18, `mirror cap at ${capR} AU, ${cone}° round the Sun–Earth line`, LB2); }
    { const [x, y] = P(0.5, 0); o += txt(x, y - 8, 'sunlight for Earth', LB2, 'middle'); }
    { const [x, y] = P(1.524, 205); o += txt(x + 10, y + 18, 'Mars, if it is given a window', LB2); }
  } else if (mode === 'uniform') {
    { const [x, y] = P(r, 128); o += txt(x - 10, y - 10, label, LB, 'end'); }
    { const [x, y] = P(1.02, 0); o += txt(x + 14, y + 40, `no sails within ${cone}° of the Sun–Earth line`, LB2); }
    { const [x, y] = P(r + 0.05, 180); o += txt(x - 4, y + 4, 'gap', LB2, 'end'); }
  } else {
    if (shellR && shellLabel) { const [x, y] = P(shellR, -40); o += txt(x - 10, y, shellLabel, LB, 'end'); }
    if (cloudLabel) { const [x, y] = P(1.04, 128); o += txt(x, y - 8, cloudLabel, LB, 'end'); }
    if (spans.length) { const [x, y] = P(1.06, 180); o += txt(x - 4, y + 4, 'gap', LB2, 'end'); }
  }
  o += txt(W - 24, H - 16, '1 AU = 150 million km', LB2, 'end');
  o += `</svg>`;
  el.innerHTML = o;
}

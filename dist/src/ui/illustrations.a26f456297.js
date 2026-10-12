// Fine-line technical drawings. Ink is currentColor; the only hues are sunlight (amber),
// infrared heat (red) and the series colours, each where it carries meaning.

const F = 'font-family:var(--sans);font-size:13px;fill:currentColor';
const F2 = 'font-family:var(--sans);font-size:12px;fill:var(--ink-3)';
const HAIR = 'stroke:currentColor;stroke-width:1;fill:none';
const THIN = 'stroke:var(--ink-3);stroke-width:0.75;fill:none';
const t = (x, y, s, style = F, anchor = 'start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" style="${style}">${s}</text>`;
const arrowDefs = id => `<defs>
  <marker id="${id}-sun" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--sun-mark)"/></marker>
  <marker id="${id}-heat" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--heat)"/></marker>
  <marker id="${id}-ink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>
</defs>`;

/**
 * The sail face-on, to scale, with two insets: the back of the film (chiplets at the model's
 * pitch, an optical lane) and the laminate cross-section (layer thicknesses to scale).
 */
export function sailAnatomy(el, { side = 279.01, diag = 394.58, sag = 11.16, pitchMm = 23.5, chipW = 0.15, mw = 19, chips = 1.3e8, lanes = true, thin = false, closed = false }) {
  const W = 1100, H = 780;
  const k = 440 / diag;
  sag = sag * (side / 279.01);                  // catenary sag scales with the side                       // px per metre in the main view
  const cx = 270, cy = 330, R = (diag / 2) * k;
  const tip = [[cx + R, cy], [cx, cy - R], [cx - R, cy], [cx, cy + R]];
  // each edge bows inward by `sag`; a quadratic's midpoint sits half way to its control point
  const edge = (a, b) => {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = cx - mx, dy = cy - my, d = Math.hypot(dx, dy);
    const c = [mx + (dx / d) * 2 * sag * k, my + (dy / d) * 2 * sag * k];
    return `Q${c[0].toFixed(1)},${c[1].toFixed(1)} ${b[0]},${b[1]}`;
  };
  let film = `M${tip[0][0]},${tip[0][1]}`;
  for (let i = 0; i < 4; i++) film += edge(tip[i], tip[(i + 1) % 4]);
  film += 'Z';
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="The compute sail to scale: a ${Math.round(side)} m square flown as a diamond, with booms behind it, mirror vanes at the tips, a chiplet grid at ${pitchMm.toFixed(1)} mm pitch and an 80 micrometre laminate">`;
  s += arrowDefs('an');
  s += `<clipPath id="an-clip"><path d="${film}"/></clipPath>`;
  // film, hinge strips (every tenth drawn), booms behind the film (hidden lines)
  s += `<path d="${film}" style="fill:var(--wash);stroke:currentColor;stroke-width:1.25"/>`;
  const hingeStep = 1.6256 * 10 * k;
  let hinges = '';
  for (let y = cy - R; y <= cy + R; y += hingeStep) hinges += `<line x1="${cx - R}" x2="${cx + R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  s += `<g clip-path="url(#an-clip)" style="stroke:var(--ink-3);stroke-width:0.5;opacity:0.6">${hinges}</g>`;
  s += `<g style="stroke:currentColor;stroke-width:0.9;stroke-dasharray:5 4;fill:none;opacity:0.75">${tip.map(p => `<line x1="${cx}" y1="${cy}" x2="${cx + (p[0] - cx) * 1.012}" y2="${cy + (p[1] - cy) * 1.012}"/>`).join('')}</g>`;
  const hub = 3.4 * k;
  s += `<rect x="${cx - hub / 2}" y="${cy - hub / 2}" width="${hub}" height="${hub}" style="fill:currentColor"/>`;
  // vanes: diamonds of 9.3 m side centred 204 m out on each axis
  const vr = (9.32 / Math.SQRT2) * k, vd = (diag / 2 + 6.66) * k;   // vane centres 6.7 m beyond the tips
  for (const [dx, dy] of [[1, 0], [0, -1], [-1, 0], [0, 1]]) {
    const x = cx + dx * vd, y = cy + dy * vd;
    s += `<path d="M${x + vr},${y} L${x},${y - vr} L${x - vr},${y} L${x},${y + vr} Z" style="fill:var(--paper);stroke:currentColor;stroke-width:1"/>`;
  }
  // dimensions
  const dimY = cy + R + 34;
  s += `<g style="${HAIR}"><line x1="${cx - R}" x2="${cx + R}" y1="${dimY}" y2="${dimY}"/><line x1="${cx - R}" x2="${cx - R}" y1="${dimY - 6}" y2="${dimY + 6}"/><line x1="${cx + R}" x2="${cx + R}" y1="${dimY - 6}" y2="${dimY + 6}"/></g>`;
  s += t(cx, dimY - 8, `${Math.round(diag)} m tip to tip`, F, 'middle');
  // edge dimension along the upper-left edge, offset outward
  const a = tip[2], b = tip[1], off = 30;
  const emx = (a[0] + b[0]) / 2 - cx, emy = (a[1] + b[1]) / 2 - cy, el2 = Math.hypot(emx, emy);
  const ox = (emx / el2) * off, oy = (emy / el2) * off;
  s += `<line x1="${a[0] + ox}" y1="${a[1] + oy}" x2="${b[0] + ox}" y2="${b[1] + oy}" style="${HAIR}"/>`;
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const mx = (a[0] + b[0]) / 2 + ox * 1.5, my = (a[1] + b[1]) / 2 + oy * 1.5;
  s += `<text x="${mx}" y="${my}" text-anchor="middle" transform="rotate(${ang.toFixed(1)} ${mx} ${my})" style="${F}">${Math.round(side)} m side</text>`;
  // callouts
  const call = (x1, y1, x2, y2, label, anchor = 'start') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="${THIN}"/><circle cx="${x1}" cy="${y1}" r="2" style="fill:currentColor"/>` + t(x2 + (anchor === 'start' ? 5 : -5), y2 + 4, label, F2, anchor);
  s += call(cx, cy - vd, cx + 46, cy - vd + 6, 'mirror vane, 9 m: steers by light pressure');
  s += call(cx + R * 0.5, cy, cx + R * 0.62, cy + 62, 'boom behind the film (dashed)');
  s += call(cx, cy, cx + 70, cy - 150, 'hub, 3.4 m');
  // football pitch at the same scale for reference
  const pw = 105 * k, ph = 68 * k, px = 22, py = 44;
  s += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" style="${HAIR}"/><line x1="${px + pw / 2}" x2="${px + pw / 2}" y1="${py}" y2="${py + ph}" style="${THIN}"/>`;
  s += t(px, py + ph + 18, 'football pitch, same scale', F2);
  s += t(22, 28, 'Face-on, as the Sun sees it', F2);

  // inset 1: the back of the film
  const ix = 600, iy = 34, iw = 470, ih = 230;
  const mmPx = 3.2;                                   // px per mm in the inset
  const p = pitchMm * mmPx, die = 2.45 * mmPx;
  const sx = cx + R * 0.32, sy = cy + R * 0.18;      // where the inset is taken from
  s += `<circle cx="${sx}" cy="${sy}" r="7" style="${HAIR}"/><line x1="${sx + 7}" y1="${sy - 4}" x2="${ix - 6}" y2="${iy + ih * 0.55}" style="${THIN}"/>`;
  s += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="3" style="fill:var(--paper);stroke:currentColor;stroke-width:1"/>`;
  s += `<clipPath id="an-i1"><rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="3"/></clipPath><g clip-path="url(#an-i1)">`;
  if (lanes) s += `<rect x="${ix}" y="${iy + ih - 2 * p - 3}" width="${iw}" height="${8 * mmPx}" style="fill:var(--wash);stroke:none"/>`;
  for (let x = ix + p / 2 - 6; x < ix + iw; x += p) for (let y = iy + p / 2; y < iy + ih; y += p) {
    s += `<rect x="${(x - die / 2).toFixed(1)}" y="${(y - die / 2).toFixed(1)}" width="${die.toFixed(1)}" height="${die.toFixed(1)}" style="fill:currentColor"/>`;
  }
  s += `</g>`;
  const d0 = ix + p / 2 - 6 + p, d1 = d0 + p, dy = iy + p / 2 + p;
  s += `<g style="${HAIR}"><line x1="${d0}" x2="${d1}" y1="${dy + 16}" y2="${dy + 16}"/><line x1="${d0}" x2="${d0}" y1="${dy + 10}" y2="${dy + 22}"/><line x1="${d1}" x2="${d1}" y1="${dy + 10}" y2="${dy + 22}"/></g>`;
  s += t((d0 + d1) / 2, dy + 32, `${pitchMm.toFixed(1)} mm`, F, 'middle');
  s += t(ix, iy + ih + 20, `Back of the film, enlarged: ${chipW} W chiplets, 2.45 mm across`, F);
  s += t(ix, iy + ih + 38, `${(chips / 1e6).toFixed(0)} million per sail, ${mw.toFixed(0)} MW in all${lanes ? '; the pale band is an optical lane' : ''}`, F2);

  // inset 2: cross-section, thickness to scale (2.4 px per µm, 3.6 for the thin film), width not
  const cxs = 600, cys = 420, cw = 300, um = thin ? 3.6 : 2.4;
  // the design-spec film, or the thinned film the mature swarm flies (docs/full-swarm.md): 10 µm of
  // light-trapped silicon, 8 µm of glass, 6 µm of enamel
  const layers = thin ? [
    ['cover glass, Mg-aluminosilicate', 8, 'var(--paper)'],
    ['silicon solar cell, light-trapped', 10, 'currentColor'],
    ['magnesium heat spreader', 13, 'var(--ink-3)'],
    ['silicate enamel, emits infrared', 6, 'var(--wash)'],
  ] : [
    ['cover glass, Mg-aluminosilicate', 20, 'var(--paper)'],
    ['silicon solar cell', 30, 'currentColor'],
    ['magnesium heat spreader', 13, 'var(--ink-3)'],
    ['silicate enamel, emits infrared', 15, 'var(--wash)'],
  ];
  let y = cys;
  s += `<line x1="${cxs}" x2="${cxs + cw}" y1="${y - 1}" y2="${y - 1}" style="stroke:var(--sun-mark);stroke-width:1.5"/>`;
  s += t(cxs + cw + 14, y + 3, 'anti-reflection coat, 0.1 µm', F2);
  for (const [name, th, fill] of layers) {
    const h = th * um;
    s += `<rect x="${cxs}" y="${y}" width="${cw}" height="${h}" style="fill:${fill};stroke:currentColor;stroke-width:0.75;${fill === 'currentColor' ? 'fill-opacity:0.85' : ''}"/>`;
    s += t(cxs + cw + 14, y + h / 2 + 4, `${name}, ${th} µm`, F);
    y += h;
  }
  s += `<rect x="${cxs + cw * 0.42}" y="${y}" width="${cw * 0.16}" height="${50 * um}" style="fill:currentColor"/>`;
  s += t(cxs + cw + 14, y + 18, 'chiplet die, 50 µm thick (far narrower than drawn)', F2);
  // sunlight in, heat out of both faces
  for (const x of [cxs + 50, cxs + 150, cxs + 250]) s += `<line x1="${x}" y1="${cys - 58}" x2="${x}" y2="${cys - 6}" style="stroke:var(--sun-mark);stroke-width:1.5" marker-end="url(#an-sun)"/>`;
  for (const x of [cxs + 100, cxs + 200]) s += `<line x1="${x}" y1="${cys - 8}" x2="${x}" y2="${cys - 50}" style="stroke:var(--heat);stroke-width:1.5" marker-end="url(#an-heat)"/>`;
  for (const x of [cxs + 70, cxs + 230]) s += `<line x1="${x}" y1="${y + 6}" x2="${x}" y2="${y + 52}" style="stroke:var(--heat);stroke-width:1.5" marker-end="url(#an-heat)"/>`;
  const yDie = y + 50 * um;
  s += t(cxs, cys - 66, 'sunlight', F2);
  s += t(cxs + cw, cys - 66, 'infrared out of both faces', F2, 'end');
  s += t(cxs, yDie + 26, `Cross-section: thicknesses to scale, about ${thin ? 40 : 80} µm with wiring and coatings`, F);
  s += `</svg>`;
  el.innerHTML = s;
}

/**
 * Where the heat goes: sail (heat radiated where it is made) against pod (heat pumped to
 * radiators held edge-on to the Sun). Side views, not to scale.
 */
export function heatPaths(el, { sailGW, podGW, chipW = 0.15 }) {
  const W = 1100, H = 360;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Two side views: on a sail each chiplet radiates its own heat from both faces; in a pod the heat is pumped through armoured loops to radiator blades held edge-on to the Sun">`;
  s += arrowDefs('hp');
  // ---- left: sail
  const L0 = 30, L1 = 500, fy = 170;
  s += t(L0, 30, 'Compute sail', 'font-family:var(--serif);font-size:20px;fill:currentColor');
  s += `<rect x="${L0}" y="${fy}" width="${L1 - L0}" height="6" style="fill:var(--wash);stroke:currentColor;stroke-width:1"/>`;
  for (let x = L0 + 18; x < L1; x += 36) s += `<rect x="${x - 3}" y="${fy + 6}" width="6" height="4" style="fill:currentColor"/>`;
  for (let x = L0 + 40; x < L1; x += 110) s += `<line x1="${x}" y1="${fy - 92}" x2="${x}" y2="${fy - 6}" style="stroke:var(--sun-mark);stroke-width:1.5" marker-end="url(#hp-sun)"/>`;
  for (let x = L0 + 18; x < L1; x += 36) {
    s += `<line x1="${x}" y1="${fy - 4}" x2="${x}" y2="${fy - 30}" style="stroke:var(--heat);stroke-width:1.25" marker-end="url(#hp-heat)"/>`;
    s += `<line x1="${x}" y1="${fy + 14}" x2="${x}" y2="${fy + 40}" style="stroke:var(--heat);stroke-width:1.25" marker-end="url(#hp-heat)"/>`;
  }
  s += t(L0, fy - 100, 'sunlight', F2);
  s += t(L0, fy + 64, `each ${chipW} W chiplet's heat leaves within a few centimetres, from both faces`, F2);
  s += t(L0, H - 34, `${sailGW.toFixed(2)} g per watt of chips`, 'font-family:var(--sans);font-size:22px;font-weight:500;fill:currentColor');
  s += t(L0, H - 12, `one failure takes out ${chipW} W`, F2);
  // ---- right: pod
  const R0 = 600;
  s += t(R0, 30, 'Concentrated pod', 'font-family:var(--serif);font-size:20px;fill:currentColor');
  const wy = 150, wx0 = R0, wx1 = R0 + 210;
  s += `<rect x="${wx0}" y="${wy}" width="${wx1 - wx0}" height="5" style="fill:var(--wash);stroke:currentColor;stroke-width:1"/>`;
  for (let x = wx0 + 30; x < wx1; x += 70) s += `<line x1="${x}" y1="${wy - 72}" x2="${x}" y2="${wy - 6}" style="stroke:var(--sun-mark);stroke-width:1.5" marker-end="url(#hp-sun)"/>`;
  s += t(wx0, wy - 80, 'sunlight on the solar wing', F2);
  // module
  const mx = wx1 + 50, my = wy - 22;
  s += `<rect x="${mx}" y="${my}" width="54" height="54" rx="2" style="fill:var(--paper);stroke:currentColor;stroke-width:1.25"/>`;
  s += `<g style="fill:currentColor">${[0, 1, 2].map(i => [0, 1, 2].map(j => `<rect x="${mx + 9 + i * 14}" y="${my + 9 + j * 14}" width="8" height="8"/>`).join('')).join('')}</g>`;
  s += `<line x1="${wx1}" y1="${wy + 2}" x2="${mx}" y2="${wy + 2}" style="stroke:currentColor;stroke-width:1.25" marker-end="url(#hp-ink)"/>`;
  s += t((wx1 + mx) / 2, wy - 6, 'power', F2, 'middle');
  s += t(mx + 27, my + 72, 'chips in a', F2, 'middle');
  s += t(mx + 27, my + 87, 'shielded box', F2, 'middle');
  // pumped loop to an edge-on radiator blade
  const bx = mx + 180, by0 = 70, by1 = 260;
  s += `<path d="M${mx + 54},${my + 16} H${bx - 14} V${by0 + 30}" style="stroke:var(--heat);stroke-width:1.5;fill:none" marker-end="url(#hp-heat)"/>`;
  s += `<path d="M${bx - 14},${by1 - 30} V${my + 40} H${mx + 54}" style="stroke:var(--heat);stroke-width:1.5;fill:none;stroke-opacity:0.55" marker-end="url(#hp-heat)"/>`;
  s += `<rect x="${bx - 4}" y="${by0}" width="8" height="${by1 - by0}" style="fill:var(--wash);stroke:currentColor;stroke-width:1.25"/>`;
  for (let y = by0 + 20; y < by1; y += 34) {
    s += `<line x1="${bx + 6}" y1="${y}" x2="${bx + 40}" y2="${y}" style="stroke:var(--heat);stroke-width:1.25" marker-end="url(#hp-heat)"/>`;
  }
  s += t(bx + 6, by0 - 10, 'radiator blade, edge-on to the Sun', F2, 'middle');
  s += t(mx + 60, by1 + 26, 'pumped loop: metres of armoured pipe', F2);
  s += t(R0, H - 34, `${podGW.toFixed(2)} g per watt of chips`, 'font-family:var(--sans);font-size:22px;font-weight:500;fill:currentColor');
  s += t(R0, H - 12, 'one failure takes out 0.5–1 MW', F2);
  s += `<line x1="555" x2="555" y1="20" y2="${H - 10}" style="stroke:var(--rule);stroke-width:1"/>`;
  s += `</svg>`;
  el.innerHTML = s;
}

/**
 * How the closed swarm puts light, and water, on Earth (docs/closed-swarm.md, "Steering climate").
 * Not to scale: the window, relay mirrors in Earth orbit, lasers from the cap, and rain.
 */
export function lightPaths(el) {
  const W = 1100, H = 610;
  const SUN = 'stroke:var(--sun-mark);stroke-width:1.5;fill:none';
  const LAS = 'stroke:var(--swarm);stroke-width:1.5;fill:none';
  const P = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];
  const arc = (cx, cy, r, a0, a1) => { const [x0, y0] = P(cx, cy, r, a0), [x1, y1] = P(cx, cy, r, a1); return `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 0 ${x1},${y1}`; };
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Diagram: four ways the closed swarm puts light and rain on Earth">${arrowDefs('lp')}`;
  s += `<defs><marker id="lp-las" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--swarm)"/></marker>
    <marker id="lp-earth" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--earth)"/></marker></defs>`;
  // --- top: the Sun, the closed swarm, the cap and its window, Earth
  const sx = 140, sy = 200, rs = 120, rc = 133, xs0 = 40;
  s += `<path d="${arc(sx, sy, rs, 24, 336)}" style="stroke:var(--swarm);stroke-width:7;fill:none;stroke-opacity:0.85"/>`;
  for (const [a0, a1] of [[-24, -2.5], [2.5, 24]]) s += `<path d="${arc(sx, sy, rc, a0, a1)}" style="stroke:var(--ink-2);stroke-width:3;fill:none"/>`;
  s += `<circle cx="${sx}" cy="${sy}" r="15" style="fill:var(--sun-mark)"/>`;
  s += t(sx, sy + 36, 'Sun', F, 'middle');
  s += t(sx - 10, sy - rs - 16, 'the swarm, closed', F, 'middle');
  { const [x, y] = P(sx, sy, rc, -24); s += t(x + 14, y + 16, 'mirror cap', F2); }
  const mark = (x, y, n) => `<circle cx="${x}" cy="${y}" r="9" style="fill:var(--paper);stroke:currentColor;stroke-width:1"/>` + t(x, y + 4, String(n), 'font-family:var(--sans);font-size:11px;font-weight:600;fill:currentColor', 'middle');
  const ex = 820, ey = 200, re = 64;
  // 1: sunlight through the window, widening to cover Earth
  const [wx, wy] = P(sx, sy, rc, 0);
  s += `<line x1="${sx + 18}" y1="${sy}" x2="${wx}" y2="${wy}" style="${SUN}"/>`;
  s += `<line x1="${wx}" y1="${wy - 3}" x2="${ex - re * 0.35}" y2="${ey - re * 0.94}" style="${SUN}"/>`;
  s += `<line x1="${wx}" y1="${wy + 3}" x2="${ex - re * 0.35}" y2="${ey + re * 0.94}" style="${SUN}"/>`;
  s += t(wx + 14, wy - 8, 'window', F2);
  // 2: relay mirrors in Earth orbit
  s += `<circle cx="${ex}" cy="${ey}" r="${re + 34}" style="${THIN};stroke-dasharray:3 4"/>`;
  for (const a of [125, 228, 300]) {
    const [mx, my] = P(ex, ey, re + 34, a);
    const n = (a + 90) * Math.PI / 180;
    s += `<line x1="${mx - 7 * Math.cos(n)}" y1="${my + 7 * Math.sin(n)}" x2="${mx + 7 * Math.cos(n)}" y2="${my - 7 * Math.sin(n)}" style="stroke:currentColor;stroke-width:2.5"/>`;
  }
  { const [mx, my] = P(ex, ey, re + 34, 125); const [px, py] = P(ex, ey, re, 70);
    s += `<line x1="${mx - 60}" y1="${my + 4}" x2="${mx}" y2="${my}" style="${SUN};stroke-width:1.2"/>`;
    s += `<line x1="${mx}" y1="${my}" x2="${px}" y2="${py}" style="${SUN};stroke-width:1.2" marker-end="url(#lp-sun)"/>`; }
  s += `<circle cx="${ex}" cy="${ey}" r="${re}" style="fill:var(--earth);fill-opacity:0.14;stroke:var(--earth);stroke-width:1.5"/>`;
  s += t(ex, ey + 5, 'Earth', F, 'middle');
  // 3: lasers from stations in the cap, powered by the swarm
  for (const [ca, ea] of [[16, 140], [-16, 218]]) {
    const [cx2, cy2] = P(sx, sy, rc + 6, ca), [px, py] = P(ex, ey, re, ea);
    s += `<line x1="${cx2}" y1="${cy2}" x2="${px}" y2="${py}" style="${LAS};stroke-dasharray:7 4" marker-end="url(#lp-las)"/>`;
    s += `<circle cx="${cx2}" cy="${cy2}" r="3.5" style="fill:var(--swarm)"/>`;
  }
  // numbered markers on the drawing, and their labels
  s += mark(wx + 120, wy - 34, 1);
  { const [mx, my] = P(ex, ey, re + 34, 125); s += mark(mx - 16, my - 16, 2); }
  { const [cx2, cy2] = P(sx, sy, rc + 6, 16); s += mark(cx2 + 4, cy2 - 22, 3); }
  s += t(470, 40, '1  The window', F);
  s += t(470, 58, 'All of Earth’s sunlight passes through it. Narrow it and', F2);
  s += t(470, 74, 'the whole planet dims; tilt the mirrors round it to brighten it.', F2);
  s += t(930, 92, '2  Relay mirrors in orbit', F);
  s += t(930, 110, 'Fed through the window.', F2);
  s += t(930, 126, 'Spots 9–90 km across.', F2);
  s += t(470, 340, '3  Lasers from the cap, powered by the swarm', F);
  s += t(470, 358, 'Not bound by the Sun’s half-degree width: a 1 km beam', F2);
  s += t(470, 374, 'director 3 million km away lights a spot a few metres wide.', F2);
  s += t(W - 20, 340, 'Not to scale', F2, 'end');
  // --- bottom: rain where it is wanted, a coast in cross-section
  const y0 = 560, xc = 540, xl1 = 1060;
  s += `<line x1="${xs0}" y1="${y0 - 0.5}" x2="${W - 40}" y2="${y0 - 0.5}" style="${THIN}"/>`;
  s += `<path d="M${xs0},${y0} H${xc}" style="stroke:var(--earth);stroke-width:2;fill:none"/>`;
  s += `<path d="M${xc},${y0} C${xc + 60},${y0 - 6} ${xc + 120},${y0 - 14} ${xc + 200},${y0 - 18} S${xc + 320},${y0 - 60} ${xc + 380},${y0 - 48} S${xl1 - 40},${y0 - 22} ${xl1},${y0 - 20}" style="${HAIR}"/>`;
  s += t(xs0, y0 + 22, 'sea', F2);
  s += t(xc + 30, y0 + 22, 'land', F2);
  // laser heats the sea; vapour rises
  s += `<line x1="230" y1="430" x2="230" y2="${y0 - 4}" style="${LAS};stroke-dasharray:7 4" marker-end="url(#lp-las)"/>`;
  for (const x of [205, 230, 255]) s += `<path d="M${x},${y0 - 10} q6,-10 0,-20 q-6,-10 0,-20 q6,-10 0,-20" style="stroke:var(--earth);stroke-width:1.2;fill:none" marker-end="url(#lp-earth)"/>`;
  s += t(250, 446, 'heat the sea upwind', F2);
  // wind carries the moisture inland
  s += `<line x1="300" y1="476" x2="560" y2="476" style="stroke:currentColor;stroke-width:1.25" marker-end="url(#lp-ink)"/>`;
  s += t(430, 468, 'the wind carries the moist air', F2, 'middle');
  // cloud and rain over land
  const cl = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" style="fill:var(--paper);stroke:currentColor;stroke-width:1"/>`;
  s += cl(640, 470, 18) + cl(668, 460, 24) + cl(700, 468, 20) + cl(724, 474, 14);
  for (const x of [632, 652, 672, 692, 712]) s += `<line x1="${x}" y1="${492}" x2="${x - 6}" y2="${y0 - 26}" style="stroke:var(--earth);stroke-width:1.2"/>`;
  s += t(680, 430, 'rain', F2, 'middle');
  // or heat a column of air with a wavelength it absorbs
  s += `<line x1="920" y1="400" x2="920" y2="486" style="${LAS};stroke-dasharray:7 4"/>`;
  s += `<rect x="904" y="486" width="32" height="${y0 - 40 - 486}" style="fill:var(--heat);fill-opacity:0.12;stroke:none"/>`;
  s += `<line x1="920" y1="${y0 - 44}" x2="920" y2="470" style="stroke:var(--heat);stroke-width:1.25" marker-end="url(#lp-heat)"/>`;
  s += t(948, 452, 'or heat the air itself', F2);
  s += t(948, 468, 'at a wavelength it absorbs:', F2);
  s += t(948, 484, 'it rises, cools and rains', F2);
  s += t(xs0, 385, '4  Rain where it is wanted', F);
  s += `</svg>`;
  el.innerHTML = s;
}

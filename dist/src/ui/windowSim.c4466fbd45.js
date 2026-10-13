// The window, simulated (docs/closed-swarm.md, "Windows"): how the mirrors in front of Earth turn
// edge-on to let its sunlight through, how leaving some of them face-on dims Earth, and how tilting
// the ones round the window brightens it. Two views of the same mirrors: from the side, not to scale,
// and from Earth, to scale except for the mirrors themselves. Every readout comes from the geometry.

const D_CAP = 3.0e9;                       // m, from the mirrors to Earth
const R_EARTH = 6.371e6;
const R_SUN_P = D_CAP * 4.65e-3;           // the Sun's disc seen from Earth, at the mirrors' distance
const WIN = 20.3e6;                        // m, window radius: every point on Earth sees the whole Sun
const S_CAP = 1361 / 0.98 ** 2;            // W/m² on the mirrors
const MIRROR = 279;                        // m
const CROSS_MIN = 70;                      // minutes for a mirror to cross the window
const FLIP_MIN = 10;                       // minutes to turn edge-on (flywheel, docs/closed-swarm.md)
const V = (2 * WIN) / (CROSS_MIN * 60);    // m/s across the line
const LEAD = V * FLIP_MIN * 60;            // m travelled while turning
const ABSORBED = 0.7 * 1361 / 4;           // W/m² Earth absorbs from the Sun, averaged over the globe

/** Light the mirrors between the window's edge and `outer` (m) bend onto Earth, as a share of the
 *  sunlight Earth gets today. Each turns almost edge-on, tilted by x / 2D so that the grazing light it
 *  catches (S sin δ per m² of the cap) is bent by x / D toward Earth; it throws an image of the Sun
 *  2 × 13,950 km across, of which Earth intercepts (R_E / 13,950 km)². */
export function brightenGain(outer) {
  const n = 200, hit = (R_EARTH / R_SUN_P) ** 2;
  let P = 0;
  for (let i = 0; i < n; i++) {
    const x = WIN + ((outer - WIN) * (i + 0.5)) / n;
    P += S_CAP * 0.95 * Math.sin(x / (2 * D_CAP)) * 2 * Math.PI * x * ((outer - WIN) / n);
  }
  return (P * hit) / (1361 * Math.PI * R_EARTH ** 2);
}

const hash = (a, b) => {
  let k = (a * 73856093) ^ (b * 19349663);
  k = Math.imul(k ^ (k >>> 13), 0x5bd1e995);
  return ((k ^ (k >>> 15)) >>> 0) / 4294967296;
};
// constant torque from the flywheel: speed up for half the turn, slow down for the other half
const prof = s => (s <= 0 ? 0 : s >= 1 ? 1 : s < 0.5 ? 2 * s * s : 1 - 2 * (1 - s) ** 2);

/** Mirror angle from face-on (0) to edge-on (1) for a mirror at (x, y) m from the line, moving north. */
function turn(x, y, open) {
  if (Math.abs(x) >= open) return 0;
  const c = Math.sqrt(open * open - x * x);
  if (y < -c - LEAD || y > c + LEAD) return 0;
  if (y < -c) return prof((y + c + LEAD) / LEAD);
  if (y > c) return 1 - prof((y - c) / LEAD);
  return 1;
}

export function windowSim(el, { cut = 0.0024 } = {}) {
  el.innerHTML = `
    <canvas class="sim-canvas" role="img" aria-label="Animation: mirrors drift past the line between the Sun and Earth, turn edge-on to open a window for Earth's sunlight, and turn back once past"></canvas>
    <div class="sim-controls col">
      <div class="sim-modes" role="group" aria-label="What the mirrors do">
        <button data-mode="open" aria-pressed="true">Let sunlight through</button>
        <button data-mode="dim" aria-pressed="false">Dim Earth</button>
        <button data-mode="bright" aria-pressed="false">Brighten Earth</button>
      </div>
      <label class="sim-slider" hidden><span></span><input type="range"></label>
      <button class="sim-play" aria-label="Pause">Pause</button>
      <p class="sim-readout" aria-live="polite"></p>
      <div class="sim-explain" hidden>
        <svg viewBox="0 0 300 152" role="img" aria-label="Close up of one mirror in the ring: tipped a fraction of a degree from edge-on, it catches a thin slice of the sunlight passing it and glances that slice off at twice its tilt, onto Earth; the rest of the light slips past">
          <defs><marker id="sim-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" style="fill:var(--sun-mark)"/></marker></defs>
          <text x="6" y="14" style="fill:var(--ink);font:600 12px var(--sans)">One ring mirror, close up</text>
          ${[40, 58, 94, 112].map(y => `<line x1="6" y1="${y}" x2="286" y2="${y}" style="stroke:var(--sun-mark);stroke-width:1.2;opacity:0.3"/>`).join('')}
          <line x1="6" y1="70" x2="123" y2="70" style="stroke:var(--sun-mark);stroke-width:1.6"/>
          <line x1="6" y1="82" x2="193" y2="82" style="stroke:var(--sun-mark);stroke-width:1.6"/>
          <line x1="123" y1="70" x2="250" y2="115" style="stroke:var(--sun-mark);stroke-width:2" marker-end="url(#sim-ah)"/>
          <line x1="193" y1="82" x2="268" y2="109" style="stroke:var(--sun-mark);stroke-width:2" marker-end="url(#sim-ah)"/>
          <line x1="100" y1="66" x2="210" y2="85" style="stroke:var(--ink);stroke-width:3.5;stroke-linecap:round"/>
          <text x="6" y="30" style="fill:var(--ink-2);font:11px var(--sans)">sunlight</text><text x="104" y="56" style="fill:var(--ink-2);font:11px var(--sans)">a thin slice is caught</text>
          <text x="200" y="132" style="fill:var(--ink-2);font:11px var(--sans)">glanced off at twice</text>
          <text x="200" y="145" style="fill:var(--ink-2);font:11px var(--sans)">the tilt, toward Earth</text>
          <text x="6" y="132" style="fill:var(--ink-3);font:11px var(--sans)">the rest slips past</text><text x="6" y="145" style="fill:var(--ink-3);font:11px var(--sans)">angles exaggerated</text>
        </svg>
        <p>Each mirror in the ring is turned almost edge-on, but tipped by a fraction of a degree. Like a stone skipping on water, the sunlight that grazes it bounces off at a shallow angle, just enough to reach Earth. A mirror farther out has to tip more to aim at Earth, so it catches a thicker slice: the outer edge of the ring does most of the work.</p>
      </div>
    </div>`;
  const canvas = el.querySelector('canvas'), ctx = canvas.getContext('2d');
  const slider = el.querySelector('.sim-slider'), range = slider.querySelector('input'), sliderLabel = slider.querySelector('span');
  const readout = el.querySelector('.sim-readout'), play = el.querySelector('.sim-play'), explain = el.querySelector('.sim-explain');
  const state = { mode: 'open', dim: 0.05, outer: 50e6, t: 0, running: !matchMedia('(prefers-reduced-motion: reduce)').matches, visible: false };
  if (!state.running) { state.t = 22; play.textContent = 'Play'; play.setAttribute('aria-label', 'Play'); }

  const pct = (x, d = 2) => `${(100 * x).toFixed(d)}%`;
  function setMode(m) {
    state.mode = m;
    for (const b of el.querySelectorAll('.sim-modes button')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    slider.hidden = m === 'open';
    explain.hidden = m !== 'bright';
    if (m === 'dim') Object.assign(range, { min: 0, max: 20, step: 0.5, value: state.dim * 100 });
    if (m === 'bright') Object.assign(range, { min: 20.3, max: 80, step: 0.1, value: state.outer / 1e6 });
    update();
  }
  function update() {
    if (state.mode === 'dim') state.dim = Number(range.value) / 100;
    if (state.mode === 'bright') state.outer = Number(range.value) * 1e6;
    let line;
    if (state.mode === 'open') {
      line = `Sunlight reaching Earth: <b>${pct(1 - cut)}</b> of today's. The window is held ${pct(cut)} short of fully open, a few mirrors in it left facing the Sun, to cancel the faint warmth of the mirrors' cold backs.`;
    } else if (state.mode === 'dim') {
      sliderLabel.textContent = `Mirrors left facing the Sun inside the window: ${pct(state.dim, 1)}`;
      line = `Sunlight reaching Earth: <b>${pct(1 - state.dim, 1)}</b>, about ${(state.dim * ABSORBED).toFixed(1)} W/m² less, ${(state.dim * ABSORBED / 3.93).toFixed(1)} times what doubling CO₂ adds. Every place on Earth dims alike: a mirror 3 million km away casts no shadow, only a blur wider than Earth.`;
    } else {
      const g = brightenGain(state.outer);
      sliderLabel.textContent = `Ring of tilted mirrors: from the window’s edge out to ${Math.round(state.outer / 1e3).toLocaleString('en')} km`;
      line = `Sunlight reaching Earth: <b>${pct(1 + g, 1)}</b> of today’s, about ${(g * ABSORBED).toFixed(1)} W/m² more, everywhere on Earth alike. The mirrors tip by at most ${((state.outer / (2 * D_CAP)) * 180 / Math.PI).toFixed(2)}°. From Earth the ring round the Sun glows faintly: each mirror in it shows a thin sliver of the Sun’s reflection.`;
    }
    readout.innerHTML = line;
    if (!state.running) draw();
  }
  for (const b of el.querySelectorAll('.sim-modes button')) b.addEventListener('click', () => setMode(b.dataset.mode));
  range.addEventListener('input', update);
  play.addEventListener('click', () => {
    state.running = !state.running;
    play.textContent = state.running ? 'Pause' : 'Play';
    play.setAttribute('aria-label', state.running ? 'Pause' : 'Play');
    if (state.running) loop();
  });

  // ---------------------------------------------------------------- drawing
  let W = 0, H = 0, stacked = false;
  function resize() {
    const w = el.clientWidth;
    stacked = w < 700;
    W = w; H = stacked ? Math.round(w * 0.72) + Math.round(w * 0.98) : Math.round(w * 0.46);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  const css = name => getComputedStyle(el).getPropertyValue(name).trim();

  // angle (0 face-on .. 1 edge-on) of a mirror, with the mode's rules; returns [angle, glint]
  function mirror(x, y, id) {
    const r = Math.hypot(x, y);
    if (state.mode === 'bright') {
      const a = turn(x, y, state.outer);
      if (r > WIN && a > 0) return [a * 0.94, a * Math.min(1, (r - 0.6 * WIN) / (state.outer - 0.6 * WIN))];
      return [a, 0];
    }
    // a few mirrors stay facing the Sun as they cross: a share `held` of the window's light
    const held = state.mode === 'dim' ? state.dim : cut;
    if (hash(id[0], id[1]) < held) return [0, 0];
    return [turn(x, y, WIN), 0];
  }

  function sideView(x0, y0, w, h) {
    const ink = css('--ink'), ink3 = css('--ink-3'), sun = css('--sun-mark'), sw = css('--swarm'), earthC = css('--earth');
    const font = `12px ${css('--sans')}`;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    const cy = y0 + h * 0.5, sunR = h * 0.36, sunX = x0 - sunR * 0.35, capX = x0 + w * 0.62, earthX = x0 + w * 0.9, earthR = Math.max(10, h * 0.04);
    // a ray from height a (-1..1) on the Sun's limb to height b on Earth, and where it crosses the mirrors
    const ray = (a, b) => {
      const sy = cy + a * sunR * 0.98, sx = sunX + Math.sqrt(Math.max(0, sunR * sunR - (a * sunR * 0.98) ** 2)), ey = cy + b * earthR;
      return { sx, sy, ey, ys: sy + ((ey - sy) * (capX - sx)) / (earthX - sx) };
    };
    const band = Math.abs(ray(-1, -1).ys - cy);          // window half-height: top of the Sun to top of Earth
    const pxPerM = band / WIN, outerPx = state.mode === 'bright' ? state.outer * pxPerM : band;
    // the Sun, Earth
    const g = ctx.createRadialGradient(sunX, cy, 0, sunX, cy, sunR);
    g.addColorStop(0, '#fff6dc'); g.addColorStop(0.8, '#ffd27a'); g.addColorStop(1, '#f2a33a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sunX, cy, sunR, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = earthC; ctx.beginPath(); ctx.arc(earthX, cy, earthR, 0, 2 * Math.PI); ctx.fill();
    // mirrors in the column on the line, drifting north (up)
    const L = 22, gap = 20, shift = (state.t * (2 * band)) / CROSS_MIN;
    const N = Math.ceil((h + 4 * gap) / gap), span = N * gap;
    const ms = [];
    for (let j = 0; j < N; j++) {
      const yy = ((((j * gap - shift) % span) + span) % span) - span / 2;          // px from the line, north up
      const [a, glint] = mirror(0, -yy / pxPerM, [7, j]);
      ms.push({ y: cy + yy, a, glint, j });
    }
    const at = y => ms.reduce((b, m) => (Math.abs(m.y - y) < Math.abs(b.y - y) ? m : b), ms[0]);
    // light: rays from across the Sun to across Earth, through the window
    ctx.lineWidth = 1.2;
    for (const [a, b] of [[-1, -1], [1, 1], [-1, 1], [1, -1], [0, 0], [-0.5, 0.5], [0.5, -0.5]]) {
      const { sx, sy, ey, ys } = ray(a, b);
      const m = at(ys), open = m.a > 0.97 && Math.abs(ys - cy) <= band + 1;
      ctx.strokeStyle = sun; ctx.globalAlpha = open ? 0.95 : 0.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(capX, ys);
      if (open) ctx.lineTo(earthX, ey); else ctx.lineTo(capX - 40, ys + Math.sign(ys - cy || 1) * 12);
      ctx.stroke();
    }
    const bright = state.mode === 'bright';
    // brighten: each mirror in the ring, once tilted, glances a slice of sunlight onto Earth
    const zone = y => { const d = Math.abs(y - cy); return d <= band ? 'window' : bright && d <= outerPx ? 'ring' : 'out'; };
    const tilt = m => {                                   // angle of the mirror line from vertical, radians
      const z = zone(m.y);
      if (z !== 'ring') return (m.a * Math.PI) / 2;
      const vx = earthX - capX, vy = cy - m.y, n = Math.hypot(vx, vy);
      const phi = Math.atan2(vy / n, 1 + vx / n);         // the line that bends a horizontal ray toward Earth
      return (Math.min(1, m.a / 0.94) * (Math.PI / 2 - phi));
    };
    if (bright) {
      for (const m of ms) {
        if (zone(m.y) !== 'ring') continue;
        const yy = m.y - cy, sx = Math.max(x0, sunX + Math.sqrt(Math.max(0, sunR * sunR - yy * yy)));
        const p = Math.min(1, m.a / 0.94);
        ctx.strokeStyle = sun; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(sx, m.y); ctx.lineTo(capX, m.y); ctx.stroke();
        if (p > 0.85) {
          ctx.save(); ctx.shadowColor = sun; ctx.shadowBlur = 6;
          ctx.globalAlpha = 0.95; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(capX, m.y); ctx.lineTo(earthX - earthR * 0.6, cy + yy * 0.08); ctx.stroke();
          ctx.restore();
        } else {
          ctx.globalAlpha = 0.45 * (1 - p);
          ctx.beginPath(); ctx.moveTo(capX, m.y); ctx.lineTo(capX - 46, m.y + Math.sign(yy) * 14); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    // light outside the window (and outside the ring): sent back into the swarm
    for (let yy = -h / 2 + 12; yy < h / 2; yy += 26) {
      if (bright && Math.abs(yy) <= outerPx + 6) continue;
      if (Math.abs(yy) < band + 6) continue;
      const y = cy + yy, m = at(y);
      const sx = sunX + Math.sqrt(Math.max(0, sunR * sunR - yy * yy));
      if (sx > capX - 30) continue;
      ctx.strokeStyle = sun; ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(Math.max(sx, x0), y); ctx.lineTo(capX, y);
      if (m.glint > 0) { ctx.globalAlpha = 0.95; ctx.lineTo(earthX, cy); }
      else if (m.a < 0.5) ctx.lineTo(capX - 46, y + Math.sign(yy) * 14);
      else ctx.lineTo(capX + 40, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // the mirrors themselves; the one about to turn carries its flywheel
    let tracked = null;
    for (const m of (bright ? [] : ms)) {
      const yy = m.y - cy;
      if (!tracked && yy > band && yy < band + 70 && m.a < 0.999) tracked = m;
    }
    if (!tracked && !bright) tracked = ms.filter(m => m.a > 0.02 && m.a < 0.98)[0];
    for (const m of ms) {
      const th = tilt(m);
      const dx = (Math.sin(th) * L) / 2, dy = (Math.cos(th) * L) / 2;
      const z = zone(m.y);
      ctx.strokeStyle = m === tracked ? sw : bright && z === 'ring' ? sun : bright && z === 'out' ? ink3 : ink;
      ctx.lineWidth = m === tracked ? 2.4 : bright && z === 'ring' ? 2.2 : 1.6;
      ctx.beginPath(); ctx.moveTo(capX - dx, m.y - dy); ctx.lineTo(capX + dx, m.y + dy); ctx.stroke();
    }
    if (tracked) {
      const fx = capX + 30, fy = tracked.y, r = 7, spin = -tracked.a * 40;
      ctx.strokeStyle = sw; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(fx, fy, r, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + r * Math.cos(spin), fy + r * Math.sin(spin)); ctx.stroke();
      ctx.font = font; ctx.fillStyle = sw; ctx.textAlign = 'left';
      ctx.fillText('flywheel', fx + 11, fy + 4);
    }
    // window marks and labels
    ctx.strokeStyle = ink3; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(capX - 40, cy + s * band); ctx.lineTo(capX - 8, cy + s * band); ctx.stroke(); }
    if (state.mode === 'bright') for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(capX - 40, cy + s * outerPx); ctx.lineTo(capX - 8, cy + s * outerPx); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.font = font; ctx.fillStyle = ink3; ctx.textAlign = 'right';
    ctx.fillText('window', capX - 44, cy - band + 4);
    if (bright) {
      const paper = css('--paper'), lab = (txt, y, c, wgt = 400) => {
        ctx.font = `${wgt} 12px ${css('--sans')}`; ctx.textAlign = 'left';
        ctx.lineWidth = 4; ctx.strokeStyle = paper; ctx.lineJoin = 'round'; ctx.strokeText(txt, capX + 18, y);
        ctx.fillStyle = c; ctx.fillText(txt, capX + 18, y);
      };
      ctx.fillStyle = ink3; ctx.textAlign = 'right'; ctx.fillText('ring', capX - 44, cy - outerPx + 4);
      lab('edge-on: sunlight passes', cy - band * 0.55, ink);
      const ry = cy - (band + outerPx) / 2;
      lab('tilted: light glanced', ry - 7, sun, 600); lab('onto Earth', ry + 8, sun, 600);
      if (outerPx < h / 2 - 30) lab('face-on: light sent back', cy - (outerPx + h / 2) / 2 - 4, ink3);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = ink; ctx.fillText('Earth', earthX, cy + earthR + 16);
    ctx.fillStyle = ink3; ctx.textAlign = 'left';
    ctx.fillText('mirrors, 0.98 AU', capX + 8, y0 + 16);
    ctx.textAlign = 'left';
    ctx.fillText('From the side, not to scale', x0 + 4, y0 + h - 8);
    ctx.restore();
  }

  function faceView(x0, y0, w, h) {
    const sun = css('--sun-mark');
    const font = `12px ${css('--sans')}`;
    ctx.save();
    ctx.fillStyle = css('--plate') || '#040506';
    ctx.fillRect(x0, y0, w, h);
    ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    const m = Math.min(w, h), cx = x0 + w / 2, cy = y0 + h / 2;
    const s = state.mode === 'bright' ? Math.min((m * 0.3) / WIN, (m * 0.46) / state.outer) : (m * 0.3) / WIN;   // px per m
    // the Sun behind, limb-darkened
    const rs = R_SUN_P * s, g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rs);
    g.addColorStop(0, '#fffaf0'); g.addColorStop(0.7, '#ffe7b0'); g.addColorStop(1, '#e9a24a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rs, 0, 2 * Math.PI); ctx.fill();
    // mirrors: each square stands for millions, drifting north
    const tile = Math.max(12, Math.min(w, h) / 26), tm = tile / s;
    const cols = Math.ceil(w / tile) + 2, rows = Math.ceil(h / tile) + 4;
    const shift = (state.t * 2 * WIN) / CROSS_MIN;                                  // m drifted
    const slivers = [];
    for (let i = -Math.ceil(cols / 2); i <= Math.ceil(cols / 2); i++) {
      const x = i * tm, ph = hash(i, 99) * tm;
      for (let j = 0; j < rows; j++) {
        const span = rows * tm;
        let y = ((j * tm + shift + ph) % span) - span / 2;                             // m north of the line
        const id = [i, j];
        const [a, glint] = mirror(x, y, id);
        const px = cx + x * s, py = cy - y * s, hgt = tile * Math.cos((a * Math.PI) / 2);
        // the cold backs, seen from Earth: near black, a hair lighter than space
        ctx.fillStyle = '#15171b';
        if (hgt > 0.6) ctx.fillRect(px - tile / 2 - 0.3, py - hgt / 2 - 0.3, tile + 0.6, hgt + 0.6);
        else { ctx.fillStyle = '#2a2d33'; ctx.fillRect(px - tile / 2 + 1, py - 0.3, tile - 2, 0.6); }
        if (hgt > 3) { ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.strokeRect(px - tile / 2 + 0.5, py - hgt / 2 + 0.5, tile - 1, hgt - 1); }
        if (glint > 0) slivers.push([px, py, glint, hash(i, j)]);
      }
    }
    if (state.mode === 'bright') {
      // seen from Earth, each tilted mirror shows a sliver of the Sun's reflection, its width growing
      // with the tilt (so with distance from the line): the ring glows, brightest at its outer edge
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const r0 = WIN * s, r1 = state.outer * s;
      const glow = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
      glow.addColorStop(0, 'rgba(255,196,110,0.02)'); glow.addColorStop(0.9, 'rgba(255,196,110,0.2)'); glow.addColorStop(1, 'rgba(255,196,110,0.05)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, r1, 0, 2 * Math.PI); ctx.arc(cx, cy, r0, 0, 2 * Math.PI, true); ctx.fill('evenodd');
      ctx.shadowColor = 'rgba(255,190,90,0.9)'; ctx.shadowBlur = 8;
      for (const [px, py, gl, ph] of slivers) {
        // a sliver's width grows with the mirror's tilt, which grows with its distance from the line
        const tw = 0.8 + 0.2 * Math.sin(state.t * 0.9 + ph * 40), k = gl * gl;
        ctx.fillStyle = `rgba(255,236,190,${(0.2 + 0.8 * k) * tw})`;
        ctx.fillRect(px - tile * 0.42, py - 0.3 - k * 1.3, tile * 0.84, 0.6 + k * 2.6);
      }
      ctx.restore();
      // the meter: today's sunlight, and what the ring adds
      const g = brightenGain(state.outer), bw = Math.min(w * 0.5, 220), unit = bw / 1.3;
      const mx = x0 + w / 2 - bw / 2, my = y0 + h - 34;
      ctx.fillStyle = 'rgba(4,5,6,0.72)'; ctx.fillRect(mx - 12, my - 22, bw + 24, 42);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = font; ctx.textAlign = 'left';
      ctx.fillText('Sunlight on Earth', mx, my - 8);
      ctx.textAlign = 'right'; ctx.fillStyle = '#ffd890'; ctx.fillText(`+${(100 * g).toFixed(1)}%`, mx + bw, my - 8);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(mx, my, unit, 8);
      ctx.save(); ctx.shadowColor = 'rgba(255,190,90,0.9)'; ctx.shadowBlur = 8; ctx.fillStyle = '#ffc861';
      ctx.fillRect(mx + unit + 1, my, Math.min(bw - unit - 1, unit * g), 8); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(mx + unit, my - 3, 1, 14);
    }
    // window edge, Earth for scale
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, WIN * s, 0, 2 * Math.PI); ctx.stroke();
    if (state.mode === 'bright') { ctx.beginPath(); ctx.arc(cx, cy, state.outer * s, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.setLineDash([]);
    const ex = x0 + 18 + R_EARTH * s, ey = y0 + h - (state.mode === 'bright' ? 70 : 30) - R_EARTH * s;
    ctx.strokeStyle = 'rgba(120,170,255,0.8)';
    ctx.beginPath(); ctx.arc(ex, ey, R_EARTH * s, 0, 2 * Math.PI); ctx.stroke();
    ctx.font = font; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.textAlign = 'left';
    ctx.fillText('Earth, same scale', ex + R_EARTH * s + 6, ey + 4);
    ctx.fillText(state.mode === 'bright' ? 'From Earth: the ring round the window glows' : 'From Earth: the window, 40,600 km across', x0 + 10, y0 + 18);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const n = Math.round(tm / MIRROR / 100) * 100;
    ctx.fillText(`each square ≈ ${n.toLocaleString('en')} × ${n.toLocaleString('en')} mirrors`, x0 + 10, y0 + 36);
    const mins = Math.floor(state.t % 600);
    ctx.textAlign = 'right';
    ctx.fillText(`+${String(Math.floor(mins / 60)).padStart(2, '0')} h ${String(mins % 60).padStart(2, '0')} min`, x0 + w - 10, y0 + 18);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (stacked) {
      const hs = Math.round(W * 0.72);
      sideView(0, 0, W, hs);
      faceView(0, hs + 8, W, H - hs - 8);
    } else {
      const ws = Math.round(W * 0.5);
      sideView(0, 0, ws, H);
      faceView(ws + 16, 0, W - ws - 16, H);
    }
  }

  let last = 0, raf = 0;
  function loop() {
    cancelAnimationFrame(raf);
    if (!state.running || !state.visible) { last = 0; return; }
    raf = requestAnimationFrame(ts => {
      if (last) state.t += Math.min(0.1, (ts - last) / 1000) * 6;               // 1 s here = 6 minutes
      last = ts;
      draw();
      loop();
    });
  }
  new IntersectionObserver(es => {
    state.visible = es[0].isIntersecting; last = 0;
    if (state.visible) loop();
  }).observe(canvas);
  new ResizeObserver(resize).observe(el);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', draw);
  setMode('open');
  resize();
  return { setCut(c) { cut = c; update(); } };
}

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
    </div>`;
  const canvas = el.querySelector('canvas'), ctx = canvas.getContext('2d');
  const slider = el.querySelector('.sim-slider'), range = slider.querySelector('input'), sliderLabel = slider.querySelector('span');
  const readout = el.querySelector('.sim-readout'), play = el.querySelector('.sim-play');
  const state = { mode: 'open', dim: 0.05, outer: 50e6, t: 0, running: !matchMedia('(prefers-reduced-motion: reduce)').matches, visible: false };
  if (!state.running) { state.t = 22; play.textContent = 'Play'; play.setAttribute('aria-label', 'Play'); }

  const pct = (x, d = 2) => `${(100 * x).toFixed(d)}%`;
  function setMode(m) {
    state.mode = m;
    for (const b of el.querySelectorAll('.sim-modes button')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    slider.hidden = m === 'open';
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
      sliderLabel.textContent = `Mirrors tilted out to ${Math.round(state.outer / 1e3).toLocaleString('en')} km from the line`;
      line = `Sunlight reaching Earth: <b>${pct(1 + g, 1)}</b>, about ${(g * ABSORBED).toFixed(1)} W/m² more. Each tilted mirror bends grazing sunlight by under ${((state.outer / D_CAP) * 180 / Math.PI).toFixed(1)}° onto Earth, so from Earth the Sun is ringed by glints.`;
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
      if (r > WIN && a > 0) return [a * 0.94, a * Math.min(1, r / state.outer)];
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
    // light outside the window: sent back into the swarm, or, when brightening, bent onto Earth
    for (let yy = -h / 2 + 12; yy < h / 2; yy += 26) {
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
    for (const m of ms) {
      const yy = m.y - cy;
      if (!tracked && yy > band && yy < band + 70 && m.a < 0.999) tracked = m;
    }
    if (!tracked) tracked = ms.filter(m => m.a > 0.02 && m.a < 0.98)[0];
    for (const m of ms) {
      const th = (m.a * Math.PI) / 2;
      const dx = (Math.sin(th) * L) / 2, dy = (Math.cos(th) * L) / 2;
      ctx.strokeStyle = m === tracked ? sw : ink; ctx.lineWidth = m === tracked ? 2.4 : 1.6;
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
        if (glint > 0) {
          ctx.fillStyle = sun; ctx.globalAlpha = 0.25 + 0.75 * glint;
          ctx.beginPath(); ctx.arc(px, py, 1.6 + 1.6 * glint, 0, 2 * Math.PI); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
    // window edge, Earth for scale
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, WIN * s, 0, 2 * Math.PI); ctx.stroke();
    if (state.mode === 'bright') { ctx.beginPath(); ctx.arc(cx, cy, state.outer * s, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.setLineDash([]);
    const ex = x0 + 18 + R_EARTH * s, ey = y0 + h - 30 - R_EARTH * s;
    ctx.strokeStyle = 'rgba(120,170,255,0.8)';
    ctx.beginPath(); ctx.arc(ex, ey, R_EARTH * s, 0, 2 * Math.PI); ctx.stroke();
    ctx.font = font; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.textAlign = 'left';
    ctx.fillText('Earth, same scale', ex + R_EARTH * s + 6, ey + 4);
    ctx.fillText('From Earth: the window, 40,600 km across', x0 + 10, y0 + 18);
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

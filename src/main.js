import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import * as model from './model/model.js';
import * as constants from './model/constants.js';
import * as format from './util/format.js';
import * as blackbody from './util/blackbody.js';
import { createLabels } from './util/labels.js';
import { renderLedger, milestones, attachLedgerInteractions } from './ui/ledger.js';
import { renderParams } from './ui/params.js';

const CHAPTERS = [
  { id: 'mercury', n: 1, name: 'Mercury', load: () => import('./scenes/mercury.js') },
  { id: 'satellite', n: 2, name: 'Satellite', load: () => import('./scenes/satellite.js') },
  { id: 'swarm', n: 3, name: 'Swarm', load: () => import('./scenes/swarm.js') },
  { id: 'earth', n: 4, name: 'Earth', load: () => import('./scenes/earth.js') },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const params = model.defaults();
const state = {
  params,
  d: null,
  now: null,
  simTime: 0,              // seconds since J2000, drives orbital motion
  simSpeed: 86400 * 6,     // simulated seconds per real second
  view: { mode: 'visible', exaggerate: false },
  chapter: 'swarm',
  playing: false,
};

function recompute() {
  state.d = model.compute(params);
  state.now = model.atYear(params, state.d, params.year);
}
recompute();
// Open where the swarm has become impossible to miss: 10% of the Sun covered.
params.year = Math.round(state.d.growth.yearsTo10pct);
recompute();

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const canvas = document.getElementById('stage');
const stageWrap = document.getElementById('stage-wrap');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const labels = createLabels(document.getElementById('labels'));

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.35, 0.9);
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const ctx = {
  THREE, renderer, canvas, labels, model, constants, format, blackbody,
  getState: () => state,
  /** Ask main to re-render the caption (e.g. when a scene's internal mode changes). */
  refreshCaption: () => updateCaption(),
};

const loaded = new Map();
let active = null;

async function setChapter(id) {
  state.chapter = id;
  for (const b of chapterNav.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  try { localStorage.setItem('swarm.chapter', id); } catch { /* storage may be blocked */ }
  let sc = loaded.get(id);
  if (!sc) {
    const mod = await CHAPTERS.find(c => c.id === id).load();
    sc = mod.default(ctx);
    loaded.set(id, sc);
    resize();
  }
  if (state.chapter !== id) return; // user switched again while loading
  if (active && active !== sc) active.deactivate?.();
  active = sc;
  active.activate?.(state);
  active.onState?.(state);
  renderPass.scene = active.scene;
  renderPass.camera = active.camera;
  updateCaption();
}

function resize() {
  const w = stageWrap.clientWidth, h = stageWrap.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  labels.resize(w, h);
  ctx.aspect = w / Math.max(1, h);
  for (const sc of loaded.values()) sc.resize?.(w, h);
}
new ResizeObserver(resize).observe(stageWrap);

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const chapterNav = document.getElementById('chapters');
for (const c of CHAPTERS) {
  const b = document.createElement('button');
  b.dataset.id = c.id;
  b.innerHTML = `<b>${c.n}</b>${c.name}`;
  b.addEventListener('click', () => setChapter(c.id));
  chapterNav.appendChild(b);
}

function setPressed(a, b, on) { a.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-pressed', String(!on)); }
const mVis = document.getElementById('mode-visible'), mIr = document.getElementById('mode-thermal');
mVis.onclick = () => { state.view.mode = 'visible'; setPressed(mVis, mIr, true); broadcast(); };
mIr.onclick = () => { state.view.mode = 'thermal'; setPressed(mVis, mIr, false); broadcast(); };
const sTrue = document.getElementById('scale-true'), sEx = document.getElementById('scale-exag');
sTrue.onclick = () => { state.view.exaggerate = false; setPressed(sTrue, sEx, true); broadcast(); };
sEx.onclick = () => { state.view.exaggerate = true; setPressed(sTrue, sEx, false); broadcast(); };

const ledger = document.getElementById('ledger');
document.getElementById('ledger-toggle').onclick = () => ledger.classList.toggle('open');
const drawer = document.getElementById('drawer');
document.getElementById('open-assumptions').onclick = () => drawer.classList.add('open');
document.getElementById('close-assumptions').onclick = () => drawer.classList.remove('open');
document.getElementById('reset-params').onclick = () => {
  const keepYear = params.year;
  Object.assign(params, model.defaults(), { year: keepYear });
  paramsUI.sync();
  onParamsChanged();
};

const capEl = document.getElementById('caption');
if (window.innerWidth < 600) {
  capEl.classList.add('collapsed');
  document.getElementById('caption-collapse').textContent = '+';
}
document.getElementById('caption-collapse').onclick = () => {
  capEl.classList.toggle('collapsed');
  document.getElementById('caption-collapse').textContent = capEl.classList.contains('collapsed') ? '+' : '–';
};

function updateCaption() {
  if (!active?.caption) return;
  const c = active.caption(state);
  document.getElementById('cap-eyebrow').textContent = c.eyebrow || '';
  document.getElementById('cap-title').textContent = c.title || '';
  document.getElementById('cap-body').innerHTML = c.body || '';
  document.getElementById('cap-hint').textContent = c.hint || '';
  const pre = document.getElementById('cap-presets');
  const list = active.presets || [];
  const key = list.map(p => p.label).join('|');
  if (pre.dataset.key !== key) {
    pre.dataset.key = key;
    pre.innerHTML = '';
    for (const p of list) {
      const b = document.createElement('button');
      b.textContent = p.label;
      if (p.title) b.title = p.title;
      b.onclick = () => p.apply(state);
      pre.appendChild(b);
    }
  }
}

const ledgerBody = document.getElementById('ledger-body');
attachLedgerInteractions(ledgerBody, () => state);
function updateLedger() { renderLedger(ledgerBody, state); }

const paramsUI = renderParams(document.getElementById('params'), model.PARAMS, params, () => onParamsChanged());

// Timeline
const yearInput = document.getElementById('year');
const tlReadout = document.getElementById('tl-readout');
const ticksEl = document.getElementById('ticks');
// The track is piecewise linear in years: when growth hits Mercury's heat wall, the exponential
// decades get the first 40% of the track and the slow, heat-limited centuries the rest.
const TRACK = 1000;
function timeScale() {
  const g = state.d.growth;
  const maxYear = Math.max(10, g.yearsToFull * 1.04 + 2);
  const knee = g.capped && maxYear > 4 * (g.tCap + 25) ? g.tCap + 25 : null;
  if (!knee) return { maxYear, knee, toPos: y => (y / maxYear) * TRACK, toYear: x => (x / TRACK) * maxYear };
  const kp = 0.4 * TRACK;
  return {
    maxYear, knee,
    toPos: y => (y <= knee ? (y / knee) * kp : kp + ((y - knee) / (maxYear - knee)) * (TRACK - kp)),
    toYear: x => (x <= kp ? (x / kp) * knee : knee + ((x - kp) / (TRACK - kp)) * (maxYear - knee)),
  };
}
yearInput.min = '0';
yearInput.max = String(TRACK);
yearInput.step = '0.5';
function updateTimeline() {
  const ts = timeScale();
  if (params.year > ts.maxYear) params.year = ts.maxYear;
  const pos = ts.toPos(params.year);
  yearInput.value = String(pos);
  yearInput.style.setProperty('--p', `${(pos / TRACK) * 100}%`);
  const n = state.now;
  tlReadout.innerHTML = [
    `<span class="yr">Year <b>${params.year < 100 ? params.year.toFixed(1) : Math.round(params.year).toLocaleString()}</b></span>`,
    `<span>coverage <b>${format.pct(n.f, 2)}</b></span>`,
    `<span>satellites <b>${format.sci(n.nSats)}</b></span>`,
    `<span>compute <b>${format.sci(n.flops)} FLOP/s</b></span>`,
    `<span>Mercury mined <b>${format.pct(n.mercuryRemoved, 2)}</b></span>`,
    `<span>Earth forcing <b>${n.earth.forcing >= 0 ? '+' : ''}${format.sci(n.earth.forcing)} W/m²</b></span>`,
  ].join('');
  let lastX = -100;
  ticksEl.innerHTML = milestones(state)
    .filter(m => m.year > 0 && m.year <= ts.maxYear)
    .sort((a, b) => a.year - b.year)
    .map(m => {
      const x = (ts.toPos(m.year) / TRACK) * 100;
      const crowded = x - lastX < 7;
      if (!crowded) lastX = x;
      return `<i style="left:${x}%" title="${m.label}: year ${m.year.toFixed(1)}">${crowded ? '' : `<span>${m.label}</span>`}</i>`;
    }).join('');
}
yearInput.addEventListener('input', () => {
  params.year = timeScale().toYear(Number(yearInput.value));
  paramsUI.sync();
  onYearChanged();
});

const playBtn = document.getElementById('play');
playBtn.onclick = () => {
  state.playing = !state.playing;
  const ts = timeScale();
  if (state.playing && params.year >= ts.maxYear - 0.1) params.year = state.d.growth.yearsForFraction(1e-5);
  playBtn.textContent = state.playing ? '❚❚' : '▶';
};

function broadcast() {
  for (const sc of loaded.values()) sc.onState?.(state);
  updateCaption();
}
function onYearChanged() {
  state.now = model.atYear(params, state.d, params.year);
  updateTimeline();
  updateLedger();
  broadcast();
}
function onParamsChanged() {
  recompute();
  updateTimeline();
  updateLedger();
  broadcast();
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let uiAccum = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, clock.getDelta());
  state.simTime += dt * state.simSpeed;
  if (state.playing) {
    // Move along the track at a steady pace: the whole build plays in about 40 s.
    const ts = timeScale();
    const pos = Math.min(TRACK, ts.toPos(params.year) + dt * (TRACK / 40));
    params.year = ts.toYear(pos);
    if (pos >= TRACK) { state.playing = false; playBtn.textContent = '▶'; }
    uiAccum += dt;
    if (uiAccum > 0.1) { uiAccum = 0; paramsUI.sync(); onYearChanged(); }
  }
  if (!active) return;
  labels.begin();
  active.update?.(dt, state);
  const thermal = state.view.mode === 'thermal';
  // Thermal false colour is shown as-is (no filmic curve), like an IR camera's palette.
  const tm = thermal ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  if (renderer.toneMapping !== tm) renderer.toneMapping = tm;
  renderer.toneMappingExposure = active.exposure ?? 1;
  bloomPass.strength = (active.bloom ?? 0.6) * (thermal ? 0.35 : 1);
  bloomPass.threshold = active.bloomThreshold ?? 0.9;
  composer.render();
  labels.end(active.camera);
}

// Boot
let start = 'swarm';
try { start = localStorage.getItem('swarm.chapter') || start; } catch { /* ignore */ }
if (location.hash && CHAPTERS.some(c => c.id === location.hash.slice(1))) start = location.hash.slice(1);
if (!CHAPTERS.some(c => c.id === start)) start = 'swarm';
updateTimeline();
updateLedger();
resize();
setChapter(start).then(() => requestAnimationFrame(frame));

// Expose for debugging and automated screenshots.
window.__swarm = { state, params, setChapter, onParamsChanged, onYearChanged, model, loaded };

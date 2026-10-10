// Chapter 4 — Earth. Standing in a dark meadow at local midnight, looking south: what the swarm does to
// the sky over your head and to Earth's climate. Every light level on screen is computed: the sky
// dome is drawn at its luminance in cd/m², stars at their illuminance in lux, the landscape lit by the
// sky's illuminance, and the eye's adaptation maps the result to the display.

import * as THREE from 'three';
import { EARTH } from '../model/constants.js';
import * as SP from './earth/skyphysics.js';
import { buildCatalogue, eqToWorldMatrix, EQ_TO_GAL, NAMED } from './earth/stars.js';
import { buildLandscape, horizonProfile } from './earth/landscape.js';
import { SKY_VERT, SKY_FRAG, STAR_VERT, STAR_FRAG, LAND_VERT, LAND_FRAG } from './earth/glsl.js';

const DEG = Math.PI / 180;
const VIEW = { azDeg: 180, altDeg: 15, fov: 62 };     // looking south, a little above the horizon
const PSF_SIGMA_RAD = 1.0e-3;                         // ≈3.4′: night-time eye blur used to turn star flux into luminance
const STAR_SIGMA_PX = 0.75;
const RAD_COOL_K = 0.08;                              // share of the sky–air temperature gap a sky-facing surface takes on
const SKY_HAZE_PER_M = 1 / 25000;                     // airlight over distance (visibility ≈ 100 km)

export default function create(ctx) {
  const { renderer, labels, format, blackbody } = ctx;
  const { sci, pct } = format;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.5, 12000);
  const eyeY = SP.OBSERVER.eyeHeight;
  camera.position.set(0, eyeY, 0);

  // ---------------------------------------------------------------------------
  // Sky geometry: equatorial → horizon at 40°N, LST 18 h; antisolar point due south.
  // ---------------------------------------------------------------------------
  const W = eqToWorldMatrix(SP.OBSERVER.latDeg, SP.OBSERVER.lstHours);
  const antiAlt = (90 - SP.OBSERVER.latDeg - SP.OBSERVER.obliquityDeg) * DEG;
  const antiDir = new THREE.Vector3(0, Math.sin(antiAlt), Math.cos(antiAlt));   // south = +z
  const sunDir = antiDir.clone().negate();
  const antiExt = 10 ** (-0.4 * SP.NIGHT.kV * SP.airmass(antiAlt));             // direct-beam transmission
  // world → galactic = EQ_TO_GAL · Wᵀ
  const galM = new THREE.Matrix3();
  {
    const G = EQ_TO_GAL, m = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m.push(G[i][0] * W[j][0] + G[i][1] * W[j][1] + G[i][2] * W[j][2]);
    galM.set(...m);
  }

  const lumNorm = c => { const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return c.map(v => v / y); };
  const sunRGB = blackbody.blackbodyRGB(5772);
  const swCol = lumNorm(sunRGB.map((v, i) => v * SP.PV_DIFFUSE_TINT[i]));
  const glCol = lumNorm(sunRGB.map((v, i) => v * SP.GLINT.tint[i]));
  const natCol = lumNorm([0.86, 0.95, 1.0]);

  const inv = SP.inverseBandLUT();
  const bAir = SP.bandRadiance(SP.IR_ATM.tAirEmit);

  const U = {
    uLnatZ: { value: SP.magToLum(SP.NIGHT.zenithMag) },
    uHorGain: { value: SP.NIGHT.horizonGain },
    uHorScale: { value: SP.NIGHT.horizonScaleDeg * DEG },
    uK: { value: SP.NIGHT.kV },
    uLdiff: { value: 0 }, uGlintL0: { value: 0 }, uGlintS2: { value: 1e-3 }, uGain: { value: 1 },
    uGlintDir: { value: antiDir },
    uInvT: { value: inv.lut }, uLmax: { value: inv.Lmax },
    uTau0: { value: SP.IR_ATM.tauZenith }, uBair: { value: bAir },
    uTmax: { value: SP.IR_ATM.tMax }, uDbg: { value: 0 },
    uExp: { value: 100 }, uMode: { value: 0 },
    // sky
    uMW: { value: 1.0 }, uGal: { value: galM },
    uSwCol: { value: new THREE.Vector3(...swCol) }, uGlintCol: { value: new THREE.Vector3(...glCol) },
    uNatCol: { value: new THREE.Vector3(...natCol) },
    uLswIR: { value: 0 }, uInterior: { value: 0 }, uIntRad: { value: 0 }, uLswIRint: { value: 0 },
    uSunDir: { value: sunDir },
    // stars
    uPxRatio: { value: 1 }, uTime: { value: 0 }, uShow: { value: 1 },
    uSigmaPx: { value: STAR_SIGMA_PX }, uPsfSr: { value: 2 * Math.PI * PSF_SIGMA_RAD ** 2 },
    // landscape
    uFogK: { value: SKY_HAZE_PER_M }, uSkyE: { value: new THREE.Vector3() }, uGlintE: { value: new THREE.Vector3() },
    uFogCol: { value: new THREE.Vector3() }, uCamPos: { value: camera.position },
    uTground: { value: 288 }, uRadK: { value: RAD_COOL_K }, uTskyHemi: { value: 240 },
  };

  // Sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(9000, 64, 32),
    new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // Stars
  const cat = buildCatalogue(W, blackbody.blackbodyRGB);
  const starGeom = new THREE.BufferGeometry();
  const starPos = new Float32Array(cat.count * 3);
  for (let i = 0; i < cat.count * 3; i++) starPos[i] = cat.dir[i] * 8000;
  starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeom.setAttribute('aMag', new THREE.BufferAttribute(cat.mag, 1));
  starGeom.setAttribute('aCol', new THREE.BufferAttribute(cat.rgb, 3));
  starGeom.setAttribute('aSeed', new THREE.BufferAttribute(cat.seed, 1));
  const stars = new THREE.Points(starGeom, new THREE.ShaderMaterial({
    uniforms: U, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stars.frustumCulled = false;
  stars.renderOrder = 5;
  scene.add(stars);

  // Landscape
  const land = new THREE.Mesh(buildLandscape(), new THREE.ShaderMaterial({
    uniforms: U, vertexShader: LAND_VERT, fragmentShader: LAND_FRAG, vertexColors: true, side: THREE.DoubleSide,
  }));
  scene.add(land);

  // Star bookkeeping for the HUD: which stars clear the skyline, airmass, and the natural-night count.
  const prof = horizonProfile(eyeY);
  const nStar = cat.count;
  const sAlt = new Float32Array(nStar), sMobs0 = new Float32Array(nStar), sCosAnti = new Float32Array(nStar), sUp = new Uint8Array(nStar);
  for (let i = 0; i < nStar; i++) {
    const x = cat.dir[3 * i], y = cat.dir[3 * i + 1], z = cat.dir[3 * i + 2];
    const alt = Math.asin(Math.max(-1, Math.min(1, y)));
    let az = Math.atan2(x, -z); if (az < 0) az += 2 * Math.PI;
    const sky0 = prof[Math.min(prof.length - 1, Math.floor((az / (2 * Math.PI)) * prof.length))];
    sAlt[i] = alt;
    sUp[i] = alt > sky0 + 0.002 ? 1 : 0;
    sMobs0[i] = cat.mag[i] + SP.NIGHT.kV * (SP.airmass(alt) - 1);
    sCosAnti[i] = x * antiDir.x + y * antiDir.y + z * antiDir.z;
  }
  const extAt = new Float32Array(nStar);
  for (let i = 0; i < nStar; i++) extAt[i] = 10 ** (-0.4 * SP.NIGHT.kV * SP.airmass(sAlt[i]));

  /** Visible stars for a swarm sky (diffuse luminance Ldiff, glint g). */
  function starVisibility(Ldiff, g, wantIdx = null) {
    let n = 0;
    const vis = wantIdx ? new Map() : null;
    for (let i = 0; i < nStar; i++) {
      if (!sUp[i]) continue;
      let L = SP.naturalSkyLum(sAlt[i]) + Ldiff;
      if (g) {
        const th = Math.acos(Math.max(-1, Math.min(1, sCosAnti[i])));
        L += g.L0 * Math.exp(-0.5 * th * th / (g.sigma * g.sigma)) * extAt[i];
      }
      const ok = sMobs0[i] < SP.limitingMag(SP.lumToMag(L));
      if (ok) n++;
      if (vis && wantIdx.has(i)) vis.set(i, ok);
    }
    return { n, vis };
  }
  const namedIdx = new Map(NAMED.filter(nm => cat.names.has(nm)).map(nm => [cat.names.get(nm), nm]));
  const natural = starVisibility(0, null);

  // ---------------------------------------------------------------------------
  // Derived numbers for the current state
  // ---------------------------------------------------------------------------
  let D = null;
  let events = null, eventsKey = '';

  function skyNow(state, year) {
    const { params: p, d } = state;
    const now = year === undefined ? state.now : ctx.model.atYear(p, d, year);
    const e = now.earth;
    const ext = d.rAU > 1;
    const Ldiff = ext ? e.nightLux / Math.PI : 0;
    const g = ext ? SP.glint(d.rAU, now.f, d.S, p.satArea, now.nSats) : null;
    const eGlintN = g ? g.E * antiExt : 0;                 // at the ground, normal to the beam
    const eGlintH = eGlintN * Math.sin(antiAlt);           // on level ground
    const eGround = SP.LUX.moonless + (ext ? e.nightLux : 0) + eGlintH;
    const LbgAnti = SP.naturalSkyLum(antiAlt) + Ldiff;
    const glintContrast = g ? (g.L0 * antiExt) / LbgAnti : 0;
    const LnatZ = SP.magToLum(SP.NIGHT.zenithMag);
    const zenithL = LnatZ + Ldiff;
    const mlimZ = SP.limitingMag(SP.lumToMag(zenithL));
    return { now, e, ext, Ldiff, g, eGlintN, eGlintH, eGround, glintContrast, zenithL, mlimZ };
  }

  function findYear(state, pred) {
    const yMax = state.d.growth.yearsToFull + 0.01;
    if (pred(skyNow(state, 0))) return 0;
    if (!pred(skyNow(state, yMax))) return null;
    let lo = 0, hi = yMax;
    for (let i = 0; i < 36; i++) {
      const m = 0.5 * (lo + hi);
      if (pred(skyNow(state, m))) hi = m; else lo = m;
    }
    return hi;
  }

  function computeEvents(state) {
    const { year, ...rest } = state.params;
    const key = JSON.stringify(rest);
    if (key === eventsKey && events) return events;
    eventsKey = key;
    const LnatZ = SP.magToLum(SP.NIGHT.zenithMag);
    events = {
      glint: findYear(state, s => s.glintContrast >= SP.GLINT.visibleContrast),
      fading: findYear(state, s => s.mlimZ <= SP.limitingMag(SP.NIGHT.zenithMag) - 0.5),
      doubled: findYear(state, s => s.Ldiff >= LnatZ),
      moon: findYear(state, s => s.eGround >= SP.LUX.fullMoon),
      starsOut: findYear(state, s => starVisibility(s.Ldiff, s.g).n === 0),
      overcast: findYear(state, s => s.eGround >= SP.LUX.overcastDay),
      runaway: findYear(state, s => s.e.runaway),
    };
    return events;
  }

  function purkinjeJS(L) {
    const Y = 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2];
    const t = Math.min(1, Math.max(0, (Math.log10(Math.max(Y, 1e-30)) + 2.5) / 2.5));
    const s = t * t * (3 - 2 * t);
    const tint = [0.80, 0.92, 1.22], ty = 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2];
    return L.map((v, i) => (Y * tint[i]) / ty * (1 - s) + v * s);
  }

  function derive(state) {
    const { params: p, d, view } = state;
    const s = skyNow(state);
    const { now, e, ext } = s;
    const f = now.f;
    const thermal = view.mode === 'thermal';
    const LnatZ = SP.magToLum(SP.NIGHT.zenithMag);

    // Enlarged: multiply the swarm's light until its diffuse glow is 1.5× the natural sky.
    let gain = 1;
    if (view.exaggerate) {
      if (thermal) {
        const Lsw = ext ? SP.swarmSkyEmissivity(f, p.epsFront) * SP.bandRadiance(now.tSheet) : f * p.epsBack * SP.bandRadiance(now.tSheet);
        gain = Math.max(1, (0.6 * bAir) / Math.max(Lsw, 1e-300));
      } else if (ext) {
        gain = Math.max(1, (1.5 * LnatZ) / Math.max(s.Ldiff, 1e-300));
      }
    }
    gain = Math.min(gain, 1e30);

    const vis = starVisibility(s.Ldiff, s.g, namedIdx);
    // Adaptation: field-average luminance the eye settles on (natural sky ≈1.3× zenith on average).
    const La = 1.3 * LnatZ + gain * (s.Ldiff + s.eGlintH / Math.PI);

    // IR
    const tSheet = now.tSheet;
    const LswExt = ext ? SP.swarmSkyEmissivity(f, p.epsFront) * SP.bandRadiance(tSheet) : 0;
    const LswInt = ext ? 0 : f * p.epsBack * SP.bandRadiance(tSheet);
    const forcing = SP.forcingOf(e);
    const dT = SP.dTRadiating(forcing);
    const tGround = SP.IR_ATM.tSurfaceNow + dT;
    const tSkyZen = SP.skyBandTemp(Math.PI / 2, LswExt * gain);
    const tSkyNat = SP.skyBandTemp(Math.PI / 2, 0);
    const tSkyHemi = SP.skyBandTemp(40 * DEG, LswExt * gain);

    const fin = state.d.earth;
    D = {
      ...s, f, gain, thermal, La, vis, LswExt, LswInt, forcing, dT, tGround, tSkyZen, tSkyNat, tSkyHemi, tSheet,
      finForcing: SP.forcingOf(fin), fin, rAU: d.rAU, events: computeEvents(state), year: p.year,
      yFull: d.growth.yearsToFull, exaggerate: view.exaggerate,
      skyMag: SP.lumToMag(s.zenithL),
    };

    // Uniforms
    U.uMode.value = thermal ? 1 : 0;
    U.uLdiff.value = s.Ldiff;
    U.uGain.value = gain;
    if (s.g) { U.uGlintL0.value = s.g.L0; U.uGlintS2.value = s.g.sigma ** 2; } else U.uGlintL0.value = 0;
    U.uLswIR.value = LswExt;
    U.uInterior.value = ext ? 0 : 1;
    U.uIntRad.value = Math.asin(Math.min(1, d.rAU));
    U.uLswIRint.value = LswInt;
    U.uShow.value = thermal ? 0 : 1;
    U.uTground.value = tGround;
    U.uTskyHemi.value = tSkyHemi;
    const eSky = SP.LUX.moonless, eSw = gain * (ext ? e.nightLux : 0), eGl = gain * s.eGlintN;
    U.uSkyE.value.set(eSky * natCol[0] + eSw * swCol[0], eSky * natCol[1] + eSw * swCol[1], eSky * natCol[2] + eSw * swCol[2]);
    U.uGlintE.value.set(eGl * glCol[0], eGl * glCol[1], eGl * glCol[2]);
    targetLogLa = Math.log(La);
    if (!Number.isFinite(logLa)) logLa = targetLogLa;
  }

  // ---------------------------------------------------------------------------
  // Look-around controls (drag to look, wheel to zoom); the camera never leaves the meadow.
  // ---------------------------------------------------------------------------
  const look = { az: VIEW.azDeg * DEG, alt: VIEW.altDeg * DEG, vAz: 0, vAlt: 0, enabled: false, drag: null, fov: VIEW.fov };
  const canvas = ctx.canvas;
  let stageW = 1, stageH = 1;
  canvas.addEventListener('pointerdown', ev => {
    if (!look.enabled) return;
    look.drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: performance.now() };
    look.vAz = look.vAlt = 0;
    canvas.setPointerCapture?.(ev.pointerId);
  });
  canvas.addEventListener('pointermove', ev => {
    if (!look.enabled || !look.drag || ev.pointerId !== look.drag.id) return;
    const k = (camera.fov * DEG) / stageH;
    const dx = ev.clientX - look.drag.x, dy = ev.clientY - look.drag.y;
    const now = performance.now(), dt = Math.max(1, now - look.drag.t) / 1000;
    look.az -= dx * k; look.alt += dy * k;
    look.vAz = (-dx * k) / dt; look.vAlt = (dy * k) / dt;
    look.drag.x = ev.clientX; look.drag.y = ev.clientY; look.drag.t = now;
  });
  const endDrag = ev => { if (look.drag && ev.pointerId === look.drag.id) look.drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', ev => {
    if (!look.enabled) return;
    ev.preventDefault();
    look.fov = Math.min(75, Math.max(22, look.fov * Math.exp(ev.deltaY * 0.0012)));
  }, { passive: false });

  // ---------------------------------------------------------------------------
  // Labels
  // ---------------------------------------------------------------------------
  const tmpV = new THREE.Vector3();
  const dirFromAzAlt = (azDeg, altDeg) => new THREE.Vector3(
    Math.sin(azDeg * DEG) * Math.cos(altDeg * DEG), Math.sin(altDeg * DEG), -Math.cos(azDeg * DEG) * Math.cos(altDeg * DEG));
  const compass = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]]
    .map(([t, az]) => [t, dirFromAzAlt(az, 0.6)]);
  // Keep the HUD clear of the page header, which wraps onto two rows on narrower screens.
  let hdrBottom = 64, hdrCheck = 0;
  function headerBottom() {
    const now = performance.now();
    if (now - hdrCheck > 500) {
      hdrCheck = now;
      const hdr = document.querySelector('header.top'), toggles = document.querySelector('.viewtoggles');
      const c = canvas.getBoundingClientRect();
      const b = Math.max(hdr ? hdr.getBoundingClientRect().bottom : 0, toggles ? toggles.getBoundingClientRect().bottom : 0);
      if (b > 0) hdrBottom = b - c.top;
    }
    return hdrBottom;
  }
  /** World point that projects to stage pixel (px, py). */
  function screenPoint(px, py) {
    return tmpV.set((px / stageW) * 2 - 1, -(py / stageH) * 2 + 1, 0.5).unproject(camera).clone();
  }

  const fmtLux = E => (E < 0.01 ? sci(E, 2) : E < 100 ? String(Number(E.toPrecision(2))) : E < 1e5 ? Math.round(E).toLocaleString('en-US') : sci(E, 2));
  const fmtYear = y => (y === null || y === undefined ? '—' : y < 0.05 ? '0' : y.toFixed(1));
  const signed = (x, dig = 2) => `${x >= 0 ? '+' : '−'}${sci(Math.abs(x), dig)}`;
  function luxComparison(E) {
    if (E < 0.004) return 'a natural moonless night';
    if (E < SP.LUX.fullMoon) return `${sci(E / SP.LUX.moonless, 2)}× a moonless night`;
    if (E < SP.LUX.civilTwilight) return `${sci(E / SP.LUX.fullMoon, 2)}× full moonlight`;
    if (E < SP.LUX.overcastDay) return `${sci(E / SP.LUX.civilTwilight, 2)}× civil twilight`;
    return `${sci(E / SP.LUX.overcastDay, 2)}× an overcast day`;
  }

  const HUD_W = 272;
  const row = (k, v, vColor = 'var(--fg)') =>
    `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:7px"><span style="color:#c6c0b3;font-family:var(--font-body);font-size:11.5px">${k}</span><b style="font-weight:500;font-size:12.5px;color:${vColor}">${v}</b></div>`;
  const note = t => `<small style="white-space:normal;line-height:1.35;margin-top:1px">${t}</small>`;

  function infernoCss(t) {
    const c = blackbody.inferno(t).map(v => Math.round(Math.min(1, Math.max(0, v)) * 255));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function legendHTML() {
    const Tm = SP.IR_ATM.tMax;
    const stops = Array.from({ length: 11 }, (_, i) => `${infernoCss(i / 10)} ${i * 10}%`).join(',');
    const mark = (T, label, up) => {
      const x = Math.min(100, Math.max(0, (T / Tm) * 100));
      return `<span style="position:absolute;left:${x}%;${up ? 'bottom:15px' : 'top:15px'};transform:translateX(-50%);font-size:9.5px;color:var(--fg);white-space:nowrap">${label}</span>` +
        `<i style="position:absolute;left:${x}%;top:${up ? -3 : 2}px;width:1px;height:9px;background:#fff;opacity:.8"></i>`;
    };
    const skyNow = D.ext ? D.tSkyZen : D.tSkyNat;
    return `<div style="margin-top:12px;color:var(--muted);font-size:10px;letter-spacing:.08em">8–14 µm BRIGHTNESS TEMPERATURE</div>
      <div style="position:relative;height:6px;margin:24px 2px 24px;border-radius:2px;background:linear-gradient(90deg,${stops})">
        ${mark(3, '3 K space', true)}${mark(skyNow, `sky ${Math.round(skyNow)}`, false)}${mark(D.tGround, `ground ${Math.round(D.tGround)}`, true)}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--muted);margin-top:-14px">${[0, 100, 200, 300, 400].map(v => `<span>${v} K</span>`).join('')}</div>`;
  }

  function hudHTML() {
    const t = D;
    const parts = [`<div style="width:${HUD_W}px;white-space:normal">`,
      `<div style="font-size:10px;letter-spacing:.12em;color:var(--muted)">MIDNIGHT · 40°N · JUNE · YEAR ${t.year.toFixed(1)}</div>`];
    if (t.ext) {
      parts.push(row('Light on the ground', `${fmtLux(t.eGround)} lux`, t.eGround > 1 ? 'var(--sun)' : 'var(--fg)'));
      parts.push(note(`swarm glow ${fmtLux(t.e.nightLux)} + glint ${fmtLux(t.eGlintH)} + natural 0.002 · ${luxComparison(t.eGround)}`));
    } else {
      parts.push(row('Light on the ground', `${fmtLux(t.eGround)} lux`));
      parts.push(note(`unchanged: the swarm sits inside Earth’s orbit and its lit faces point at the Sun`));
    }
    const nVis = t.vis.n;
    parts.push(row('Faintest star overhead', t.mlimZ < -1.5 ? 'none' : `mag ${t.mlimZ.toFixed(1)}`, t.mlimZ < 6 ? 'var(--warn)' : 'var(--fg)'));
    parts.push(note(`${nVis.toLocaleString('en-US')} of ${natural.n.toLocaleString('en-US')} stars above this horizon visible · sky ${t.skyMag.toFixed(1)} mag/arcsec²`));
    if (t.ext) {
      parts.push(row('Sky covered by panels', pct(t.f, 2)));
      parts.push(note(`inner faces at ${Math.round(t.tSheet)} K · 8–14 µm zenith ${Math.round(SP.skyBandTemp(Math.PI / 2, t.LswExt))} K (clear sky ${Math.round(t.tSkyNat)} K)`));
    } else {
      parts.push(row('Sunlight blocked by day', pct(t.e.dimming, 2), t.e.dimming > 0.01 ? 'var(--warn)' : 'var(--fg)'));
      parts.push(note(`unless the swarm keeps the Sun–Earth line clear`));
    }
    parts.push(row('Extra heat on Earth', `${signed(t.forcing)} W/m²`, Math.abs(t.forcing) >= 1 ? 'var(--warn)' : 'var(--fg)'));
    parts.push(note(`${sci(Math.abs(t.forcing) / EARTH.co2DoublingForcing, 2)}× the forcing of doubling CO₂ (${EARTH.co2DoublingForcing} W/m²)`));
    const tRad = SP.T_RADIATING_NOW + t.dT;
    const dTs = Math.abs(t.dT) < 0.01 ? `${signed(t.dT)} K` : `${t.dT >= 0 ? '+' : '−'}${Math.abs(t.dT).toFixed(1)} K`;
    parts.push(row('Earth radiates at', `${Math.round(tRad)} K`, t.dT > 5 ? 'var(--warn)' : 'var(--fg)'));
    parts.push(note(`${dTs} vs ${EARTH.tEff} K today · absorbs ${Math.round(t.e.absorbed)} W/m²`));
    if (t.e.runaway) {
      parts.push(`<div style="margin-top:9px;padding:5px 7px;border:1px solid var(--warn);border-radius:4px;color:var(--warn);background:rgba(255,122,89,.12)">RUNAWAY GREENHOUSE<small style="color:#f3b3a2;white-space:normal">absorbs ${Math.round(t.e.absorbed)} W/m², above the ≈${EARTH.runawayAbsorbedLimit} W/m² a wet planet can radiate (Goldblatt et al. 2013): the oceans boil off</small></div>`);
    }
    if (t.thermal) parts.push(legendHTML());
    parts.push('</div>');
    return parts.join('');
  }

  function bannerHTML() {
    const t = D;
    let msg;
    if (t.thermal) msg = t.gain > 1.01 ? `ENLARGED · swarm infrared ×${sci(t.gain, 2)}` : 'ENLARGED · nothing to boost: the swarm already dominates the infrared sky';
    else if (!t.ext) msg = 'ENLARGED · nothing to show: the lit faces of an interior swarm point away from Earth';
    else msg = t.gain > 1.01 ? `ENLARGED · swarm light ×${sci(t.gain, 2)}` : 'ENLARGED · nothing to boost: the swarm already outshines the night';
    return `<div style="font-size:11px;letter-spacing:.06em;color:var(--sun)">${msg}</div><small>stars and landscape shown at true brightness · switch to True scale for what the eye sees</small>`;
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------
  let logLa = NaN, targetLogLa = 0, time = 0;

  const api = {
    id: 'earth', scene, camera, exposure: 1, bloom: 0.35, bloomThreshold: 2.0,
    activate(state) { look.enabled = true; derive(state); logLa = targetLogLa; },
    deactivate() { look.enabled = false; look.drag = null; },
    onState(state) { derive(state); },
    resize(w, h) {
      stageW = w; stageH = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      U.uPxRatio.value = renderer.getPixelRatio();
    },
    update(dt, state) {
      if (!D) derive(state);
      time += dt;
      U.uTime.value = time;
      // inertia
      if (!look.drag) {
        look.az += look.vAz * dt; look.alt += look.vAlt * dt;
        const damp = Math.exp(-dt * 6);
        look.vAz *= damp; look.vAlt *= damp;
      }
      look.alt = Math.min(85 * DEG, Math.max(-8 * DEG, look.alt));
      // portrait screens get a wider view
      const fov = camera.aspect < 1 ? Math.max(look.fov, 72) : look.fov;
      if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
      const fwd = new THREE.Vector3(Math.sin(look.az) * Math.cos(look.alt), Math.sin(look.alt), -Math.cos(look.az) * Math.cos(look.alt));
      camera.up.set(0, 1, 0);
      camera.lookAt(tmpV.copy(camera.position).add(fwd));
      camera.updateMatrixWorld();

      // eye adaptation (fast, for the slider; the real eye takes minutes)
      logLa += (targetLogLa - logLa) * (1 - Math.exp(-dt / 0.25));
      U.uExp.value = SP.eyeExposure(Math.exp(logLa));
      api.bloom = D.thermal ? 0 : 0.35;

      // airlight colour for distant hills = sky near the horizon
      if (!D.thermal) {
        const Lh = SP.naturalSkyLum(2 * DEG), g = D.gain * D.Ldiff;
        const L = purkinjeJS([Lh * natCol[0] + g * swCol[0], Lh * natCol[1] + g * swCol[1], Lh * natCol[2] + g * swCol[2]]);
        U.uFogCol.value.set(L[0] * U.uExp.value, L[1] * U.uExp.value, L[2] * U.uExp.value);
      }

      // --- labels ---
      const top = headerBottom() + 12;
      labels.put('earth-hud', screenPoint(18, top), hudHTML(), 'nodot');
      if (D.exaggerate) labels.put('earth-banner', screenPoint(Math.max(18 + HUD_W + 30, stageW - 18 - 340), top), bannerHTML(), 'nodot');
      for (const [t, v] of compass) labels.put(`earth-c-${t}`, tmpV.copy(v).multiplyScalar(100).add(camera.position), t, 'muted nodot');
      if (D.ext && D.g && (D.glintContrast >= SP.GLINT.visibleContrast || D.exaggerate) && !D.thermal) {
        const th = D.g.theta / DEG;
        const pos = tmpV.copy(dirFromAzAlt(180 + 0.8 * th + 0.6, antiAlt / DEG + 0.8 * th + 0.4)).multiplyScalar(100).add(camera.position);
        labels.put('earth-glint', pos,
          `Glint off sun-facing panels${D.exaggerate && D.gain > 1.01 ? ' (enlarged)' : ''}<small>antisolar point · ${(D.g.fwhm / DEG).toFixed(1)}° across at half brightness · peak ${sci(D.g.L0 * antiExt, 2)} cd/m²</small>`, 'sun');
      }
      if (!D.thermal) {
        for (const [i, name] of namedIdx) {
          if (!D.vis.vis.get(i)) continue;
          const p = tmpV.set(cat.dir[3 * i], cat.dir[3 * i + 1], cat.dir[3 * i + 2]).multiplyScalar(100).add(camera.position);
          labels.put(`earth-s-${name}`, p, name, 'muted');
        }
      }
    },
    caption(state) { if (!D) derive(state); return caption(); },
  };

  function caption() {
    const t = D, ev = t.events;
    const eyebrow = 'Chapter 4 · The consequence';
    const hint = 'Drag to look around, scroll to zoom. Thermal IR shows the 8–14 µm sky. Enlarged multiplies the swarm’s light so you can see where it comes from.';
    const fin = t.fin;
    const finTRad = SP.T_RADIATING_NOW + SP.dTRadiating(t.finForcing);
    const heatNow = `Earth already absorbs <span class="num${Math.abs(t.forcing) >= 1 ? ' hot' : ''}">${signed(t.forcing)} W/m²</span> extra (${sci(Math.abs(t.forcing) / EARTH.co2DoublingForcing, 2)}× a CO₂ doubling).`;
    const heatFin = `Finished swarm (year ${t.yFull.toFixed(0)}): <span class="num hot">${signed(t.finForcing, 3)} W/m²</span>, Earth radiating at <span class="num hot">${Math.round(finTRad)} K</span> instead of ${EARTH.tEff} K and absorbing ${Math.round(fin.absorbed)} W/m²${fin.runaway ? `, past the ≈${EARTH.runawayAbsorbedLimit} W/m² at which the oceans run away (Goldblatt et al. 2013)` : ''}.`;

    if (!t.ext) {
      return {
        eyebrow, hint,
        title: 'The night stays dark. The heat comes anyway.',
        body: `<p>This swarm orbits at <span class="num">${t.rAU.toFixed(2)} AU</span>, inside Earth’s orbit. Its sunlit faces point at the Sun, away from us, so midnight is unchanged: <span class="num">${natural.n.toLocaleString('en-US')}</span> stars.</p>` +
          `<p>By day it blocks <span class="num${t.e.dimming > 0.01 ? ' hot' : ''}">${pct(t.e.dimming, 2)}</span> of the Sun unless it keeps the Sun–Earth line clear, and every watt it captures still leaves as heat that flows outward past Earth. ${heatNow}</p><p>${heatFin}</p>`,
      };
    }

    let title, p1;
    const nVis = t.vis.n, n0 = natural.n;
    const glintTxt = t.g ? `Flat panels aimed at the Sun mirror ${(SP.GLINT.rSpecular * 100).toFixed(0)}% of it straight back: a glow <span class="num">${(t.g.fwhm / DEG).toFixed(1)}°</span> across (half brightness) around the antisolar point, <span class="num">${sci(t.glintContrast, 2)}×</span> the sky around it. Each panel in it is only magnitude ${t.g.satMag.toFixed(1)}; ${sci(t.g.satsInPatch, 2)} of them blur into one patch.` : '';
    if (t.eGround >= SP.LUX.overcastDay) {
      title = 'Night never falls';
      p1 = `At midnight the ground gets <span class="num hot">${fmtLux(t.eGround)} lux</span> — ${luxComparison(t.eGround)} — from sunlight scattered and mirrored back by the panels around the sky. The stars went out in year ${fmtYear(ev.starsOut)}.`;
    } else if (nVis === 0) {
      title = `The stars went out in year ${fmtYear(ev.starsOut)}`;
      p1 = `No star outshines a sky of <span class="num">${sci(t.zenithL, 2)} cd/m²</span>. The ground gets <span class="num hot">${fmtLux(t.eGround)} lux</span> at midnight: ${luxComparison(t.eGround)}. Overcast-daylight levels in year ${fmtYear(ev.overcast)}.`;
    } else if (t.mlimZ < 3) {
      title = 'Only the brightest stars are left';
      p1 = `The sky glows at <span class="num">${t.skyMag.toFixed(1)} mag/arcsec²</span> (natural: ${SP.NIGHT.zenithMag}). The faintest star overhead is magnitude <span class="num">${t.mlimZ.toFixed(1)}</span>: <span class="num hot">${nVis.toLocaleString('en-US')}</span> of ${n0.toLocaleString('en-US')} stars remain. Ground: ${fmtLux(t.eGround)} lux, ${luxComparison(t.eGround)}. All gone by year ${fmtYear(ev.starsOut)}.`;
    } else if (t.mlimZ <= SP.limitingMag(SP.NIGHT.zenithMag) - 0.5) {
      title = 'The faint stars go first';
      p1 = `Sunlight scattered off the panels’ inner faces now brightens the whole sky to <span class="num">${t.skyMag.toFixed(1)} mag/arcsec²</span>. Faintest star overhead: magnitude <span class="num">${t.mlimZ.toFixed(1)}</span>, <span class="num hot">${nVis.toLocaleString('en-US')}</span> of ${n0.toLocaleString('en-US')} stars left. The Milky Way is gone. Every star is gone by year ${fmtYear(ev.starsOut)}.`;
    } else if (t.glintContrast >= SP.GLINT.visibleContrast) {
      title = 'A new glow at midnight';
      p1 = `${glintTxt} The rest of the sky is still dark: faint stars start to fade in year ${fmtYear(ev.fading)}.`;
    } else {
      title = `Nothing visible yet — but Earth already gains ${signed(t.forcing)} W/m²`;
      p1 = `At year ${t.year.toFixed(1)} the panels cover <span class="num">${pct(t.f, 2)}</span> of the sky and add <span class="num">${fmtLux(t.e.nightLux)} lux</span> to the night (a moonless night is 0.002). Their glint at the antisolar point is ${sci(t.glintContrast, 2)}× the background; it becomes visible in year ${fmtYear(ev.glint)}, the stars start to fade in year ${fmtYear(ev.fading)}.`;
    }
    const p2 = (nVis > 0 && t.glintContrast >= SP.GLINT.visibleContrast && title !== 'A new glow at midnight') ? `<p>${glintTxt}</p>` : '';
    return {
      eyebrow, title, hint,
      body: `<p>${p1}</p>${p2}<p>${heatNow} ${heatFin}</p>`,
    };
  }

  window.__earth = { U, look, get D() { return D; } };
  return api;
}

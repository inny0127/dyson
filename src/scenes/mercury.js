// Chapter 1 — Mercury: the planet being mined into a swarm.
//
// Everything on screen is driven by the model (state.d, state.now, constants.MERCURY) plus the
// few industrial assumptions below, each with its source. Scene units: 1 unit = 1,000 km.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bakeTerrain } from './mercury/terrain.js';
import { createIndustry, N_SITES } from './mercury/industry.js';
import {
  SURFACE_VERT, surfaceFrag, CUT_VERT, CUT_FRAG, DRIVER_VERT, DRIVER_FRAG,
  PARTICLE_VERT, PARTICLE_FRAG, SUN_VERT, SUN_FRAG,
} from './mercury/shaders.js';

// ---------------------------------------------------------------------------
// Assumptions this chapter adds to the model (drivers, heat, interior and logistics come from it)
// ---------------------------------------------------------------------------
/** A fixed east–west track points along Mercury's orbital motion (the Hohmann departure direction)
 *  only near local noon and midnight; streams are drawn from tracks within ±10° of those. Visual only:
 *  the model's driver count assumes every track fires all the time (a ±10° window would need 9×). */
const FIRE_WINDOW_DEG = 10;
/** Guideway corridor width (m), only used to ask whether the model's tracks fit on the planet. */
const TRACK_WIDTH = 10;
/** Depth of loose regolith worked before a mining district spreads (m). Lunar regolith is 4–15 m
 *  deep; Mercury's is probably deeper. Sets how fast the strip-mined area grows. */
const STRIP_DEPTH = 10;
/** Thermal-IR emissivity of regolith, rock and radiators. */
const EMISSIVITY = 0.9;
/** Draper point: solids start to glow visibly at ≈798 K. */
const DRAPER_K = 798;
/** Luminous efficacy of sunlight, lm/W (the model uses the same 93 lm/W for night-sky lux). */
const SUN_LM_PER_W = 93;
/** Interior temperatures for the thermal cutaway, rounded from thermal-evolution models (e.g.
 *  Tosi et al. 2013, JGR Planets 118, 2474): conductive lid ~200 km, mantle ~1,600–1,750 K,
 *  core ~1,850 K at the top. Approximate, for the picture only. */
const T_INTERIOR = { lidKm: 200, lidBase: 1600, mantleBase: 1750, coreTop: 1850, coreCentre: 2050, surfaceMean: 440 };
/** Payload motion is shown this many times faster than real time. */
const PAYLOAD_TIME_SCALE = 60;

// Display choices (not physics)
const KM_PER_UNIT = 1000;
const L_UNIT = 1e4;                 // radiance unit in shaders: 10^4 cd/m^2
const BASE_EXPOSURE = 0.085;        // sunlit regolith lands mid-grey under ACES
const MAX_DRAWN_DRIVERS = 4096;
const MAX_STREAMS = 140;
const PER_STREAM = 14;
const PHI_VISIBLE = 3e-4;           // 'Enlarged' grows the footprint to at least this fraction of the surface
const SEED_DIR_BODY = lonLat(-30, -20);   // where the seed factory lands (body frame)

// Surface reflectances (linear sRGB, normal albedo). Mercury is dark and red-sloped (geometric
// albedo 0.142, Bond 0.088); smooth plains are brighter and redder, low-reflectance material darker
// and bluer, fresh crater material ~1.6× brighter and bluer (Denevi & Robinson 2008; Murchie 2015).
const ALBEDO = {
  C_REG: [0.112, 0.100, 0.087],
  C_HRP: [0.132, 0.118, 0.098],
  C_LRM: [0.070, 0.070, 0.072],
  C_FRESH: [0.185, 0.182, 0.176],
  C_MINE: [0.165, 0.160, 0.150],   // freshly exposed crust: unweathered rock is brighter than regolith
  C_MANTLE: [0.25, 0.26, 0.21],    // low-FeO forsterite/enstatite mantle: pale
  C_IRON: [0.40, 0.385, 0.36],     // iron-nickel metal
};

const v3 = a => new THREE.Vector3(...a);
/** Body-frame direction: +y north, longitude from +x toward -z (the direction of spin). */
function lonLat(lonDeg, latDeg) {
  const lo = (lonDeg * Math.PI) / 180, la = (latDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}

export default function create(ctx) {
  const { renderer, canvas, labels, model, constants, format, blackbody } = ctx;
  const { MERCURY, PHYS } = constants;
  const R0 = MERCURY.R / 1e3 / KM_PER_UNIT;                  // scene units
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);

  // --- sunlight ---------------------------------------------------------------
  const SUN = new THREE.Vector3(1, 0, 0);                    // world direction to the Sun
  const sunRGB = blackbody.blackbodyRGB(PHYS.T_SUN);
  const lumY = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const sunRGBN = sunRGB.map(c => c / lumY(sunRGB));         // unit luminance
  const S_MERC = model.flux(MERCURY.a);
  const E_SUN = (SUN_LM_PER_W * S_MERC) / L_UNIT;            // illuminance (lux / L_UNIT)
  const sunE = new THREE.Vector3(...sunRGBN).multiplyScalar(E_SUN);
  const sunAngR = PHYS.R_SUN / (MERCURY.a * PHYS.AU);        // angular radius seen from Mercury, rad
  const L_DAY = (ALBEDO.C_REG[1] * E_SUN) / Math.PI;         // sunlit regolith radiance at normal incidence

  // blackbody radiance table (log10 radiance in L_UNIT, colour per unit luminance)
  const BB_TMIN = 400, BB_TMAX = 40000, BB_N = 256;
  const bbData = new Uint16Array(BB_N * 4);
  for (let i = 0; i < BB_N; i++) {
    const T = BB_TMIN * (BB_TMAX / BB_TMIN) ** (i / (BB_N - 1));
    const rgb = blackbody.blackbodyRGB(T);
    const Y = lumY(rgb) || 1;
    const lg = Math.log10(Math.max(1e-30, blackbody.blackbodyLuminance(T) / L_UNIT));
    bbData.set([lg, rgb[0] / Y, rgb[1] / Y, rgb[2] / Y].map(THREE.DataUtils.toHalfFloat), i * 4);
  }
  const bbTex = new THREE.DataTexture(bbData, BB_N, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  bbTex.minFilter = bbTex.magFilter = THREE.LinearFilter;
  bbTex.needsUpdate = true;
  const bbLum = T => (T > 300 ? blackbody.blackbodyLuminance(T) / L_UNIT : 0);

  // --- terrain + industry ----------------------------------------------------
  const terrain = bakeTerrain(renderer, 1024);
  const industry = createIndustry(SEED_DIR_BODY);

  // --- default camera and cutaway -------------------------------------------
  const camDir0 = new THREE.Vector3(Math.cos(0.28) * Math.cos(1.01), Math.sin(0.28), -Math.cos(0.28) * Math.sin(1.01)).normalize();
  const cut = cutFrame(camDir0, SUN);
  const LIT0 = (1 + camDir0.dot(SUN)) / 2;                   // lit share of the disc in the default view

  // --- uniforms shared by several materials ---------------------------------
  const bodyToWorld = new THREE.Matrix3(), worldToBody = new THREE.Matrix3();
  const U = {
    uR: { value: R0 },
    uBodyToWorld: { value: bodyToWorld },
    uWorldToBody: { value: worldToBody },
    uSun: { value: SUN },
    uSunBody: { value: SUN.clone() },
    uSunE: { value: sunE },
    uSunAng: { value: sunAngR },
    uCut0: { value: cut[0] }, uCut1: { value: cut[1] }, uCut2: { value: cut[2] },
    uCutOn: { value: 1 },
  };
  const surfU = {
    ...U,
    uRkm: { value: MERCURY.R / 1e3 },
    tHeight: { value: terrain.tHeight }, tMask: { value: terrain.tMask },
    tCdf: { value: industry.cdfTex }, tBB: { value: bbTex },
    uBBRange: { value: new THREE.Vector2(Math.log(BB_TMIN), Math.log(BB_TMAX)) },
    uTexelAng: { value: (Math.PI / 2) / terrain.faceSize },
    uRelief: { value: 1 }, uLayer: { value: 0 },
    uSite: { value: industry.sites }, uFill: { value: new Float32Array(N_SITES) },
    uThIn: { value: Float32Array.from(industry.thIn) }, uThMax: { value: Float32Array.from(industry.thMax) },
    uArea: { value: Float32Array.from(industry.areaRaw) },
    uMineShare: { value: 0 }, uPVAlb: { value: 0.03 },
    uTrad: { value: 0 }, uEps: { value: EMISSIVITY },
    uThermal: { value: 0 }, uTss: { value: MERCURY.tDay }, uTnight: { value: MERCURY.tNight },
    uTlo: { value: 80 }, uThi: { value: 800 },
  };
  for (const [k, c] of Object.entries(ALBEDO)) surfU[k] = { value: v3(c) };

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(1, 192, 128),
    new THREE.ShaderMaterial({ vertexShader: SURFACE_VERT, fragmentShader: surfaceFrag(N_SITES), uniforms: surfU }),
  );
  planet.frustumCulled = false;
  scene.add(planet);

  // --- cutaway faces (an illustration: lit for legibility, exposure-compensated) --------
  const cutU = {
    uSun: U.uSun, uSunE: U.uSunE, uR: U.uR,
    uKmPerUnit: { value: KM_PER_UNIT }, uR0km: { value: MERCURY.R / 1e3 }, uRcoreKm: { value: MERCURY.R_CORE / 1e3 },
    uCrustKm: { value: MERCURY.CRUST_THICKNESS / 1e3 }, uComp: { value: 1 },
    uThermal: surfU.uThermal, uTlo: surfU.uTlo, uThi: surfU.uThi,
    uTprof: { value: new THREE.Vector4(T_INTERIOR.surfaceMean, T_INTERIOR.lidBase, T_INTERIOR.lidKm, T_INTERIOR.mantleBase) },
    uTcore: { value: new THREE.Vector2(T_INTERIOR.coreTop, T_INTERIOR.coreCentre) },
    C_CRUST: { value: v3([0.17, 0.165, 0.152]) }, C_MANTLE: { value: v3(ALBEDO.C_MANTLE) }, C_CORE: { value: v3([0.36, 0.34, 0.32]) },
  };
  const quarter = new THREE.CircleGeometry(1, 96, 0, Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: CUT_VERT, fragmentShader: CUT_FRAG, side: THREE.DoubleSide,
      uniforms: { ...cutU, uA: { value: cut[(i + 1) % 3] }, uB: { value: cut[(i + 2) % 3] }, uN: { value: cut[i] } },
    });
    const m = new THREE.Mesh(quarter, mat);
    m.frustumCulled = false;
    scene.add(m);
  }

  // --- ghost of the original radius: silhouette ring + arcs on the cut planes ----
  const ghostMat = new THREE.LineDashedMaterial({ color: 0x9aa3b4, dashSize: 0.018, gapSize: 0.022, transparent: true, opacity: 0.6, depthWrite: false });
  const circlePts = [];
  for (let i = 0; i <= 256; i++) { const t = (i / 256) * Math.PI * 2; circlePts.push(new THREE.Vector3(Math.cos(t), Math.sin(t), 0)); }
  const ghostRing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePts), ghostMat);
  ghostRing.computeLineDistances();
  ghostRing.frustumCulled = false;
  scene.add(ghostRing);
  const ghostArcs = [];
  for (let i = 0; i < 3; i++) {
    const a = cut[(i + 1) % 3], b = cut[(i + 2) % 3];
    const pts = [];
    for (let k = 0; k <= 64; k++) { const t = (k / 64) * Math.PI / 2; pts.push(a.clone().multiplyScalar(Math.cos(t) * R0).addScaledVector(b, Math.sin(t) * R0)); }
    const g = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ghostMat);
    g.computeLineDistances();
    scene.add(g);
    ghostArcs.push(g);
  }

  // --- mass drivers ------------------------------------------------------------
  const drvPos = new Float32Array(MAX_DRAWN_DRIVERS * 4 * 3);
  const drvGeo = new THREE.BufferGeometry();
  drvGeo.setAttribute('position', new THREE.BufferAttribute(drvPos, 3));
  drvGeo.setDrawRange(0, 0);
  const drvU = { ...U, uAlb: { value: 0.45 }, uGlow: { value: 0 } };
  const drivers = new THREE.LineSegments(drvGeo, new THREE.ShaderMaterial({ vertexShader: DRIVER_VERT, fragmentShader: DRIVER_FRAG, uniforms: drvU }));
  drivers.frustumCulled = false;
  scene.add(drivers);
  const driverCentres = [];   // body-frame unit vectors

  // --- payload streams --------------------------------------------------------
  const NPART = MAX_STREAMS * PER_STREAM;
  const partPos = new Float32Array(NPART * 3), partLit = new Float32Array(NPART);
  const partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3).setUsage(THREE.DynamicDrawUsage));
  partGeo.setAttribute('aLit', new THREE.BufferAttribute(partLit, 1).setUsage(THREE.DynamicDrawUsage));
  partGeo.setDrawRange(0, 0);
  const partU = { uSize: { value: 2 }, uCol: { value: new THREE.Vector3(1, 1, 1) } };
  const particles = new THREE.Points(partGeo, new THREE.ShaderMaterial({ vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG, uniforms: partU }));
  particles.frustumCulled = false;
  scene.add(particles);

  // --- the Sun at its true angular size (1.38° from Mercury) ------------------------
  const SUN_DIST = 600;
  const sunU = { uCol: { value: new THREE.Vector3() } };
  const sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: SUN_VERT, fragmentShader: SUN_FRAG, depthWrite: false, uniforms: sunU,
  }));
  sunMesh.position.copy(SUN).multiplyScalar(SUN_DIST);
  sunMesh.scale.setScalar(SUN_DIST * Math.tan(sunAngR));
  scene.add(sunMesh);

  // --- controls ---------------------------------------------------------------
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.6;
  controls.minDistance = R0 * 1.12;
  controls.maxDistance = R0 * 26;
  controls.enabled = false;
  const DEFAULT_DIST = 18.5;
  camera.position.copy(camDir0).multiplyScalar(DEFAULT_DIST);
  controls.target.set(0, 0, 0);
  controls.update();

  // ---------------------------------------------------------------------------
  // Numbers
  // ---------------------------------------------------------------------------
  const YEAR = PHYS.YEAR, SIGMA = PHYS.SIGMA;
  const A0 = 4 * Math.PI * MERCURY.R ** 2;
  const shellFrac = MERCURY.M_SHELL / MERCURY.M;

  /** Surface footprint of the industry for a given mass dug out and digging rate. */
  function footprint(p, d, mined, minedRate) {
    const L = d.logistics;
    const R = model.mercuryRadius(mined);
    const etaPV = Math.max(1e-4, model.pvEfficiency(d.tAtMercury, p));
    const pvCap = Math.PI * R * R * S_MERC * etaPV;          // W if every square metre of Mercury were PV
    const Psurf = minedRate * (L.launchEnergyPerKg + p.heatPerKg * 1e6);   // launch energy + surface losses
    const phiMine = Math.min(1, mined / (MERCURY.RHO_CRUST * STRIP_DEPTH * A0));
    const phiPV = Math.min(1 - phiMine, Psurf / pvCap);
    return { R, etaPV, pvCap, Psurf, phiMine, phiPV, phi: phiMine + phiPV };
  }

  function numbers(state) {
    const { params: p, d, now: n } = state;
    const L = d.logistics;
    const mined = n.mercuryRemoved * MERCURY.M;
    const minedRate = n.minedRate ?? 0;
    const growing = minedRate > 0;
    const fp = footprint(p, d, mined, minedRate);
    const R = n.mercuryRadius;
    const A = 4 * Math.PI * R * R;
    const heat = n.heatOnMercury ?? 0;
    // the waste heat is shed by radiators on the night half of the industrial area
    const tRad = fp.phi > 0 && heat > 0 ? (heat / (EMISSIVITY * SIGMA * A * fp.phi * 0.5)) ** 0.25 : 0;
    const yFor = m => d.growth.yearsForMass(m / L.minedPerDelivered);
    return {
      ...fp,
      mined, minedRate, growing, R, A, heat, tRad,
      rate: n.exportRate ?? 0,
      nDrivers: n.massDrivers ?? 0,
      track: L.trackLength,
      v: L.vLaunch, vInf: L.vInf, eKin: L.launchEnergyPerKg,
      depth: mined < 1e-6 * MERCURY.M ? mined / (A0 * MERCURY.RHO_CRUST) : MERCURY.R - R,
      trackArea: (n.massDrivers ?? 0) * L.trackLength * TRACK_WIDTH,
      layer: n.mercurySurface ?? 'crust',
      yCrust: d.massMined > MERCURY.M_CRUST ? yFor(MERCURY.M_CRUST) : null,
      yMantle: d.massMined > MERCURY.M_SHELL ? yFor(MERCURY.M_SHELL) : null,
      outward: d.rAU > MERCURY.a,
    };
  }

  // ---------------------------------------------------------------------------
  // Drivers: driver j is built when the count reaches j+1, somewhere inside the footprint of that time.
  // ---------------------------------------------------------------------------
  let placedFor = null;
  function placeDrivers(state) {
    const { params: p, d } = state;
    const L = d.logistics;
    const key = `${p.doublingYears}|${p.seedMass}|${p.pvEff}|${p.pvTempCo}|${p.heatPerKg}|${L.vLaunch}|${d.tAtMercury}`;
    if (key === placedFor) return;
    placedFor = key;
    const r = industry.rng(7);
    const half = L.trackLength / 2 / MERCURY.R;            // half track length, rad
    const Td = p.doublingYears * YEAR;
    const perDriver = constants.INDUSTRY.driverThroughput;
    driverCentres.length = 0;
    const east = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Vector3();
    for (let j = 0; j < MAX_DRAWN_DRIVERS; j++) {
      const minedRate = (j + 0.5) * perDriver;
      const mined = (minedRate * Td) / Math.LN2;
      const phi = footprint(p, d, mined, minedRate).phi;
      const c = j === 0 ? SEED_DIR_BODY.clone() : industry.samplePoint(Math.min(1, phi), r);
      driverCentres.push(c);
      east.crossVectors(up, c).normalize();
      for (let s = 0; s < 2; s++) {
        for (let e = 0; e < 2; e++) {
          const t = (s + e - 1) * half;
          q.copy(c).multiplyScalar(Math.cos(t)).addScaledVector(east, Math.sin(t));
          drvPos.set([q.x, q.y, q.z], (j * 4 + s * 2 + e) * 3);
        }
      }
    }
    drvGeo.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // Payload trajectory: hyperbola from a horizontal launch at the surface (periapsis).
  // ---------------------------------------------------------------------------
  const HYP_N = 256;
  const hypR = new Float32Array(HYP_N), hypTh = new Float32Array(HYP_N);
  let hypLife = 0;   // real seconds a payload is shown
  function buildHyperbola(state) {
    const n = state.now;
    const mu = PHYS.G * Math.max(1e20, MERCURY.M - n.mercuryRemoved * MERCURY.M);
    const rp = n.mercuryRadius, vp = state.d.logistics.vLaunch;
    const e = (rp * vp * vp) / mu - 1;
    if (!(e > 1.0001)) { hypLife = 0; return; }
    const aAbs = rp / (e - 1);
    const nMot = Math.sqrt(mu / aAbs ** 3);
    const k = Math.sqrt((e + 1) / (e - 1));
    const solve = M => { let H = Math.asinh(M / e); for (let i = 0; i < 12; i++) H -= (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1); return H; };
    const Hend = Math.acosh(((5 * rp) / aAbs + 1) / e);
    const tEnd = (e * Math.sinh(Hend) - Hend) / nMot;       // until 5 radii out
    for (let i = 0; i < HYP_N; i++) {
      const t = tEnd * (i / (HYP_N - 1)) ** 1.5;
      const H = solve(nMot * t);
      hypR[i] = (aAbs * (e * Math.cosh(H) - 1)) / 1e3 / KM_PER_UNIT;
      hypTh[i] = 2 * Math.atan(k * Math.tanh(H / 2));
    }
    hypLife = tEnd / PAYLOAD_TIME_SCALE;
  }
  function hypAt(f) {
    const x = Math.pow(Math.min(1, Math.max(0, f)), 1 / 1.5) * (HYP_N - 1);
    const i = Math.min(HYP_N - 2, Math.floor(x)), t = x - i;
    return [hypR[i] + (hypR[i + 1] - hypR[i]) * t, hypTh[i] + (hypTh[i + 1] - hypTh[i]) * t];
  }

  // ---------------------------------------------------------------------------
  // State → uniforms
  // ---------------------------------------------------------------------------
  let N = null;
  let realTime = 0;
  let meterExpo = 1;          // camera auto-exposure factor relative to BASE_EXPOSURE (smoothed)
  let lGlow = 0;              // radiance of the night-side radiators
  const fill = surfU.uFill.value;
  const self = {
    id: 'mercury', scene, camera,
    exposure: BASE_EXPOSURE, bloom: 0.2, bloomThreshold: 1.0,
    enlargeK: 1,

    activate() { controls.enabled = true; },
    deactivate() { controls.enabled = false; },

    onState(state) {
      N = numbers(state);
      const thermal = state.view.mode === 'thermal';
      placeDrivers(state);
      buildHyperbola(state);

      U.uR.value = N.R / 1e3 / KM_PER_UNIT;
      surfU.uRkm.value = N.R / 1e3;

      // footprint (optionally enlarged so sub-pixel industry can be seen)
      let phi = N.phi;
      self.enlargeK = 1;
      if (state.view.exaggerate && phi > 0 && phi < PHI_VISIBLE) { self.enlargeK = PHI_VISIBLE / phi; phi = PHI_VISIBLE; }
      industry.allocate(Math.min(1, phi), fill);
      surfU.uMineShare.value = N.phi > 0 ? N.phiMine / N.phi : 0;
      surfU.uPVAlb.value = state.params.reflectVis ?? 0.03;

      const stripKm = N.phiMine >= 1 ? N.depth / 1e3 : 0;
      surfU.uRelief.value = Math.exp(-stripKm / 1.5);
      surfU.uLayer.value = N.layer === 'core' ? 2 : N.layer === 'mantle' ? 1 : 0;
      surfU.uTrad.value = N.tRad;
      lGlow = EMISSIVITY * bbLum(N.tRad);

      // thermal scale: log, 80 K to the hottest thing on screen
      surfU.uThi.value = Math.max(760, T_INTERIOR.coreCentre, N.tRad * 1.15);
      surfU.uThermal.value = thermal ? 1 : 0;
      self.bloom = thermal ? 0 : 0.2;
      drivers.visible = !thermal;

      const nDraw = Math.min(MAX_DRAWN_DRIVERS, N.nDrivers);
      drvGeo.setDrawRange(0, nDraw * 4);
      partU.uSize.value = state.view.exaggerate ? 3.5 : 1.6;
    },

    update(dt, state) {
      if (!N) self.onState(state);
      realTime += dt;
      controls.update();
      const thermal = state.view.mode === 'thermal';

      // spin relative to the Sun: one solar day (175.94 d) per turn, on the shared sim clock
      const psi = (2 * Math.PI * state.simTime) / (MERCURY.solarDayDays * PHYS.DAY);
      bodyToWorld.setFromMatrix4(new THREE.Matrix4().makeRotationY(psi));
      worldToBody.copy(bodyToWorld).transpose();
      U.uSunBody.value.copy(SUN).applyMatrix3(worldToBody);

      const dist = camera.position.length();
      camera.near = Math.max(0.005, (dist - R0) * 0.3);
      camera.far = dist + SUN_DIST * 1.2;
      camera.updateProjectionMatrix();
      const camDir = camera.position.clone().normalize();

      // Camera metering: like an auto-exposing camera, balance the sunlit part of the disc against
      // the glowing night side. Turn the camera to the night side and the radiators come up.
      const lit = (1 + camDir.dot(SUN)) / 2;
      const meter = Math.max(lit * L_DAY, (1 - lit) * lGlow * 2.5, 0.04 * L_DAY);
      const target = THREE.MathUtils.clamp((LIT0 * L_DAY) / meter, 1 / 4096, 24);
      meterExpo = Math.exp(THREE.MathUtils.lerp(Math.log(meterExpo), Math.log(target), 1 - Math.exp(-dt * 4)));
      self.exposure = thermal ? 1 : BASE_EXPOSURE * meterExpo;
      cutU.uComp.value = 1 / meterExpo;
      sunU.uCol.value.set(...sunRGB).multiplyScalar(60 / meterExpo);   // real disc ~2×10^5 units; clamped for bloom

      // ghost ring at the original radius (silhouette as seen from the camera)
      const Rs = U.uR.value;
      const pxPerUnit = (renderer.domElement.clientHeight || 800) / (2 * dist * Math.tan((camera.fov * Math.PI) / 360));
      const gapPx = (R0 - Rs) * pxPerUnit;
      const showGhost = gapPx > 1.0;
      ghostRing.visible = showGhost;
      for (const g of ghostArcs) g.visible = showGhost;
      if (showGhost) {
        const sil = R0 * Math.sqrt(Math.max(0, 1 - (R0 / dist) ** 2));
        ghostRing.position.copy(camDir).multiplyScalar((R0 * R0) / dist);
        ghostRing.scale.setScalar(sil);
        ghostRing.lookAt(camera.position);
      }
      sunMesh.lookAt(camera.position);
      sunMesh.visible = !thermal;

      updateParticles(state, camDir);
      putLabels(state, camDir, dist, gapPx, pxPerUnit);
    },

    resize(w, h) {
      camera.aspect = w / h;
      if (w > 760) camera.setViewOffset(w, h, -w * 0.09, h * 0.075, w, h);
      else camera.setViewOffset(w, h, 0, h * 0.14, w, h);
      camera.updateProjectionMatrix();
    },

    caption(state) { return caption(state); },
  };

  // ---------------------------------------------------------------------------
  const tmpW = new THREE.Vector3(), tmpQ = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const VHAT = new THREE.Vector3(0, 0, 1);   // Mercury's orbital velocity in this frame (prograde)
  let streamAnchor = null;
  const inCut = v => v.dot(cut[0]) > 0 && v.dot(cut[1]) > 0 && v.dot(cut[2]) > 0;
  function updateParticles(state, camDir) {
    streamAnchor = null;
    if (!N || !N.growing || hypLife <= 0 || state.view.mode === 'thermal') { partGeo.setDrawRange(0, 0); return; }
    const nDraw = Math.min(MAX_DRAWN_DRIVERS, N.nDrivers);
    const win = (FIRE_WINDOW_DEG * Math.PI) / 180;
    const sign = N.outward ? 1 : -1;
    const Rs = U.uR.value;
    let s = 0;
    partU.uCol.value.set(0.92, 0.9, 0.86).multiplyScalar(2.2 / meterExpo);
    for (let j = 0; j < nDraw && s < MAX_STREAMS; j++) {
      tmpW.copy(driverCentres[j]).applyMatrix3(bodyToWorld);
      const lon = Math.atan2(-tmpW.z, tmpW.x);
      if (!(Math.abs(lon) < win || Math.abs(lon) > Math.PI - win) || inCut(tmpW)) continue;
      tmpQ.copy(VHAT).multiplyScalar(sign).addScaledVector(tmpW, -sign * VHAT.dot(tmpW)).normalize();
      const off = (j * 0.6180339) % 1;
      for (let i = 0; i < PER_STREAM; i++) {
        const f = (realTime / hypLife + i / PER_STREAM + off) % 1;
        const [r, th] = hypAt(f);
        tmpP.copy(tmpW).multiplyScalar(Math.cos(th) * r).addScaledVector(tmpQ, Math.sin(th) * r);
        const k = s * PER_STREAM + i;
        partPos[k * 3] = tmpP.x; partPos[k * 3 + 1] = tmpP.y; partPos[k * 3 + 2] = tmpP.z;
        const along = tmpP.dot(SUN);
        const lit = along < 0 && tmpP.lengthSq() - along * along < Rs * Rs ? 0 : 1;   // Mercury's shadow
        const fade = Math.min(1, f / 0.04) * (1 - THREE.MathUtils.smoothstep(f, 0.55, 1));
        partLit[k] = lit * fade;
        if (!streamAnchor && f > 0.3 && f < 0.45 && lit) streamAnchor = tmpP.clone();
      }
      s++;
    }
    partGeo.setDrawRange(0, s * PER_STREAM);
    partGeo.attributes.position.needsUpdate = true;
    partGeo.attributes.aLit.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  const camRight = new THREE.Vector3(), camUp = new THREE.Vector3();
  const km = x => `${Math.round(x / 1e3).toLocaleString('en-US')} km`;
  const area = m2 => (m2 >= 1e6 ? `${format.sci(m2 / 1e6)} km²` : `${format.sci(m2)} m²`);
  function depthStr(m) {
    if (m >= 1e-3) return format.length(m);
    if (m >= 1e-6) return `${format.sci(m * 1e6)} µm`;
    return `${format.sci(m * 1e9)} nm`;
  }
  const kelvin = T => `${Math.round(T).toLocaleString('en-US')} K`;

  function putLabels(state, camDir, dist, gapPx, pxPerUnit) {
    if (!N) return;
    camera.updateMatrixWorld();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const Rs = U.uR.value;
    const thermal = state.view.mode === 'thermal';
    const sil = r => r * Math.sqrt(Math.max(0, 1 - (r / dist) ** 2));
    const at = (ang, r, out = 1) => camRight.clone().multiplyScalar(Math.cos(ang) * sil(r) * out)
      .addScaledVector(camUp, Math.sin(ang) * sil(r) * out).addScaledVector(camDir, (r * r) / dist);

    // radius
    const shrunk = MERCURY.R - N.R;
    const stops = Math.log2(meterExpo);
    const expoNote = !thermal && Math.abs(stops) > 0.6 ? `<small>camera exposure ${stops > 0 ? '+' : '−'}${Math.abs(stops).toFixed(1)} stops (auto)</small>` : '';
    labels.put('m-radius', at(0.62, Rs, 1.04),
      `Mercury now · R = ${km(N.R)}${shrunk > 300 ? `<small>${format.length(shrunk)} of rock gone from every point of the surface</small>` : ''}${expoNote}`, 'big');
    if (gapPx > 3) labels.put('m-orig', at(-0.3, R0, 1.0), `original ${km(MERCURY.R)}`, 'muted');

    // core radius on the cutaway (face most turned to the camera)
    let bi = 0;
    for (let i = 1; i < 3; i++) if (cut[i].dot(camDir) > cut[bi].dot(camDir)) bi = i;
    const ca = cut[(bi + 1) % 3], cb = cut[(bi + 2) % 3];
    const rc = Math.min(MERCURY.R_CORE, N.R) / 1e3 / KM_PER_UNIT;
    labels.put('m-core', ca.clone().multiplyScalar(Math.cos(0.9) * rc * 0.98).addScaledVector(cb, Math.sin(0.9) * rc * 0.98),
      N.layer === 'core' ? `bare iron core · ${km(N.R)}` : `iron core ${km(MERCURY.R_CORE)}`, 'cool');
    if (N.R - MERCURY.R_CORE > 60e3) {
      const rm = (MERCURY.R_CORE + (N.R - MERCURY.R_CORE) * 0.5) / 1e3 / KM_PER_UNIT;
      const left = Math.max(0, MERCURY.M_SHELL - N.mined);
      labels.put('m-shell', ca.clone().multiplyScalar(Math.cos(0.32) * rm).addScaledVector(cb, Math.sin(0.32) * rm),
        `rock: crust + mantle<small>${format.pct(left / MERCURY.M, 1)} of Mercury’s mass left</small>`, 'muted nodot');
    }

    // industry: label the biggest district facing the camera
    let best = -1, bestScore = 0;
    for (let k = 0; k < N_SITES; k++) {
      if (fill[k] <= 0) continue;
      tmpW.copy(industry.sites[k]).applyMatrix3(bodyToWorld);
      const facing = tmpW.dot(camDir);
      if (facing < 0.3 || inCut(tmpW)) continue;
      const score = fill[k] * industry.area[k] * (0.3 + facing) * (tmpW.dot(SUN) > 0 ? 2 : 1) + 1e-30;
      if (score > bestScore) { bestScore = score; best = k; }
    }
    const drv = N.nDrivers > 0 ? `<small>${format.sci(N.nDrivers)} mass driver${N.nDrivers === 1 ? '' : 's'}, ${format.sci(N.track / 1e3, 2)} km each</small>` : '';
    if (best >= 0 && N.phi < 0.98) {
      const p = industry.sites[best].clone().applyMatrix3(bodyToWorld).multiplyScalar(Rs);
      const indArea = N.phi * A0;
      const pxArea = (indArea / 1e6 / KM_PER_UNIT ** 2) * pxPerUnit * pxPerUnit;
      let sub = '';
      if (state.view.exaggerate && self.enlargeK > 1.5) sub = `<small>area drawn ×${format.sci(self.enlargeK, 2)} (enlarged)</small>`;
      else if (pxArea < 2) sub = '<small>smaller than a pixel here · Enlarged shows it</small>';
      labels.put('m-ind', p, `industry ${area(indArea)}${drv}${sub}`, 'sun');
    } else if (N.phi >= 0.98 && N.growing) {
      labels.put('m-ind', at(-2.35, Rs, 1.03), `whole surface industrial${drv}`, 'sun');
    }

    // night-side radiators
    if (N.tRad > 500) {
      const nightDir = camRight.clone().multiplyScalar(0.55).addScaledVector(camUp, -0.35).addScaledVector(camDir, 0.6).normalize();
      if (nightDir.dot(SUN) < -0.05) {
        labels.put('m-rad', nightDir.multiplyScalar(Rs), `night-side radiators ${kelvin(N.tRad)}<small>shedding ${format.watts(N.heat)} of digging and launch heat</small>`, 'ir');
      }
    }

    if (streamAnchor) {
      labels.put('m-pay', streamAnchor, `payloads leave at ${(N.v / 1e3).toFixed(1)} km/s<small>export ${format.sci(N.rate)} kg/s · motion ×${PAYLOAD_TIME_SCALE}</small>`, '');
    }

    // Sun
    const sp = SUN.clone().multiplyScalar(SUN_DIST);
    if (!thermal && sp.clone().sub(camera.position).normalize().dot(camDir.clone().negate()) > 0.85) {
      labels.put('m-sun', sp.clone().addScaledVector(camUp, SUN_DIST * Math.tan(sunAngR) * 1.6), `Sun · ${((2 * sunAngR * 180) / Math.PI).toFixed(2)}° across from here`, 'sun');
    }

    // thermal legend, pinned to the upper-left of the stage
    if (thermal) {
      const lo = surfU.uTlo.value, hi = surfU.uThi.value;
      const stopsCss = [];
      for (let i = 0; i <= 10; i++) stopsCss.push(`rgb(${blackbody.inferno(i / 10).map(c => Math.round(c * 255)).join(',')}) ${i * 10}%`);
      const ticks = [100, 200, 400, 700, 1000, 2000, 5000, 10000, 20000].filter(t => t >= lo && t <= hi);
      const tickHtml = ticks.map(t => `<span style="position:absolute;left:${(Math.log(t / lo) / Math.log(hi / lo)) * 100}%;transform:translateX(-50%)">${t >= 1000 ? `${t / 1000}k` : t}</span>`).join('');
      const html = '<div style="font-size:10px;color:var(--muted);margin-bottom:3px">temperature, K (log scale)</div>'
        + `<div style="width:220px;height:8px;border-radius:2px;background:linear-gradient(90deg,${stopsCss.join(',')})"></div>`
        + `<div style="position:relative;width:220px;height:12px;font-size:10px;margin-top:2px">${tickHtml}</div>`;
      labels.put('m-legend', new THREE.Vector3(-0.95, 0.72, 0.5).unproject(camera), html, 'nodot');
    }
  }

  // ---------------------------------------------------------------------------
  function caption(state) {
    const { params: p, d, now: n } = state;
    if (!N) N = numbers(state);
    const f = format;
    const g = d.growth;
    const num = (s, hot) => `<span class="num${hot ? ' hot' : ''}">${s}</span>`;
    const title = d.fracShellMined > 1 ? 'You have to eat through Mercury’s mantle' : `The swarm needs ${f.pct(d.fracShellMined, 0)} of Mercury’s rock`;
    let finished = `Finished: the swarm takes ${num(f.pct(d.fracMercuryMined, 0))} of Mercury (${f.pct(d.fracMercury, 0)} as satellites, the rest as propellant to circularise).`;
    finished += d.fracShellMined > 1
      ? ` Crust and mantle are only ${num(f.pct(shellFrac, 0))}: crust gone in year ${num(f.sci(N.yCrust, 3))}, mantle in ${num(f.sci(N.yMantle, 3))}, done in ${num(f.sci(g.yearsToFull, 3))}.`
      : ` Done in year ${num(f.sci(g.yearsToFull, 3))}.`;

    if (state.view.mode === 'thermal') {
      const body = [
        `<p>Sunlit ground peaks at ${num(`${MERCURY.tDay} K`)} at perihelion, below the ${num('~800 K')} Draper point: sunlight alone never makes Mercury glow. Nights fall to ${num(`${MERCURY.tNight} K`)}.</p>`,
        N.growing
          ? `<p>Digging and launch losses (${num(`${f.sci(p.heatPerKg, 2)} MJ/kg`)}) leave ${num(f.watts(N.heat))} on Mercury${n.heatLimited ? ', the most it can shed' : ''}. Radiated from the night side that takes ${num(kelvin(N.tRad), N.tRad > DRAPER_K)}${N.tRad > DRAPER_K ? ': red heat' : ''}.</p>`
          : '<p>The swarm is complete and the industry is cold.</p>',
        N.growing
          ? `<p>Refining happens in orbit: ${num(f.watts(n.processingPower))} rejected at ${num(`${constants.INDUSTRY.refineryTemp} K`)} needs ${num(`${f.sci(n.refineryRadiatorArea)} m²`)} of radiator, a disc ${num(km(n.refineryDiscRadius))} in radius.</p>`
          : '',
      ];
      return { eyebrow: 'Chapter 1 · The mine · thermal infrared', title, body: body.join(''), hint: 'False colour, log scale. Cutaway interior temperatures are rough model values.' };
    }

    let pNow = `<p>Year ${f.sci(p.year, 3)}: ${num(f.kg(N.mined))} dug out, ${num(f.pct(n.mercuryRemoved, 2))} of Mercury. Spread over the planet that is ${num(depthStr(N.depth))} of rock`;
    pNow += MERCURY.R - N.R > 500 ? `; the radius is down to ${num(km(N.R))}${N.layer !== 'crust' ? ` and the surface is ${N.layer === 'core' ? 'bare iron' : 'mantle rock'}` : ''}.</p>` : '.</p>';

    let pInd;
    if (!N.growing) {
      pInd = `<p>The swarm is complete and the drivers are idle. What is left is a ${num(km(N.R))} ball, ${N.layer === 'core' ? 'bare iron' : 'mostly iron'}.</p>`;
    } else {
      pInd = `<p>Launching ${num(`${f.sci(N.minedRate)} kg/s`)} at ${num(`${(N.v / 1e3).toFixed(1)} km/s`)} (${num(`${f.sci(N.eKin / 1e6, 2)} MJ/kg`)}) takes ${num(f.sci(N.nDrivers))} mass driver${N.nDrivers === 1 ? '' : 's'} ${num(`${f.sci(N.track / 1e3, 2)} km`)} long.`;
      if (n.heatLimited) {
        pInd += ` Since year ${num(f.sci(g.tCap, 3))} growth is linear: Mercury can shed only ${num(f.watts(p.mercuryHeatLimit), true)} of waste heat.`;
      } else if (N.phiPV < 1 - N.phiMine - 1e-9) {
        pInd += ` They draw ${num(f.watts(N.Psurf))} from ${num(area(N.phiPV * A0))} of PV.`;
      } else {
        pInd += ` They draw ${num(f.watts(N.Psurf))}, ${num(`${f.sci(N.Psurf / N.pvCap, 2)}×`, true)} what PV on all of Mercury gives at ${num(kelvin(d.tAtMercury))}: the rest is beamed down.`;
      }
      pInd += '</p>';
    }
    return {
      eyebrow: 'Chapter 1 · The mine',
      title,
      body: pNow + pInd + `<p>${finished}</p>`,
      hint: 'Drag to orbit, scroll to zoom. Surface is procedural, not a map; the cutaway is an illustration. Spin shown at 6 days/s, payloads at ×60.',
    };
  }

  return self;
}

/** Octant cutaway frame facing camDir, tilted toward the Sun and up, right-handed. */
function cutFrame(camDir, sun) {
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(camDir.clone().negate(), up).normalize();
  const camUp = new THREE.Vector3().crossVectors(right, camDir.clone().negate()).normalize();
  const m = camDir.clone().addScaledVector(sun, 0.45).addScaledVector(camUp, 0.3).normalize();
  const a = new THREE.Vector3().crossVectors(m, up).normalize();
  const b = new THREE.Vector3().crossVectors(m, a).normalize();
  const tilt = Math.acos(1 / Math.sqrt(3));
  let best = null;
  for (let tw = 0; tw < 360; tw += 1) {
    const e = [0, 1, 2].map(i => {
      const ang = ((tw + i * 120) * Math.PI) / 180;
      const dir = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
      return m.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(dir, Math.sin(tilt)).normalize();
    });
    const score = Math.min(...e.map(v => v.dot(camDir))) + 0.5 * Math.min(...e.map(v => v.dot(sun)));
    if (!best || score > best.score) best = { score, e };
  }
  const e = best.e;
  if (new THREE.Vector3().crossVectors(e[0], e[1]).dot(e[2]) < 0) [e[1], e[2]] = [e[2], e[1]];
  return e;
}

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
// Assumptions this chapter adds to the model
// ---------------------------------------------------------------------------
/** Mass-driver acceleration (g). Payloads are packaged film and chips; gun-launched electronics
 *  (artillery fuzes) survive >10,000 g, so 100 g is gentle. Sets track length L = v²/2a. */
const DRIVER_ACCEL_G = 100;
/** kg/s per track while firing: 10 kg packets at 100 Hz (≈77 GW of electricity at 11.8 km/s). */
const DRIVER_RATE = 1000;
/** A fixed east–west track points along Mercury's orbital motion (the Hohmann departure direction)
 *  only near local noon and midnight. Firing within ±10° of those costs <0.2 km/s of v∞. */
const FIRE_WINDOW_DEG = 10;
const DRIVER_DUTY = (4 * FIRE_WINDOW_DEG) / 360;
/** Electrical-to-kinetic efficiency of a linear-synchronous-motor launcher; the Kolm/O'Neill
 *  mass-driver studies (1977–79) assumed 0.7–0.9. The losses stay on Mercury as heat. */
const DRIVER_EFF = 0.9;
/** Guideway corridor width (m), used only to ask whether the tracks fit on the planet. */
const TRACK_WIDTH = 10;
/** Energy to turn oxide rock into metal, J/kg. Thermodynamic floor from standard enthalpies of
 *  formation (NIST-JANAF): SiO2→Si 32 MJ/kg, Al2O3→Al 31 MJ/kg, MgO→Mg 25 MJ/kg. Real smelters
 *  use 1.5–2× this (Hall–Héroult aluminium ≈ 50 MJ/kg). All of it ends as heat on Mercury. */
const E_SMELT = 30e6;
/** Depth of loose regolith worked before a district spreads (m). Lunar regolith is 4–15 m deep. */
const STRIP_DEPTH = 10;
/** Thermal-IR emissivity of regolith and rock. */
const EMISSIVITY = 0.9;
/** Draper point: solids start to glow visibly at ≈798 K. */
const DRAPER_K = 798;
/** Luminous efficacy of sunlight, lm/W (the model uses the same 93 lm/W for night-sky lux). */
const SUN_LM_PER_W = 93;
/** Crust thickness, km: 35 ± 18 km (Padovan et al. 2015, GRL 42, 1029). */
const CRUST_KM = 35;
/** Interior temperatures for the thermal cutaway, rounded from thermal-evolution models (e.g.
 *  Tosi et al. 2013, JGR Planets 118, 2474): conductive lid ~200 km, mantle ~1,600–1,750 K,
 *  core ~1,850 K at the top. Approximate, for the picture only. */
const T_INTERIOR = { lidKm: 200, lidBase: 1600, mantleBase: 1750, coreTop: 1850, coreCentre: 2050, surfaceMean: 440 };
/** Payload motion is shown this many times faster than real time. */
const PAYLOAD_TIME_SCALE = 60;

// Display choices (not physics)
const KM_PER_UNIT = 1000;
const L_UNIT = 1e4;                 // radiance unit in shaders: 10^4 cd/m^2
const BASE_EXPOSURE = 0.22;
const MAX_DRAWN_DRIVERS = 4096;
const MAX_STREAMS = 360;
const PER_STREAM = 18;
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
  const E_SUN = (SUN_LM_PER_W * S_MERC) / L_UNIT;            // illuminance in scene units
  const sunE = new THREE.Vector3(...sunRGBN).multiplyScalar(E_SUN);
  const sunAngR = PHYS.R_SUN / (MERCURY.a * PHYS.AU);        // angular radius, rad

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
  const bbLum = T => blackbody.blackbodyLuminance(T) / L_UNIT;

  // --- terrain + industry ----------------------------------------------------
  const terrain = bakeTerrain(renderer, 1024);
  const industry = createIndustry(SEED_DIR_BODY);

  // --- default camera and cutaway -------------------------------------------
  const camDir0 = new THREE.Vector3(Math.cos(0.28) * Math.cos(1.01), Math.sin(0.28), -Math.cos(0.28) * Math.sin(1.01)).normalize();
  const cut = cutFrame(camDir0, SUN);

  // --- uniforms shared by several materials ---------------------------------
  const bodyToWorld = new THREE.Matrix3(), worldToBody = new THREE.Matrix3();
  const U = {
    uR: { value: R0 },
    uRkm: { value: MERCURY.R / 1e3 },
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
    tHeight: { value: terrain.tHeight }, tMask: { value: terrain.tMask },
    tCdf: { value: industry.cdfTex }, tBB: { value: bbTex },
    uBBRange: { value: new THREE.Vector2(Math.log(BB_TMIN), Math.log(BB_TMAX)) },
    uTexelAng: { value: (Math.PI / 2) / terrain.faceSize },
    uRelief: { value: 1 }, uStripKm: { value: 0 }, uCrustKm: { value: CRUST_KM }, uCoreBare: { value: 0 },
    uSite: { value: industry.sites }, uFill: { value: new Float32Array(N_SITES) },
    uThIn: { value: Float32Array.from(industry.thIn) }, uThMax: { value: Float32Array.from(industry.thMax) },
    uArea: { value: Float32Array.from(industry.areaRaw) },
    uMineShare: { value: 0 }, uPVAlb: { value: 0.03 },
    uTind: { value: 0 }, uEps: { value: EMISSIVITY },
    uThermal: { value: 0 }, uTss: { value: MERCURY.tDay }, uTnight: { value: MERCURY.tNight },
    uTlo: { value: 80 }, uThi: { value: 800 }, uExpo: { value: BASE_EXPOSURE },
  };
  for (const [k, c] of Object.entries(ALBEDO)) surfU[k] = { value: v3(c) };

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(1, 192, 128),
    new THREE.ShaderMaterial({ vertexShader: SURFACE_VERT, fragmentShader: surfaceFrag(N_SITES), uniforms: surfU, extensions: { derivatives: true } }),
  );
  planet.frustumCulled = false;
  scene.add(planet);

  // --- cutaway faces -----------------------------------------------------------
  const cutU = {
    uSun: U.uSun, uSunE: U.uSunE, uR: U.uR,
    uKmPerUnit: { value: KM_PER_UNIT }, uR0km: { value: MERCURY.R / 1e3 }, uRcoreKm: { value: MERCURY.R_CORE / 1e3 },
    uCrustKm: { value: CRUST_KM }, uComp: { value: 1 },
    uThermal: surfU.uThermal, uTlo: surfU.uTlo, uThi: surfU.uThi, uExpo: surfU.uExpo,
    uTprof: { value: new THREE.Vector4(T_INTERIOR.surfaceMean, T_INTERIOR.lidBase, T_INTERIOR.lidKm, T_INTERIOR.mantleBase) },
    uTcore: { value: new THREE.Vector2(T_INTERIOR.coreTop, T_INTERIOR.coreCentre) },
    C_CRUST: { value: v3([0.17, 0.165, 0.152]) }, C_MANTLE: { value: v3(ALBEDO.C_MANTLE) }, C_CORE: { value: v3([0.36, 0.34, 0.32]) },
  };
  const quarter = new THREE.CircleGeometry(1, 96, 0, Math.PI / 2);
  const cutFaces = [];
  for (let i = 0; i < 3; i++) {
    const a = cut[(i + 1) % 3], b = cut[(i + 2) % 3];
    const mat = new THREE.ShaderMaterial({
      vertexShader: CUT_VERT, fragmentShader: CUT_FRAG, side: THREE.DoubleSide, extensions: { derivatives: true },
      uniforms: { ...cutU, uA: { value: a }, uB: { value: b }, uN: { value: cut[i] } },
    });
    const m = new THREE.Mesh(quarter, mat);
    m.frustumCulled = false;
    scene.add(m);
    cutFaces.push(m);
  }

  // --- ghost of the original radius: silhouette ring + arcs on the cut planes ----
  const ghostMat = new THREE.LineDashedMaterial({ color: 0x9aa3b4, dashSize: 0.018, gapSize: 0.022, transparent: true, opacity: 0.55, depthWrite: false });
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
    // radial edges of the removed shell, so the missing layer reads as a slab
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
  const sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: SUN_VERT, fragmentShader: SUN_FRAG, depthWrite: false,
    // Real disc radiance is ~1.8×10^5 units; clamped so bloom stays a glare, not a white-out.
    uniforms: { uCol: { value: new THREE.Vector3(...sunRGB).multiplyScalar(60) } },
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
  const G0 = PHYS.G0, YEAR = PHYS.YEAR, SIGMA = PHYS.SIGMA;
  const A0 = 4 * Math.PI * MERCURY.R ** 2;
  const shellFrac = MERCURY.M_SHELL / MERCURY.M;

  /** Industry state for a given mined mass and export rate. */
  function footprint(p, d, built, rate) {
    const eKin = d.logistics.launchEnergyPerKg;
    const powerPerKg = E_SMELT + eKin / DRIVER_EFF;
    const R = model.mercuryRadius(built);
    const etaPV = Math.max(1e-3, model.pvEfficiency(d.tAtMercury ?? 535, p));
    const pvCap = Math.PI * R * R * S_MERC * etaPV;          // W if every square metre of Mercury were PV
    const Pind = rate * powerPerKg;
    const phiMine = Math.min(1, built / (MERCURY.RHO_SHELL * STRIP_DEPTH * A0));
    const phiPV = Math.min(1 - phiMine, Pind / pvCap);
    return { R, etaPV, pvCap, Pind, phiMine, phiPV, phi: phiMine + phiPV };
  }

  function numbers(state) {
    const { params: p, d, now: n } = state;
    const Td = p.doublingYears * YEAR;
    const growing = n.built < d.massSwarm * (1 - 1e-9);
    const rate = growing ? (n.built * Math.LN2) / Td : 0;
    const v = d.logistics.vLaunch;
    const eKin = d.logistics.launchEnergyPerKg;
    const a = DRIVER_ACCEL_G * G0;
    const track = (v * v) / (2 * a);
    const perDriver = DRIVER_RATE * DRIVER_DUTY;
    const nDrivers = rate > 0 ? Math.max(1, Math.ceil(rate / perDriver)) : 0;
    const heatPerKg = E_SMELT + eKin * (1 / DRIVER_EFF - 1);
    const fp = footprint(p, d, n.built, rate);
    const R = n.mercuryRadius;
    const A = 4 * Math.PI * R * R;
    const Pheat = rate * heatPerKg;
    const tInd = fp.phi > 0 && Pheat > 0 ? (Pheat / (EMISSIVITY * SIGMA * A * fp.phi)) ** 0.25 : 0;
    const depth = n.built < 1e-6 * MERCURY.M ? n.built / (A0 * MERCURY.RHO_SHELL) : MERCURY.R - R;
    const rateCap = (EMISSIVITY * SIGMA * DRAPER_K ** 4 * A0) / heatPerKg;
    const yMantle = d.massSwarm > MERCURY.M_SHELL ? Math.log2(MERCURY.M_SHELL / p.seedMass) * p.doublingYears : null;
    return {
      rate, v, eKin, track, accel: a, perDriver, nDrivers, heatPerKg, Pheat, tInd, depth, R, A,
      ...fp, beamed: Math.max(0, fp.Pind - fp.phiPV * fp.pvCap),
      Plaunch: rate * eKin,
      trackArea: nDrivers * track * TRACK_WIDTH,
      rateCap, yearsCapped: d.massSwarm / rateCap / YEAR,
      yMantle, growing, coreBare: n.built >= MERCURY.M_SHELL,
      vInf: d.logistics.dv1, outward: d.rAU > MERCURY.a,
    };
  }

  // ---------------------------------------------------------------------------
  // Drivers: driver j is built when the count reaches j+1; it sits inside the footprint of that time.
  // ---------------------------------------------------------------------------
  let placedFor = null;
  function placeDrivers(state) {
    const { params: p, d } = state;
    const key = `${p.doublingYears}|${p.seedMass}|${p.pvEff}|${p.pvTempCo}|${d.logistics.vLaunch}|${d.tAtMercury}`;
    if (key === placedFor) return;
    placedFor = key;
    const r = industry.rng(7);
    const v = d.logistics.vLaunch;
    const half = ((v * v) / (2 * DRIVER_ACCEL_G * G0)) / 2 / MERCURY.R;   // half track length, rad
    const Td = p.doublingYears * YEAR;
    const perDriver = DRIVER_RATE * DRIVER_DUTY;
    driverCentres.length = 0;
    const east = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Vector3();
    for (let j = 0; j < MAX_DRAWN_DRIVERS; j++) {
      const rate = (j + 0.5) * perDriver;
      const built = (rate * Td) / Math.LN2;
      const phi = footprint(p, d, built, rate).phi;
      const c = j === 0 ? SEED_DIR_BODY.clone() : industry.samplePoint(Math.min(1, phi), r);
      driverCentres.push(c);
      east.crossVectors(up, c).normalize();
      for (let s = 0; s < 2; s++) {
        const t0 = s === 0 ? -half : 0, t1 = s === 0 ? 0 : half;
        q.copy(c).multiplyScalar(Math.cos(t0)).addScaledVector(east, Math.sin(t0));
        drvPos.set([q.x, q.y, q.z], (j * 4 + s * 2) * 3);
        q.copy(c).multiplyScalar(Math.cos(t1)).addScaledVector(east, Math.sin(t1));
        drvPos.set([q.x, q.y, q.z], (j * 4 + s * 2 + 1) * 3);
      }
    }
    drvGeo.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // Payload trajectory: hyperbola from a horizontal launch at the surface (periapsis).
  // ---------------------------------------------------------------------------
  const HYP_N = 256;
  const hypR = new Float32Array(HYP_N), hypTh = new Float32Array(HYP_N);
  let hypLife = 10;   // real seconds shown per payload
  function buildHyperbola(state) {
    const n = state.now;
    const mu = PHYS.G * Math.max(1e20, MERCURY.M - n.built);
    const rp = n.mercuryRadius, vp = state.d.logistics.vLaunch;
    const e = (rp * vp * vp) / mu - 1;
    if (!(e > 1.0001)) { hypLife = 0; return; }
    const aAbs = rp / (e - 1);
    const nMot = Math.sqrt(mu / aAbs ** 3);
    const k = Math.sqrt((e + 1) / (e - 1));
    const solve = M => { let H = Math.asinh(M / e); for (let i = 0; i < 12; i++) H -= (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1); return H; };
    // time to reach 5 R
    const rEnd = 5 * rp;
    const Hend = Math.acosh((rEnd / aAbs + 1) / e);
    const tEnd = (e * Math.sinh(Hend) - Hend) / nMot;
    for (let i = 0; i < HYP_N; i++) {
      const t = tEnd * (i / (HYP_N - 1)) ** 1.5;
      const H = solve(nMot * t);
      hypR[i] = (aAbs * (e * Math.cosh(H) - 1)) / 1e3 / KM_PER_UNIT;
      hypTh[i] = 2 * Math.atan(k * Math.tanh(H / 2));
    }
    hypLife = tEnd / PAYLOAD_TIME_SCALE;
  }
  function hypAt(f) { // f in [0,1] of life
    const x = Math.pow(Math.min(1, Math.max(0, f)), 1 / 1.5) * (HYP_N - 1);
    const i = Math.min(HYP_N - 2, Math.floor(x)), t = x - i;
    return [hypR[i] + (hypR[i + 1] - hypR[i]) * t, hypTh[i] + (hypTh[i + 1] - hypTh[i]) * t];
  }

  // ---------------------------------------------------------------------------
  // State → uniforms
  // ---------------------------------------------------------------------------
  let N = null;
  let realTime = 0;
  const fill = surfU.uFill.value;
  const self = {
    id: 'mercury', scene, camera,
    exposure: BASE_EXPOSURE, bloom: 0.22, bloomThreshold: 1.0,
    expoFactor: 1, enlargeK: 1,

    activate() { controls.enabled = true; },
    deactivate() { controls.enabled = false; },

    onState(state) {
      N = numbers(state);
      const thermal = state.view.mode === 'thermal';
      placeDrivers(state);
      buildHyperbola(state);

      const Rs = N.R / 1e3 / KM_PER_UNIT;
      U.uR.value = Rs;
      surfU.uRkm.value = N.R / 1e3;

      // footprint (optionally enlarged so sub-pixel industry can be seen)
      let phi = N.phi;
      self.enlargeK = 1;
      if (state.view.exaggerate && phi > 0 && phi < PHI_VISIBLE) { self.enlargeK = PHI_VISIBLE / phi; phi = PHI_VISIBLE; }
      industry.allocate(Math.min(1, phi), fill);
      surfU.uMineShare.value = N.phi > 0 ? N.phiMine / N.phi : 0;
      surfU.uPVAlb.value = state.params.reflectVis ?? 0.03;

      const stripKm = N.phiMine >= 1 ? N.depth / 1e3 : 0;
      surfU.uStripKm.value = stripKm;
      surfU.uRelief.value = Math.exp(-stripKm / 1.5);
      surfU.uCoreBare.value = N.coreBare ? 1 : THREE.MathUtils.smoothstep(MERCURY.R_CORE + 5e3 - N.R, 0, 5e3);
      surfU.uTind.value = N.tInd;

      // thermal scale: log, 80 K to the hottest thing on screen
      const tHot = Math.max(760, T_INTERIOR.coreCentre, N.tInd * 1.15);
      surfU.uTlo.value = 80;
      surfU.uThi.value = tHot;
      surfU.uThermal.value = thermal ? 1 : 0;

      // camera exposure: physical, but if the surface glows brighter than sunlit rock, stop down
      const lSun = (ALBEDO.C_REG[1] * E_SUN) / Math.PI;
      const lGlow = EMISSIVITY * bbLum(Math.max(BB_TMIN, N.tInd * 1.05));
      self.expoFactor = N.tInd > 600 ? Math.min(1, (1.6 * lSun) / lGlow) : 1;
      self.exposure = thermal ? 1 : BASE_EXPOSURE * self.expoFactor;
      surfU.uExpo.value = self.exposure;
      cutU.uComp.value = 1 / self.expoFactor;
      self.bloom = thermal ? 0 : 0.22;
      drvU.uGlow.value = 0;
      drivers.visible = !thermal;

      // drawn drivers
      const nDraw = Math.min(MAX_DRAWN_DRIVERS, N.nDrivers || (N.growing ? 1 : MAX_DRAWN_DRIVERS));
      drvGeo.setDrawRange(0, nDraw * 4);
      partU.uSize.value = state.view.exaggerate ? 3.5 : 1.6;
    },

    update(dt, state) {
      if (!N) self.onState(state);
      realTime += dt;
      controls.update();

      // rotation relative to the Sun: one solar day (175.94 d) per turn, on the shared sim clock
      const psi = (2 * Math.PI * state.simTime) / (MERCURY.solarDayDays * PHYS.DAY);
      const rot = new THREE.Matrix4().makeRotationY(psi);
      bodyToWorld.setFromMatrix4(rot);
      worldToBody.copy(bodyToWorld).transpose();
      U.uSunBody.value.copy(SUN).applyMatrix3(worldToBody);

      // depth range
      const dist = camera.position.length();
      camera.near = Math.max(0.005, (dist - R0) * 0.3);
      camera.far = dist + SUN_DIST * 1.2;
      camera.updateProjectionMatrix();

      const camDir = camera.position.clone().normalize();
      const Rs = U.uR.value;
      const thermal = state.view.mode === 'thermal';

      // ghost ring at the original radius (silhouette as seen from the camera)
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

      // payload streams
      updateParticles(state, camDir);

      // labels
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
  function updateParticles(state, camDir) {
    streamAnchor = null;
    if (!N || !N.growing || hypLife <= 0 || state.view.mode === 'thermal') { partGeo.setDrawRange(0, 0); return; }
    const nDraw = Math.min(MAX_DRAWN_DRIVERS, N.nDrivers);
    const win = (FIRE_WINDOW_DEG * Math.PI) / 180;
    const sign = N.outward ? 1 : -1;
    const Rs = U.uR.value;
    let s = 0;
    const comp = 1 / self.expoFactor;
    partU.uCol.value.set(0.95, 0.93, 0.9).multiplyScalar(4.0 * comp);
    for (let j = 0; j < nDraw && s < MAX_STREAMS; j++) {
      tmpW.copy(driverCentres[j]).applyMatrix3(bodyToWorld);
      const lon = Math.atan2(-tmpW.z, tmpW.x);
      const firing = Math.abs(lon) < win || Math.abs(lon) > Math.PI - win;
      if (!firing) continue;
      if (tmpW.dot(cut[0]) > 0 && tmpW.dot(cut[1]) > 0 && tmpW.dot(cut[2]) > 0) continue;
      tmpQ.copy(VHAT).multiplyScalar(sign).addScaledVector(tmpW, -sign * VHAT.dot(tmpW)).normalize();
      const off = ((j * 0.6180339) % 1);
      for (let i = 0; i < PER_STREAM; i++) {
        const f = (realTime / hypLife + i / PER_STREAM + off) % 1;
        const [r, th] = hypAt(f);
        tmpP.copy(tmpW).multiplyScalar(Math.cos(th) * r).addScaledVector(tmpQ, Math.sin(th) * r);
        const k = (s * PER_STREAM + i);
        partPos[k * 3] = tmpP.x; partPos[k * 3 + 1] = tmpP.y; partPos[k * 3 + 2] = tmpP.z;
        // in Mercury's shadow?
        const along = tmpP.dot(SUN);
        const perp2 = tmpP.lengthSq() - along * along;
        const lit = along < 0 && perp2 < Rs * Rs ? 0 : 1;
        const fade = Math.min(1, f / 0.04) * (1 - THREE.MathUtils.smoothstep(f, 0.6, 1));
        partLit[k] = lit * fade;
        if (!streamAnchor && f > 0.35 && f < 0.5 && lit && tmpP.dot(camDir) > -1) streamAnchor = tmpP.clone();
      }
      s++;
    }
    partGeo.setDrawRange(0, s * PER_STREAM);
    partGeo.attributes.position.needsUpdate = true;
    partGeo.attributes.aLit.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  const camRight = new THREE.Vector3(), camUp = new THREE.Vector3();
  function km(x) { return `${Math.round(x / 1e3).toLocaleString('en-US')} km`; }
  function area(m2) { return m2 >= 1e6 ? `${format.sci(m2 / 1e6)} km²` : `${format.sci(m2)} m²`; }
  function depthStr(m) {
    if (m >= 1e-3) return format.length(m);
    if (m >= 1e-6) return `${format.sci(m * 1e6)} µm`;
    return `${format.sci(m * 1e9)} nm`;
  }

  function putLabels(state, camDir, dist, gapPx, pxPerUnit) {
    if (!N) return;
    camera.updateMatrixWorld();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const Rs = U.uR.value;
    const thermal = state.view.mode === 'thermal';
    const sil = (r) => r * Math.sqrt(Math.max(0, 1 - (r / dist) ** 2));
    const at = (ang, r, out = 1) => camRight.clone().multiplyScalar(Math.cos(ang) * sil(r) * out)
      .addScaledVector(camUp, Math.sin(ang) * sil(r) * out).addScaledVector(camDir, (r * r) / dist);

    // planet radius
    const shrunk = MERCURY.R - N.R;
    const glowNote = !thermal && N.tInd > DRAPER_K ? `<small>glowing: waste heat holds it at ${format.sci(N.tInd, 2)} K</small>` : '';
    const expoNote = !thermal && self.expoFactor < 0.9 ? `<small>camera stopped down ${Math.round(-Math.log2(self.expoFactor))} stops for the glow</small>` : '';
    labels.put('m-radius', at(0.62, Rs, 1.04),
      `Mercury now · R = ${km(N.R)}${shrunk > 500 ? `<small>${km(shrunk)} of rock gone from every point of the surface</small>` : ''}${glowNote}${expoNote}`, 'big');
    if (gapPx > 3) labels.put('m-orig', at(-0.28, R0, 1.0), `original ${km(MERCURY.R)}`, 'muted');

    // core radius on the cutaway (face most turned to the camera)
    let bi = 0;
    for (let i = 1; i < 3; i++) if (cut[i].dot(camDir) > cut[bi].dot(camDir)) bi = i;
    const ca = cut[(bi + 1) % 3], cb = cut[(bi + 2) % 3];
    const rc = Math.min(MERCURY.R_CORE, N.R) / 1e3 / KM_PER_UNIT;
    const corePt = ca.clone().multiplyScalar(Math.cos(0.9) * rc * 0.98).addScaledVector(cb, Math.sin(0.9) * rc * 0.98);
    labels.put('m-core', corePt, N.coreBare ? `bare iron core · ${km(N.R)}` : `iron core ${km(MERCURY.R_CORE)}`, 'cool');
    if (N.R - MERCURY.R_CORE > 60e3) {
      const rm = (MERCURY.R_CORE + (N.R - MERCURY.R_CORE) * 0.5) / 1e3 / KM_PER_UNIT;
      const shPt = ca.clone().multiplyScalar(Math.cos(0.35) * rm).addScaledVector(cb, Math.sin(0.35) * rm);
      labels.put('m-shell', shPt, `rock: crust + mantle<small>${format.pct(Math.max(0, MERCURY.M_SHELL - state.now.built) / MERCURY.M, 1)} of Mercury left</small>`, 'muted nodot');
    }

    // industry: label the biggest district facing the camera
    let best = -1, bestScore = 0;
    for (let k = 0; k < N_SITES; k++) {
      if (fill[k] <= 0) continue;
      tmpW.copy(industry.sites[k]).applyMatrix3(bodyToWorld);
      const facing = tmpW.dot(camDir);
      if (facing < 0.3) continue;
      if (tmpW.dot(cut[0]) > 0 && tmpW.dot(cut[1]) > 0 && tmpW.dot(cut[2]) > 0) continue;
      const score = fill[k] * industry.area[k] * (0.3 + facing) * (tmpW.dot(SUN) > 0 ? 2 : 1) + (k === 0 ? 1e-30 : 0);
      if (score > bestScore) { bestScore = score; best = k; }
    }
    if (best >= 0 && N.phi < 0.98) {
      const p = industry.sites[best].clone().applyMatrix3(bodyToWorld).multiplyScalar(Rs);
      const indArea = N.phi * A0;
      const pxArea = indArea / 1e6 / (KM_PER_UNIT ** 2) * pxPerUnit * pxPerUnit;
      let sub = '';
      if (state.view.exaggerate && self.enlargeK > 1.5) sub = `<small>area shown ×${format.sci(self.enlargeK, 2)} (enlarged)</small>`;
      else if (pxArea < 2) sub = '<small>smaller than a pixel here · Enlarged shows it</small>';
      const drv = N.nDrivers > 0 ? `<small>${format.sci(N.nDrivers)} mass driver${N.nDrivers === 1 ? '' : 's'}, ${format.sci(N.track / 1e3, 2)} km each</small>` : '';
      labels.put('m-ind', p, `industry ${area(indArea)}${drv}${sub}`, 'sun');
    } else if (N.phi >= 0.98 && N.growing) {
      labels.put('m-ind', at(-2.3, Rs, 0.55), `whole surface industrial<small>${format.sci(N.nDrivers)} mass drivers, ${format.sci(N.track / 1e3, 2)} km each</small>`, 'sun nodot');
    }

    // payload stream
    if (streamAnchor) {
      labels.put('m-pay', streamAnchor, `payloads leave at ${(N.v / 1e3).toFixed(1)} km/s<small>export ${format.sci(N.rate)} kg/s · shown ×${PAYLOAD_TIME_SCALE} speed</small>`, '');
    }

    // Sun
    const sp = SUN.clone().multiplyScalar(SUN_DIST);
    if (!thermal && sp.clone().sub(camera.position).normalize().dot(camDir.clone().negate()) > 0.85) {
      labels.put('m-sun', sp.clone().addScaledVector(camUp, SUN_DIST * Math.tan(sunAngR) * 1.6), `Sun · ${((2 * sunAngR * 180) / Math.PI).toFixed(2)}° across from here`, 'sun');
    }

    // thermal legend, pinned to the upper-left of the stage
    if (thermal) {
      const lo = surfU.uTlo.value, hi = surfU.uThi.value;
      const stops = [];
      for (let i = 0; i <= 10; i++) stops.push(`rgb(${ctx.blackbody.inferno(i / 10).map(c => Math.round(c * 255)).join(',')}) ${i * 10}%`);
      const ticks = [100, 200, 400, 700, 1000, 2000, 5000, 10000, 20000].filter(t => t >= lo && t <= hi);
      const tickHtml = ticks.map(t => `<span style="position:absolute;left:${(Math.log(t / lo) / Math.log(hi / lo)) * 100}%;transform:translateX(-50%)">${t >= 1000 ? `${t / 1000}k` : t}</span>`).join('');
      const html = `<div style="font-size:10px;color:var(--muted);margin-bottom:3px">surface temperature, K (log scale)</div>`
        + `<div style="width:220px;height:8px;border-radius:2px;background:linear-gradient(90deg,${stops.join(',')})"></div>`
        + `<div style="position:relative;width:220px;height:12px;font-size:10px;margin-top:2px">${tickHtml}</div>`;
      const pt = new THREE.Vector3(-0.96, 0.74, 0.5).unproject(camera);
      labels.put('m-legend', pt, html, 'nodot');
    }
  }

  // ---------------------------------------------------------------------------
  function caption(state) {
    const { params: p, d, now: n } = state;
    if (!N) N = numbers(state);
    const f = format;
    const num = (s, hot) => `<span class="num${hot ? ' hot' : ''}">${s}</span>`;
    const yr = p.year.toFixed(1);
    const title = d.fracShell > 1 ? 'You have to eat through Mercury’s mantle' : `The swarm needs ${f.pct(d.fracShell, 0)} of Mercury’s rock`;
    const finished = d.fracShell > 1
      ? `Finished swarm: ${num(f.pct(d.fracMercury))} of Mercury. Crust and mantle are only ${num(f.pct(shellFrac))}: gone in year ${num(N.yMantle.toFixed(1))}, the rest comes out of the iron core.`
      : `Finished swarm: ${num(f.pct(d.fracMercury))} of Mercury, ${num(f.pct(d.fracShell))} of its rocky crust and mantle.`;

    if (state.view.mode === 'thermal') {
      const body = [
        `<p>Sunlit ground peaks at ${num(`${MERCURY.tDay} K`)} at perihelion, below the ${num('~800 K')} Draper point: sunlight alone never makes Mercury glow. Night falls to ${num(`${MERCURY.tNight} K`)}.</p>`,
        N.growing
          ? `<p>Industry heat now ${num(f.watts(N.Pheat))} (a ${num('30 MJ/kg')} smelting floor plus launch losses), shed at ${num(`${f.sci(N.tInd, 2)} K`, N.tInd > DRAPER_K)} over the industrial area.</p>`
          : '<p>The swarm is complete and the industry is idle.</p>',
        `<p>Held below 800 K, Mercury can export at most ${num(`${f.sci(N.rateCap)} kg/s`)}: the swarm would take ${num(`${f.sci(N.yearsCapped, 2)} years`, true)}, not ${num(d.growth.yearsToFull.toFixed(0))}.</p>`,
      ];
      return { eyebrow: 'Chapter 1 · The mine · thermal infrared', title, body: body.join(''), hint: 'False colour, log scale. Cutaway interior temperatures are approximate model values.' };
    }

    let pNow = `<p>Year ${yr}: ${num(f.kg(n.built))} mined, ${num(f.pct(n.mercuryRemoved, 2))} of Mercury. Spread over the planet that is ${num(depthStr(N.depth))} of rock`;
    pNow += MERCURY.R - N.R > 500 ? `; the radius is down to ${num(km(N.R))}.</p>` : '.</p>';

    let pInd;
    if (!N.growing) {
      pInd = `<p>The swarm is complete and the drivers are idle. What is left is a ${num(km(N.R))} ball, ${N.coreBare ? 'bare iron' : 'mostly iron'}.</p>`;
    } else {
      pInd = `<p>Export ${num(`${f.sci(N.rate)} kg/s`)} at ${num(`${(N.v / 1e3).toFixed(1)} km/s`)} (${num(`${f.sci(N.eKin / 1e6, 2)} MJ/kg`)}) takes ${num(f.sci(N.nDrivers))} mass driver${N.nDrivers === 1 ? '' : 's'}, each ${num(`${f.sci(N.track / 1e3, 2)} km`)} long at ${DRIVER_ACCEL_G} g.`;
      if (N.phiPV < 1 - N.phiMine - 1e-9) pInd += ` Industry draws ${num(f.watts(N.Pind))} from ${num(area(N.phiPV * A0))} of PV.`;
      else pInd += ` Industry draws ${num(f.watts(N.Pind))}, ${num(`${f.sci(N.Pind / N.pvCap, 2)}×`, true)} what PV over all of Mercury could give: the rest is beamed back from the swarm.`;
      if (N.tInd > DRAPER_K) pInd += ` Its waste heat holds the surface at ${num(`${f.sci(N.tInd, 2)} K`, true)}: Mercury glows.`;
      else if (N.trackArea > N.A) pInd += ` Laid edge to edge the tracks would need ${num(`${f.sci(N.trackArea / N.A, 2)}×`, true)} Mercury’s surface.`;
      pInd += '</p>';
    }
    return {
      eyebrow: 'Chapter 1 · The mine',
      title,
      body: pNow + pInd + `<p>${finished}</p>`,
      hint: 'Drag to orbit, scroll to zoom. Surface is procedural, not a map; cutaway is an illustration. Spin shown at 6 days/s, payloads at ×60.',
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

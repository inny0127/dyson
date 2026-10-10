// Chapter 3: the swarm around the Sun, at true scale.
// Units: 1 world unit = 1 AU. Radiance unit: a white Lambertian surface lit by the Sun at 1 AU = 1.0.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCameraTween } from '../util/tween.js';

const N_DOTS = 160000;        // representative particles
const N_STREAM = 2400;        // payloads in transit from Mercury
const GLINT_DELTA = 0.035;    // rad: panel flatness / wrinkle spread of the specular lobe (~2°)
const SPEC_REFLECT = 0.03;    // specular reflectance of AR-coated PV glass-free film
const SUN_DISPLAY_CAP = 60;   // true photosphere radiance is ~4.6×10⁴ in these units; capped so bloom stays sane
const LIMB_U1 = 0.47, LIMB_U2 = 0.23; // quadratic limb darkening near 550 nm (Cox 2000, Allen's Astrophysical Quantities)
const SHELL_SPREAD = 0.012;   // fractional radial thickness drawn for the many orbital shells
const PV_TINT = [0.55, 0.62, 1.0]; // c-Si with AR coating: residual reflection is blue-violet

export default function create(ctx) {
  const { THREE, model, constants, format, blackbody } = ctx;
  const { PHYS, PLANETS, MERCURY } = constants;
  const AU = PHYS.AU;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.001, 200);
  camera.position.set(2.7, 1.55, 2.9);
  const controls = new OrbitControls(camera, ctx.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.03;
  controls.maxDistance = 60;
  controls.zoomSpeed = 1.2;
  controls.target.set(0, 0, 0);
  controls.enabled = false;
  const tween = createCameraTween(THREE, camera, controls);

  const sunRGB = new THREE.Color(...blackbody.blackbodyRGB(PHYS.T_SUN));

  // ---------------------------------------------------------------- stars
  // Faint background stars. With the Sun in frame a real camera cannot see them; they only
  // come out as the swarm closes and the auto-exposure opens up.
  const starGeo = new THREE.BufferGeometry();
  {
    const n = 6000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let s = 12345;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const z = rnd() * 2 - 1, ph = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      pos.set([r * Math.cos(ph) * 150, z * 150, r * Math.sin(ph) * 150], i * 3);
      const T = 3000 + rnd() ** 2 * 9000;
      const c = blackbody.blackbodyRGB(T);
      const m = -1 + 7.5 * rnd() ** 0.45;           // magnitude-ish
      const b = 10 ** (-0.4 * m) * 0.002;
      col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uGain: { value: 1 } },
    vertexShader: `attribute vec3 color; varying vec3 vC; uniform float uGain;
      void main(){ vC = color * uGain; vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv; gl_PointSize = 1.6; }`,
    fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.); }`,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // ---------------------------------------------------------------- Sun
  const sunMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: sunRGB.clone() }, uIntensity: { value: SUN_DISPLAY_CAP } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.); vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uIntensity; varying vec3 vN; varying vec3 vV;
      void main(){ float mu = clamp(dot(normalize(vN), normalize(vV)), 0., 1.);
        float ld = 1. - ${LIMB_U1.toFixed(2)} * (1. - mu) - ${LIMB_U2.toFixed(2)} * (1. - mu) * (1. - mu);
        gl_FragColor = vec4(uColor * uIntensity * ld, 1.); }`,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), sunMat);
  scene.add(sun);

  // ---------------------------------------------------------------- planets
  const planetMat = (rgb) => new THREE.ShaderMaterial({
    uniforms: { uAlbedo: { value: new THREE.Color(...rgb) }, uThermal: { value: 0 }, uIR: { value: new THREE.Color() }, uSunGain: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vW;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 uAlbedo; uniform float uThermal; uniform vec3 uIR; uniform float uSunGain; varying vec3 vN; varying vec3 vW;
      void main(){ float r = length(vW); vec3 L = -vW / r; float lam = max(dot(normalize(vN), L), 0.);
        vec3 vis = uAlbedo * lam * uSunGain / (r * r);
        gl_FragColor = vec4(mix(vis, uIR, uThermal), 1.); }`,
  });
  const PLANET_T = { Mercury: 440, Venus: 232, Earth: 255, Mars: 210 }; // K, mean radiating temperatures (NASA fact sheets)
  const planets = PLANETS.map(p => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), planetMat(p.color));
    scene.add(mesh);
    // orbit line
    const pts = [];
    for (let k = 0; k <= 360; k++) pts.push(keplerPos(p, (k / 360) * p.periodDays * 86400, true));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: p.name === 'Earth' ? 0x86b6ff : 0x5d6472, transparent: true, opacity: p.name === 'Earth' ? 0.75 : 0.45 }));
    scene.add(line);
    // constant-size marker so true-scale planets can still be found
    const marker = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)),
      new THREE.PointsMaterial({ color: new THREE.Color(...p.color).multiplyScalar(1.4), size: 5, sizeAttenuation: false, depthWrite: false }));
    scene.add(marker);
    return { p, mesh, line, marker, pos: new THREE.Vector3() };
  });

  /** Heliocentric ecliptic position (AU) from J2000 mean elements; t in seconds since J2000.
   *  If `orbitOnly`, t is interpreted as time since perihelion for drawing the ellipse. */
  function keplerPos(p, t, orbitOnly = false) {
    const deg = Math.PI / 180;
    const n = (2 * Math.PI) / (p.periodDays * 86400);
    const M = orbitOnly ? n * t : ((p.L - p.peri) * deg + n * t);
    let E = M;
    for (let k = 0; k < 8; k++) E -= (E - p.e * Math.sin(E) - M) / (1 - p.e * Math.cos(E));
    const xv = p.a * (Math.cos(E) - p.e), yv = p.a * Math.sqrt(1 - p.e * p.e) * Math.sin(E);
    const w = (p.peri - p.node) * deg, O = p.node * deg, I = p.i * deg;
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
    const x = (cO * cw - sO * sw * cI) * xv + (-cO * sw - sO * cw * cI) * yv;
    const y = (sO * cw + cO * sw * cI) * xv + (-sO * sw + cO * cw * cI) * yv;
    const z = (sw * sI) * xv + (cw * sI) * yv;
    // ecliptic (x, y, z) -> three.js (x, z, -y): ecliptic north is +Y on screen
    return new THREE.Vector3(x, z, -y);
  }

  // ---------------------------------------------------------------- swarm shell (honest coverage)
  // Satellites face the Sun, so seen from anywhere the shell covers a fraction f of each sightline
  // (radially facing plates: foreshortening and path length cancel, so no limb brightening).
  // Inner surface = sun-facing PV fronts (lit, glinting). Outer surface = unlit radiator backs.
  const shellUniforms = {
    uF: { value: 0 }, uMode: { value: 0 }, uLit: { value: new THREE.Color() }, uGlint: { value: 0 },
    uDelta: { value: GLINT_DELTA }, uSun: { value: sunRGB.clone() }, uIRFront: { value: new THREE.Color() }, uIRBack: { value: new THREE.Color() },
    uInner: { value: 0 },
  };
  const shellVert = `varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
  const shellFrag = `
    uniform float uF, uMode, uGlint, uDelta, uInner; uniform vec3 uLit, uSun, uIRFront, uIRBack; varying vec3 vW;
    void main(){
      vec3 n = normalize(vW);
      vec3 toCam = normalize(cameraPosition - vW);
      vec3 col;
      if (uInner > 0.5) {
        if (uMode < 0.5) {
          float c = clamp(dot(toCam, -n), -1., 1.);
          float ang = acos(c);
          col = uLit + uSun * uGlint * exp(-ang * ang / (uDelta * uDelta));
        } else col = uIRFront;
      } else {
        col = uMode < 0.5 ? vec3(0.) : uIRBack;
      }
      gl_FragColor = vec4(col * uF, uF);
    }`;
  const mkShell = (side, inner) => {
    const u = THREE.UniformsUtils.clone(shellUniforms);
    u.uInner.value = inner;
    const m = new THREE.ShaderMaterial({
      uniforms: u, vertexShader: shellVert, fragmentShader: shellFrag, side, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), m);
    mesh.renderOrder = inner ? 1 : 3;
    scene.add(mesh);
    return mesh;
  };
  const shellInner = mkShell(THREE.BackSide, 1);
  const shellOuter = mkShell(THREE.FrontSide, 0);

  // ---------------------------------------------------------------- representative satellites
  // Orbit normals uniform over the northern hemisphere: all prograde, and the great circles still
  // cover the sphere uniformly. Many thin shells at slightly different radii keep crossing orbits apart.
  const dotGeo = new THREE.BufferGeometry();
  {
    const P = new Float32Array(N_DOTS * 3), Q = new Float32Array(N_DOTS * 3), O = new Float32Array(N_DOTS * 4);
    let s = 987654321;
    const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3();
    for (let i = 0; i < N_DOTS; i++) {
      const cz = rnd(), ph = rnd() * Math.PI * 2, sz = Math.sqrt(1 - cz * cz);
      v.set(sz * Math.cos(ph), cz, sz * Math.sin(ph)); // orbit normal (Y = ecliptic north)
      up.set(Math.abs(v.y) < 0.9 ? 0 : 1, Math.abs(v.y) < 0.9 ? 1 : 0, 0);
      a.crossVectors(up, v).normalize();
      b.crossVectors(v, a).normalize();
      P.set([a.x, a.y, a.z], i * 3);
      Q.set([b.x, b.y, b.z], i * 3);
      const shell = 1 + (rnd() - 0.5) * SHELL_SPREAD;
      O.set([shell, rnd() * Math.PI * 2, rnd(), rnd()], i * 4);
    }
    dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_DOTS * 3), 3));
    dotGeo.setAttribute('aP', new THREE.BufferAttribute(P, 3));
    dotGeo.setAttribute('aQ', new THREE.BufferAttribute(Q, 3));
    dotGeo.setAttribute('aO', new THREE.BufferAttribute(O, 4));
  }
  const dotMat = new THREE.ShaderMaterial({
    uniforms: {
      uR: { value: 1.2 }, uTimeYr: { value: 0 }, uShown: { value: 1 }, uSize: { value: 1.5 }, uPR: { value: 1 },
      uMode: { value: 0 }, uLit: { value: new THREE.Color() }, uGlint: { value: 0 }, uDelta: { value: GLINT_DELTA },
      uSun: { value: sunRGB.clone() }, uIR: { value: new THREE.Color() }, uBoost: { value: 1 }, uTransmit: { value: 1 },
    },
    vertexShader: `
      attribute vec3 aP; attribute vec3 aQ; attribute vec4 aO;
      uniform float uR, uTimeYr, uShown, uSize, uPR, uMode, uGlint, uDelta, uBoost, uTransmit; uniform vec3 uLit, uSun, uIR;
      varying vec3 vC; varying float vA;
      void main(){
        if (aO.z > uShown) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; vA = 0.; return; }
        float a = uR * aO.x;
        float nYr = 6.283185307 / pow(a, 1.5);          // Kepler's third law, AU and years
        float u = aO.y + nYr * uTimeYr;
        vec3 pos = a * (cos(u) * aP + sin(u) * aQ);
        vec4 mv = modelViewMatrix * vec4(pos, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * (0.75 + 0.5 * aO.w);
        vec3 n = normalize(pos);
        vec3 toCam = normalize(cameraPosition - pos);
        float front = dot(toCam, -n);
        if (uMode < 0.5) {
          float ang = acos(clamp(front, -1., 1.));
          vec3 lit = front > 0. ? uLit + uSun * uGlint * exp(-ang * ang / (uDelta * uDelta)) : vec3(0.);
          vC = lit * uBoost; vA = front > 0. ? 1. : 0.9;
        } else { vC = uIR * (0.6 + 0.8 * aO.w) * uBoost; vA = uBoost > 1.5 ? 0.9 : 0.35; }
        // dots on the far side of the shell are seen through the near layer of panels
        if (dot(n, toCam) < 0.) { vC *= uTransmit; vA *= uTransmit; }
      }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vC, vA); }`,
    transparent: true, depthWrite: false,
  });
  const dots = new THREE.Points(dotGeo, dotMat);
  dots.frustumCulled = false;
  dots.renderOrder = 4;
  scene.add(dots);

  // ---------------------------------------------------------------- Mercury -> swarm stream
  const streamPos = new Float32Array(N_STREAM * 3);
  const streamGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(streamPos, 3));
  const streamSeeds = Float32Array.from({ length: N_STREAM }, (_, i) => ((i * 0.6180339887) % 1));
  const streamMat = new THREE.PointsMaterial({ color: 0xffc27a, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false });
  const stream = new THREE.Points(streamGeo, streamMat);
  stream.frustumCulled = false;
  scene.add(stream);

  // ---------------------------------------------------------------- state-derived values
  const v = {
    R: 1.2, f: 0, transmitSun: 1, exposure: 1, shown: 1, perDot: 1, mode: 'visible', exaggerate: false,
    streamOn: 0, streamPeriodS: 1, exportRate: 0,
  };
  const tmp = new THREE.Vector3();

  function onState(state) {
    const { d, now, params: p, view } = state;
    v.R = d.rAU;
    if (!v.placed) {
      camera.position.set(2.7, 1.55, 2.9).multiplyScalar((v.R / 1.2) * (v.fit || 1));
      v.placed = true;
    }
    v.f = Math.min(0.9995, now.f);
    v.mode = view.mode;
    v.exaggerate = view.exaggerate;
    const S = d.S, S0 = constants.S0;

    // Lit PV face: diffuse reflectance × local irradiance, in units of a white card at 1 AU.
    const lit = p.reflectVis * (S / S0);
    const litCol = new THREE.Color(PV_TINT[0] * lit, PV_TINT[1] * lit, PV_TINT[2] * lit).multiply(sunRGB);
    // Specular lobe peak: rho_s × S(r)/S0 spread over a cone of half-angle delta.
    const glint = (SPEC_REFLECT * (S / S0)) / (GLINT_DELTA * GLINT_DELTA);

    // Thermal false colour: 150 K → black, 450 K → white-hot.
    const tNorm = T => Math.min(1, Math.max(0, (T - 150) / 300));
    const irF = new THREE.Color(...blackbody.inferno(tNorm(now.tSheet))).multiplyScalar(0.5 * p.epsFront);
    const irB = new THREE.Color(...blackbody.inferno(tNorm(now.tSheet))).multiplyScalar(0.5 * p.epsBack);

    for (const sh of [shellInner, shellOuter]) {
      const u = sh.material.uniforms;
      u.uF.value = v.f;
      u.uMode.value = view.mode === 'thermal' ? 1 : 0;
      u.uLit.value.copy(litCol);
      u.uGlint.value = glint;
      u.uIRFront.value.copy(irF);
      u.uIRBack.value.copy(irB);
      sh.scale.setScalar(v.R);
    }

    // Dots: count grows with log(coverage) so the structure is visible early; each dot stands for perDot satellites.
    const lf = Math.log10(Math.max(1e-12, now.f));
    v.shown = Math.min(1, Math.max(0.01, (lf + 8) / 8));
    v.perDot = now.nSats / (N_DOTS * v.shown);
    const du = dotMat.uniforms;
    du.uR.value = v.R;
    du.uShown.value = v.shown;
    du.uMode.value = view.mode === 'thermal' ? 1 : 0;
    du.uLit.value.copy(litCol);
    du.uGlint.value = glint;
    du.uIR.value.copy(irF);
    du.uSize.value = view.exaggerate ? 3.2 : 1.4;
    du.uBoost.value = view.exaggerate ? 6 : 1;

    // Camera exposure. Visible: metered for sunlit objects; as the swarm closes the Sun dims by (1 - f) seen
    // through one layer, and the auto-exposure opens up (stars appear at the end).
    v.transmitSun = 1 - v.f;
    starMat.uniforms.uGain.value = view.mode === 'visible' ? 1 : 0;

    // Planets
    for (const pl of planets) {
      const T = pl.p.name === 'Earth' ? now.earth.tEff : PLANET_T[pl.p.name];
      pl.mesh.material.uniforms.uThermal.value = view.mode === 'thermal' ? 1 : 0;
      pl.mesh.material.uniforms.uIR.value.setRGB(...blackbody.inferno(tNorm(T)));
      const k = view.exaggerate ? 900 : 1;
      pl.mesh.scale.setScalar((pl.p.R / AU) * k);
    }
    sun.scale.setScalar((PHYS.R_SUN / AU) * (view.exaggerate ? 8 : 1));

    // Stream: export rate of the growing industry, kg/s
    v.exportRate = now.exportRate;
    v.streamOn = v.exportRate > 0 ? Math.min(1, Math.max(0.03, (Math.log10(v.exportRate) + 2) / 12)) : 0;
    v.streamPeriodS = model.hohmann(MERCURY.a, d.rAU).tTransfer;
  }

  function updateSun(dt) {
    // Seen from outside the shell, the Sun shines through one layer of panels.
    const camR = camera.position.length();
    const outside = camR > v.R;
    const t = outside ? 1 - v.f : 1;
    dotMat.uniforms.uTransmit.value = t;
    // Auto-exposure, metered for sunlit objects. From outside, as the swarm closes the Sun fades
    // and the camera opens up until the stars come out. From inside, the Sun is unobstructed.
    const target = v.mode === 'thermal' ? 1 : outside ? Math.min(400, 1.3 / Math.max(0.0025, t)) : 1.3;
    api.exposure = Math.exp(Math.log(api.exposure) + (Math.log(target) - Math.log(api.exposure)) * Math.min(1, dt * 3));
    const thermal = v.mode === 'thermal';
    sunMat.uniforms.uIntensity.value = SUN_DISPLAY_CAP * t * (thermal ? 0.05 : 1);
  }

  function updateStream(state) {
    const n = Math.round(N_STREAM * v.streamOn);
    const t = state.simTime;
    const merc = planets[0].p;
    const r2 = v.R;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const s = (streamSeeds[i] + t / v.streamPeriodS) % 1;           // fraction of the transfer completed
      const launchT = t - s * v.streamPeriodS;
      const mp = keplerPos(merc, launchT);
      const r1 = mp.length();
      const e = (r2 - r1) / (r2 + r1), a = (r1 + r2) / 2;
      const M = Math.PI * s;
      let E = M;
      for (let j = 0; j < 6; j++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
      const r = a * (1 - e * Math.cos(E));
      const lon0 = Math.atan2(-mp.z, mp.x);
      const lon = lon0 + nu;
      streamPos[k++] = r * Math.cos(lon);
      streamPos[k++] = mp.y * (1 - s);
      streamPos[k++] = -r * Math.sin(lon);
    }
    streamGeo.setDrawRange(0, n);
    streamGeo.attributes.position.needsUpdate = true;
  }

  const api = {
    id: 'swarm', scene, camera, controls, exposure: 1, bloom: 0.3, bloomThreshold: 1.2,
    activate() { controls.enabled = true; },
    deactivate() { controls.enabled = false; },
    onState(state) { onState(state); },
    presets: [
      { label: 'Inner solar system', apply: () => tween.go(new THREE.Vector3(2.7, 1.55, 2.9).multiplyScalar((v.R / 1.2) * (v.fit || 1)), new THREE.Vector3()) },
      { label: 'From above', apply: () => tween.go(new THREE.Vector3(0.001, 4.6 * (v.R / 1.2) * (v.fit || 1), 0.001), new THREE.Vector3()) },
      { label: 'Beside Earth', title: 'Just behind Earth, looking at the Sun', apply: () => {
        const e = planets[2].pos.clone();
        tween.go(e.clone().multiplyScalar(1.08).add(new THREE.Vector3(0, 0.03, 0)), new THREE.Vector3());
      } },
      { label: 'From 30 AU', title: 'Roughly Neptune’s distance', apply: () => tween.go(new THREE.Vector3(21, 5, 21), new THREE.Vector3()) },
    ],
    resize(w, h) {
      const first = !v.sized;
      v.sized = true;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      v.fit = Math.max(1, 1.15 / camera.aspect);   // portrait screens need to back away to fit the shell
      if (first) v.placed = false;
      dotMat.uniforms.uPR.value = ctx.renderer.getPixelRatio();
    },
    update(dt, state) {
      tween.tick(dt);
      controls.update();
      const dist = camera.position.length();
      camera.near = Math.max(1e-5, dist * 2e-4);
      camera.far = 400;
      camera.updateProjectionMatrix();

      const tYr = state.simTime / PHYS.YEAR;
      dotMat.uniforms.uTimeYr.value = tYr % 1000;
      updateSun(dt);
      updateStream(state);

      const L = ctx.labels;
      const exag = state.view.exaggerate;
      for (const pl of planets) {
        pl.pos.copy(keplerPos(pl.p, state.simTime));
        pl.mesh.position.copy(pl.pos);
        pl.marker.geometry.attributes.position.array.set([pl.pos.x, pl.pos.y, pl.pos.z]);
        pl.marker.geometry.attributes.position.needsUpdate = true;
        pl.marker.visible = !exag;
        let html = pl.p.name;
        let cls = 'muted';
        if (pl.p.name === 'Earth') {
          const e = state.now.earth;
          cls = e.forcing > 3.7 ? 'ir' : 'cool';
          html = `Earth${v.R > 1 ? ' · inside the shell' : ''}<small>${e.forcing >= 0.01 ? `+${format.sci(e.forcing)} W/m² of extra heat` : 'no measurable change yet'}</small>`;
        }
        if (pl.p.name === 'Mercury') {
          html = `Mercury<small>${format.pct(state.now.mercuryRemoved, 2)} mined</small>`;
          cls = 'muted';
        }
        L.put(pl.p.name, pl.pos, html, cls);
      }
      L.put('sun', tmp.set(0, 0, 0), `Sun<small>${v.f > 0.001 ? `${format.pct(1 - v.f, 1)} of its light escapes` : 'unobstructed'}</small>`, 'sun');
      // label the shell where it meets the ecliptic, on the side facing the camera
      const cdir = tmp.copy(camera.position).setY(0).normalize();
      const side = new THREE.Vector3(-cdir.z, 0, cdir.x).multiplyScalar(v.R);
      L.put('shell', side, `Swarm shell · ${v.R.toFixed(2)} AU<small>${Math.round(state.now.tSheet)} K panels · ${format.pct(state.now.f, 2)} of the sky</small>`, state.view.mode === 'thermal' ? 'ir' : 'sun');
      const top = new THREE.Vector3(0, v.R * 1.02, 0);
      L.put('dots', top, `1 dot ≈ ${format.sci(v.perDot)} satellites<small>${exag ? 'dots enlarged' : 'true size: each satellite spans ~10⁻⁸ AU'}</small>`, 'muted nodot');
      if (v.streamOn > 0) {
        const mp = planets[0].pos.clone().multiplyScalar(1.6);
        L.put('stream', mp, `Payloads to ${v.R.toFixed(2)} AU<small>${format.sci(v.exportRate)} kg/s · ${(state.d.logistics.tTransfer / 86400).toFixed(0)}-day transfer</small>`, 'muted nodot');
      }
    },
    caption(state) {
      const { d, now, params: p } = state;
      const f = now.f;
      let title;
      if (f < 1e-4) title = `Year ${p.year.toFixed(0)}: ${format.sci(now.nSats)} satellites, still invisible`;
      else if (f < 0.3) title = `The Sun is ${format.pct(f, 1)} covered`;
      else if (f < 0.98) title = `${format.pct(f, 0)} of sunlight caught`;
      else title = 'The Sun goes dark';
      const inside = d.rAU > 1;
      return {
        eyebrow: 'Chapter 3 · The swarm',
        title,
        body: `
          <p>Chips cap the panels at <span class="num">${Math.round(d.tSheetMax)} K</span>. A nearly closed shell can only shed heat outward, so the swarm has to sit at <span class="num">${d.rAU.toFixed(2)} AU</span>${inside ? ', <b>outside Earth’s orbit</b>' : ''}. Finished, it is <span class="num">${format.sci(d.nSats)}</span> satellites computing <span class="num">${format.sci(d.flopsTotal)} FLOP/s</span>.</p>
          <p>${f < 0.01
            ? `At true scale you see nothing: a ${Math.round(Math.sqrt(p.satArea))} m panel ${d.rAU.toFixed(1)} AU out is far below a pixel. The dots are a census, not a picture.`
            : state.view.mode === 'thermal'
              ? `In thermal infrared the shell is a ${Math.round(now.tSheet)} K glow ${(2 * d.rAU).toFixed(1)} AU across. All ${format.sci(now.elec)} W of computing ends up here as heat.`
              : `In visible light the swarm is nearly black: panels absorb ${Math.round(p.alpha * 100)}% and face away from you on the near side. It shows up as a shadow on the Sun.`}</p>`,
        hint: 'Drag to orbit · scroll to zoom · switch to Thermal IR to see the waste heat',
      };
    },
  };
  return api;
}

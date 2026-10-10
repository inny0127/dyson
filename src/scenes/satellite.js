// Chapter 2: one satellite at true size, from its whole 1 km² face down to a single chip.
// Units: metres. The Sun is along +Z; the PV face points at it, the radiator face points away.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCameraTween } from '../util/tween.js';

// Layout assumptions for the drawing (the physics lives in the model).
const CHIP_DIE_W_PER_M2 = 5e3;  // W per m² of die (0.5 W/mm², a modern accelerator's power density)
const BUS_PITCH = 1.0;         // m between aluminium power/data buses
const BUS_WIDTH = 0.004;       // m
const EDGE_BAND = 8;           // m reflectivity-control band around the rim (attitude control, as on JAXA IKAROS)
const TERMINALS = 6;           // laser-link terminals, one per corner
const WRINKLE = 0.03;          // rad rms slope of film wrinkles (sets the glint spread)
const SPEC_REFLECT = 0.03;     // specular reflectance of the PV surface
const SPIN_PERIOD_S = 900;     // s, assumed spin about the Sun line to keep the film taut (shown in real time)
const NEIGHBOR_MAX = 700;
const NEIGHBOR_DZ = 250;       // m, radial spread of nearby shells drawn around this one

export default function create(ctx) {
  const { THREE, constants, format, blackbody } = ctx;
  const { PHYS } = constants;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1e6);
  camera.up.set(0, 0, 1);   // the Sun is overhead: the panel is a floor, its radiator faces down
  const controls = new OrbitControls(camera, ctx.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.03;
  controls.maxDistance = 60000;
  controls.zoomSpeed = 1.4;
  controls.enabled = false;
  camera.position.set(-1500, -1350, 2050);
  controls.target.set(0, 0, 0);

  const sunDir = new THREE.Vector3(0, 0, 1);
  const sunRGB = new THREE.Color(...blackbody.blackbodyRGB(PHYS.T_SUN));

  // ------------------------------------------------------------------ sky (sun, swarm glow, glint halo, stars)
  // Directions toward the Sun look across the shell at the far side's sunlit PV faces: a faint glow,
  // plus a specular halo of radius ~ the wrinkle angle around the Sun. Outward directions see space.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uSunDir: { value: sunDir }, uSunCos: { value: 0.99999 }, uSun: { value: sunRGB.clone().multiplyScalar(60) },
      uGlow: { value: new THREE.Color() }, uHalo: { value: 0 }, uDelta: { value: 0.035 },
      uMode: { value: 0 }, uIR: { value: new THREE.Color() }, uStars: { value: 1 },
    },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uSunDir, uSun, uGlow, uIR; uniform float uSunCos, uHalo, uDelta, uMode, uStars; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vD);
        float c = dot(d, uSunDir);
        vec3 col = vec3(0.);
        // stars: hash on a fine direction grid
        vec3 g = floor(d * 420.);
        float s = h(g);
        float star = step(0.9965, s) * pow(h(g + 7.1), 6.) * 0.03 * uStars;
        if (uMode < 0.5) {
          if (c > 0.) col += uGlow;                      // far side of the swarm, lit faces, diffuse
          float ang = acos(clamp(c, -1., 1.));
          col += uSun * uHalo * exp(-ang * ang / (uDelta * uDelta));
          if (c > uSunCos) col += uSun;                  // photosphere
          col += vec3(star);
        } else {
          if (c > 0.) col += uIR;                        // far side glows at the sheet temperature
          if (c > uSunCos) col += vec3(4.);
        }
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  // ------------------------------------------------------------------ the panel
  function hexShape(r) {
    const s = new THREE.Shape();
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k;
      const x = r * Math.cos(a), y = r * Math.sin(a);
      if (k === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath();
    return s;
  }

  const panelUniforms = {
    uPitch: { value: 0.05 }, uChip: { value: 0.007 }, uBus: { value: BUS_PITCH }, uBusW: { value: BUS_WIDTH },
    uHexR: { value: 620 }, uEdge: { value: EDGE_BAND }, uSunDir: { value: sunDir }, uSunRad: { value: 60 },
    uIrr: { value: 0.7 }, uSpec: { value: SPEC_REFLECT }, uWrinkle: { value: WRINKLE }, uSunCol: { value: sunRGB.clone() },
    uMode: { value: 0 }, uT: { value: 340 }, uDT: { value: 10 }, uTlo: { value: 320 }, uThi: { value: 360 },
    uBackLight: { value: 0 },
  };
  const panelVert = `
    varying vec2 vL; varying vec3 vW; varying vec3 vN;
    void main(){
      vL = position.xy;
      vec4 lp = vec4(position, 1.);
      vec3 n = normal;
      #ifdef USE_INSTANCING
        lp = instanceMatrix * lp;
        n = mat3(instanceMatrix) * n;
      #endif
      vec4 wp = modelMatrix * lp;
      vW = wp.xyz;
      vN = normalize(mat3(modelMatrix) * n);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const panelFrag = `
    uniform float uPitch, uChip, uBus, uBusW, uHexR, uEdge, uSunRad, uIrr, uSpec, uWrinkle, uMode, uT, uDT, uTlo, uThi, uBackLight;
    uniform vec3 uSunDir, uSunCol;
    varying vec2 vL; varying vec3 vW; varying vec3 vN;
    ${blackbody.INFERNO_GLSL}
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    // Anti-aliased line grid: resolves to the true average coverage when lines are sub-pixel.
    float lines(vec2 p, float P, float W){
      vec2 fw = max(fwidth(p), vec2(1e-7));
      vec2 d = abs(fract(p / P + 0.5) - 0.5) * P;
      vec2 cov = clamp((0.5 * W - d) / fw + 0.5, 0., 1.);
      vec2 t = clamp(fw / P * 1.5 - 0.25, 0., 1.);
      cov = mix(cov, vec2(W / P), t);
      return 1. - (1. - cov.x) * (1. - cov.y);
    }
    float squares(vec2 p, float P, float C){
      vec2 fw = max(fwidth(p), vec2(1e-7));
      vec2 q = abs(fract(p / P) - 0.5) * P;
      vec2 cov = clamp((0.5 * C - q) / fw + 0.5, 0., 1.);
      float sharp = cov.x * cov.y;
      float t = clamp(max(fw.x, fw.y) / P * 1.5 - 0.25, 0., 1.);
      return mix(sharp, (C * C) / (P * P), t);
    }
    void main(){
      bool front = gl_FrontFacing;
      vec2 p = vL;
      float r = length(p);
      // hex edge distance (flat-topped hexagon with circumradius uHexR)
      vec2 a = abs(p);
      float hexD = max(a.x * 0.8660254 + a.y * 0.5, a.y) ;
      float inner = uHexR * 0.8660254;
      float edge = smoothstep(inner - uEdge - fwidth(hexD), inner - uEdge, hexD);

      float chip = squares(p - uPitch * 0.5, uPitch, uChip);
      float bus = lines(p, uBus, uBusW);
      float cellLine = lines(p, uPitch, 0.0012);

      if (uMode < 0.5) {
        if (!front) { gl_FragColor = vec4(vec3(0.004, 0.004, 0.005) * uBackLight, 1.); return; }
        // diffuse albedos
        vec3 pv = vec3(0.018, 0.024, 0.055);
        vec3 col = pv;
        col = mix(col, vec3(0.05), cellLine);
        col = mix(col, vec3(0.07, 0.07, 0.075), chip);
        // die detail once a chip spans many pixels: glass-passivated die, seal ring, bond pads
        vec2 qc = (fract(p / uPitch) - 0.5) * uPitch;            // chip-centred coordinates
        float px = max(fwidth(p).x, fwidth(p).y);
        float detail = clamp(uChip / px / 40. - 0.5, 0., 1.);
        if (detail > 0. && max(abs(qc.x), abs(qc.y)) < uChip * 0.5) {
          float e = max(abs(qc.x), abs(qc.y)) / (uChip * 0.5);
          float ring = smoothstep(0.86, 0.88, e) * (1. - smoothstep(0.93, 0.95, e));
          vec2 pg = abs(fract(qc / (uChip * 0.08)) - 0.5);
          float pads = step(0.9, e) * step(e, 0.98) * step(max(pg.x, pg.y), 0.3);
          vec2 cg = abs(fract(qc / (uChip * 0.18)) - 0.5);
          float cores = step(e, 0.8) * step(max(cg.x, cg.y), 0.42);
          vec3 die = vec3(0.045, 0.05, 0.065) + vec3(0.02, 0.018, 0.03) * cores;
          die = mix(die, vec3(0.32, 0.32, 0.34), ring);
          die = mix(die, vec3(0.55, 0.5, 0.42), pads);
          col = mix(col, die, detail);
        }
        col = mix(col, vec3(0.30, 0.30, 0.31), bus);
        col = mix(col, vec3(0.075, 0.08, 0.09), edge);
        vec3 lit = col * uIrr * uSunCol;
        // specular glint off a wrinkled film: slope noise tilts the normal by ~uWrinkle
        vec2 sl = (vec2(noise(p * 0.08), noise(p * 0.08 + 31.7)) - 0.5) * 2.
                + (vec2(noise(p * 0.9 + 5.), noise(p * 0.9 + 17.)) - 0.5) * 0.6;
        vec3 n = normalize(vN + vec3(sl * uWrinkle * 2.0, 0.));
        vec3 v = normalize(cameraPosition - vW);
        vec3 refl = reflect(-uSunDir, n);
        float ang = acos(clamp(dot(refl, v), -1., 1.));
        float glint = exp(-ang * ang / 0.00002);             // sun disc ~0.2° radius
        float spec = mix(uSpec, 0.9, max(bus, edge * 0.5));
        lit += uSunCol * uSunRad * spec * glint;
        gl_FragColor = vec4(lit, 1.);
      } else {
        // thermal: sheet temperature + chip hot spots (auto-ranged like an IR camera)
        vec2 q = (fract(p / uPitch) - 0.5) * uPitch;
        float rr = dot(q, q);
        float sig = uChip * 0.9;
        float spot = exp(-rr / (2. * sig * sig));
        float fw = max(fwidth(p).x, fwidth(p).y);
        float tt = clamp(fw / uPitch * 1.5 - 0.25, 0., 1.);
        spot = mix(spot, 6.2832 * sig * sig / (uPitch * uPitch), tt);
        float T = uT + uDT * spot - (front ? 0. : 0.6);
        float x = (T - uTlo) / (uThi - uTlo);
        gl_FragColor = vec4(inferno(x) * 0.9, 1.);
      }
    }`;
  const panelMat = new THREE.ShaderMaterial({
    uniforms: panelUniforms, vertexShader: panelVert, fragmentShader: panelFrag, side: THREE.DoubleSide,
    extensions: { derivatives: true },
  });
  let hexR = 620;
  let panelGeo = new THREE.ShapeGeometry(hexShape(hexR));
  const panel = new THREE.Mesh(panelGeo, panelMat);
  scene.add(panel);
  const outlineMat = new THREE.LineBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.55 });
  let outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(hexShape(hexR).getPoints().map(q => new THREE.Vector3(q.x, q.y, 0.3))), outlineMat);
  panel.add(outline);
  const tween = createCameraTween(THREE, camera, controls);

  // the film's edge: true thickness, or ×10⁴ when Enlarged
  const RIM_EXAG = 1e4;
  const rimMat = new THREE.MeshBasicMaterial({ color: 0x8a8f99, side: THREE.DoubleSide });
  const rim = new THREE.Mesh(new THREE.BufferGeometry(), rimMat);
  panel.add(rim);
  function rimGeometry(R) {
    const pos = [];
    for (let k = 0; k < 6; k++) {
      const a0 = (Math.PI / 3) * k, a1 = (Math.PI / 3) * (k + 1);
      const x0 = R * Math.cos(a0), y0 = R * Math.sin(a0), x1 = R * Math.cos(a1), y1 = R * Math.sin(a1);
      pos.push(x0, y0, -0.5, x1, y1, -0.5, x1, y1, 0.5, x0, y0, -0.5, x1, y1, 0.5, x0, y0, 0.5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }
  rim.geometry = rimGeometry(hexR);

  // neighbours (same material, instanced)
  const neighborMat = panelMat.clone();
  neighborMat.uniforms = panelUniforms; // share uniforms
  let neighbors = new THREE.InstancedMesh(panelGeo, neighborMat, NEIGHBOR_MAX);
  neighbors.count = 0;
  scene.add(neighbors);

  // laser terminals at the corners (small cylinders, only visible up close)
  const termGroup = new THREE.Group();
  const termMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.35 });
  const termGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.35, 24);
  for (let k = 0; k < TERMINALS; k++) {
    const m = new THREE.Mesh(termGeo, termMat);
    m.rotation.x = Math.PI / 2;
    termGroup.add(m);
  }
  panel.add(termGroup);
  const sunLight = new THREE.DirectionalLight(sunRGB, 3);
  sunLight.position.copy(sunDir);
  scene.add(sunLight);

  // a person for scale, floating just off the radiator face
  const person = new THREE.Group();
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9d4c7, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.05, 6, 12), mat);
    body.position.y = 0.17 + 0.525;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat);
    head.position.y = 1.62;
    person.add(body, head);
    person.rotation.x = Math.PI / 2;
    person.position.set(4, 2, -0.6);
  }
  scene.add(person);

  // football pitch outline on the PV face for scale (105 m × 68 m)
  const pitch = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([[-52.5, -34], [52.5, -34], [52.5, 34], [-52.5, 34]].map(([x, y]) => new THREE.Vector3(x + 180, y - 120, 0.05))),
    new THREE.LineDashedMaterial({ color: 0x8fd3a6, dashSize: 4, gapSize: 3, transparent: true, opacity: 0.8 }),
  );
  pitch.computeLineDistances();
  scene.add(pitch);

  // ------------------------------------------------------------------ state
  const v = { f: 0, spacing: 1e9, T: 340, S: 1000, mode: 'visible', spin: 0, thick: 7e-5, exag: false };
  const tmp = new THREE.Vector3();

  function rebuildPanel(R) {
    if (Math.abs(R - hexR) / hexR < 1e-6) return;
    hexR = R;
    const g = new THREE.ShapeGeometry(hexShape(hexR));
    panel.geometry.dispose();
    panel.geometry = g;
    rim.geometry.dispose();
    rim.geometry = rimGeometry(hexR);
    outline.geometry.dispose();
    outline.geometry = new THREE.BufferGeometry().setFromPoints(hexShape(hexR).getPoints().map(q => new THREE.Vector3(q.x, q.y, 0.3)));
    scene.remove(neighbors);
    neighbors.dispose();
    neighbors = new THREE.InstancedMesh(g, neighborMat, NEIGHBOR_MAX);
    neighbors.count = 0;
    scene.add(neighbors);
    termGroup.children.forEach((m, k) => {
      const a = (Math.PI / 3) * k;
      m.position.set(hexR * Math.cos(a) * 0.995, hexR * Math.sin(a) * 0.995, 0.2);
    });
  }

  function layoutNeighbors(state) {
    // Mean in-plane spacing for coverage f with tiling efficiency: each satellite owns A_sat / f of shell.
    const { params: p, now } = state;
    const f = Math.max(1e-12, now.f);
    v.spacing = Math.sqrt(p.satArea / f);
    const s = Math.max(v.spacing, 2.05 * hexR);
    let n = 0;
    const m = new THREE.Matrix4();
    const range = 26000;
    const kMax = Math.ceil(range / s);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cand = [];
    for (let i = -kMax; i <= kMax; i++) {
      for (let j = -kMax; j <= kMax; j++) {
        if (i === 0 && j === 0) continue;
        const jit = 0.03 + 0.4 * (1 - Math.sqrt(Math.min(1, f)));   // full coverage needs coordinated tiling
        const x = (i + 0.5 * (j & 1)) * s + (rnd() - 0.5) * jit * s;
        const y = j * s * 0.8660254 + (rnd() - 0.5) * jit * s;
        const z = (rnd() - 0.5) * 2 * NEIGHBOR_DZ;     // other orbital shells, offset radially
        const d = Math.hypot(x, y);
        if (d < range) cand.push([d, x, y, z, rnd() * Math.PI]);
      }
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, x, y, z, rot] of cand.slice(0, NEIGHBOR_MAX)) {
      m.makeRotationZ(rot * (1 - Math.min(1, f))).setPosition(x, y, z * (1 - 0.8 * Math.min(1, f)));
      neighbors.setMatrixAt(n++, m);
    }
    neighbors.count = n;
    neighbors.instanceMatrix.needsUpdate = true;
  }

  function onState(state) {
    const { params: p, d, now, view } = state;
    rebuildPanel(d.sat.hexSide);
    v.f = now.f;
    v.T = now.tSheet;
    v.S = d.S;
    v.mode = view.mode;
    v.exag = view.exaggerate;
    v.thick = d.sat.equivAlThicknessM;
    rim.scale.set(1, 1, v.thick * (view.exaggerate ? RIM_EXAG : 1));
    panel.scale.z = 1;
    const S0 = constants.S0;
    const irr = d.S / S0;
    const u = panelUniforms;
    v.pitch = d.chipPitch;
    v.die = Math.min(0.6 * v.pitch, Math.sqrt(p.chipPower / CHIP_DIE_W_PER_M2));
    u.uPitch.value = v.pitch;
    u.uChip.value = v.die;
    u.uHexR.value = hexR;
    u.uIrr.value = irr;
    u.uMode.value = view.mode === 'thermal' ? 1 : 0;
    u.uT.value = now.tSheet;
    u.uDT.value = p.dTJunction;
    u.uTlo.value = now.tSheet - 25;
    u.uThi.value = now.tSheet + 20;
    // sky: Sun's angular radius from this orbit; far-side glow f·rho·S/S0; specular halo f·rho_s·(S/S0)/delta²
    const angR = PHYS.R_SUN / (d.rAU * PHYS.AU);
    skyMat.uniforms.uSunCos.value = Math.cos(angR);
    skyMat.uniforms.uGlow.value.setRGB(0.55, 0.62, 1.0).multiply(sunRGB).multiplyScalar(now.f * p.reflectVis * irr);
    skyMat.uniforms.uHalo.value = (now.f * SPEC_REFLECT * irr) / (WRINKLE * WRINKLE) / 60;
    skyMat.uniforms.uDelta.value = WRINKLE;
    skyMat.uniforms.uMode.value = view.mode === 'thermal' ? 1 : 0;
    const x = (now.tSheet - (now.tSheet - 25)) / 45;
    skyMat.uniforms.uIR.value.setRGB(...blackbody.inferno(x)).multiplyScalar(0.9 * Math.min(1, now.f));
    layoutNeighbors(state);
    person.visible = true;
    v.baseExposure = view.mode === 'thermal' ? 1 : 1.25 / irr;
  }

  const api = {
    id: 'satellite', scene, camera, controls, exposure: 1.5, bloom: 0.5, bloomThreshold: 2.0,
    activate() { controls.enabled = true; },
    deactivate() { controls.enabled = false; },
    onState,
    presets: [
      { label: 'Whole satellite', apply: () => tween.go(new THREE.Vector3(-1500, -1350, 2050), new THREE.Vector3(0, 0, 0)) },
      { label: 'Toward the Sun', title: 'From behind the radiator, looking sunward', apply: () => tween.go(new THREE.Vector3(820, 380, -1100), new THREE.Vector3(700, 300, 600)) },
      { label: 'Edge-on', apply: () => tween.go(new THREE.Vector3(-900, -20, 2.5), new THREE.Vector3(0, 0, 0)) },
      { label: 'Person for scale', apply: () => tween.go(new THREE.Vector3(-1.5, -4.5, 2.6), person.position.clone()) },
      { label: 'One chip', apply: () => {
        const c = new THREE.Vector3(v.pitch / 2, v.pitch / 2, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), v.spin);
        tween.go(c.clone().add(new THREE.Vector3(-1.2, -2, 1.8).multiplyScalar(v.pitch)), c);
      } },
    ],
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    update(dt, state) {
      tween.tick(dt);
      controls.update();
      const dist = camera.position.distanceTo(controls.target);
      outline.visible = dist > 150;
      // Auto-exposure: a camera pointed near the Sun (and its glint halo) stops down.
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      const offSun = Math.acos(Math.min(1, fwd.dot(sunDir))) * 180 / Math.PI;
      const halfFov = camera.fov / 2 * Math.max(1, camera.aspect);
      const inView = Math.min(1, Math.max(0, (halfFov + 6 - offSun) / 8));
      const target = (v.baseExposure ?? 1) * (state.view.mode === 'thermal' ? 1 : 1 - 0.85 * inView);
      api.exposure += (target - api.exposure) * Math.min(1, dt * 4);
      camera.near = Math.max(0.002, dist * 0.002);
      camera.far = Math.max(1e5, dist * 50);
      camera.updateProjectionMatrix();
      sky.position.copy(camera.position);
      sky.scale.setScalar(camera.far * 0.9);

      v.spin += (dt * 2 * Math.PI) / SPIN_PERIOD_S;   // real time
      panel.rotation.z = v.spin;
      pitch.rotation.z = v.spin;
      person.position.set(4 * Math.cos(v.spin) - 2 * Math.sin(v.spin), 4 * Math.sin(v.spin) + 2 * Math.cos(v.spin), -0.6);
      person.rotation.set(Math.PI / 2, v.spin, 0);

      const L = ctx.labels;
      const { d, now, params: p } = state;
      const fmtLen = format.length;
      // Edge-on check: angle between view direction and the panel plane
      const viewDir = tmp.copy(camera.position).sub(controls.target).normalize();
      const elev = Math.asin(Math.abs(viewDir.z)) * 180 / Math.PI;
      if (dist > 300 && elev > 5) {
        L.put('size', new THREE.Vector3(hexR * Math.cos(v.spin + 0.5), hexR * Math.sin(v.spin + 0.5), 0),
          `${fmtLen(2 * hexR)} across<small>${format.sci(p.satArea)} m² · ${format.kg(d.sat.mass)}</small>`, 'sun');
        L.put('power', new THREE.Vector3(-hexR * 0.55 * Math.cos(v.spin), -hexR * 0.55 * Math.sin(v.spin), 0),
          `${format.watts(d.sat.elec)} of compute<small>${format.watts(d.sat.heat)} of heat to radiate · ${format.sci(d.sat.flops)} FLOP/s</small>`, state.view.mode === 'thermal' ? 'ir' : 'sun');
        L.put('pitchlbl', new THREE.Vector3(180 * Math.cos(v.spin) + 120 * Math.sin(v.spin), 180 * Math.sin(v.spin) - 120 * Math.cos(v.spin), 0),
          'Football pitch, 105 m', 'muted');
      }
      if (dist < 40) {
        L.put('person', person.position.clone(), 'Person, 1.75 m', 'muted');
        L.put('chip', new THREE.Vector3(v.pitch / 2, v.pitch / 2, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), v.spin),
          `${(v.die * 1000).toFixed(0)} mm chip every ${fmtLen(v.pitch)}<small>${p.chipPower.toFixed(2)} W each · ${format.sci(d.chipsPerSat)} on this satellite</small>`, 'sun');
      }
      if (elev < 3 && dist < 5000) {
        L.put('edge', controls.target.clone(), `Edge-on: ${fmtLen(v.thick)} thick${v.exag ? ' (drawn 10,000× thicker)' : ''}<small>width/thickness ${format.sci((2 * hexR) / v.thick)} : 1 · printer paper is ~2,900 : 1${v.exag ? '' : ' · switch to Enlarged to see the edge'}</small>`, 'sun nodot');
      }
      // nearest neighbour
      const nn = v.spacing;
      const nnDir = new THREE.Vector3(1, 0.35, 0).normalize().multiplyScalar(Math.min(nn, 24000));
      if (elev > 5) L.put('nn', nnDir, nn > 26000 ? `Nearest neighbour ≈ ${fmtLen(nn)} away<small>off screen: coverage is ${format.pct(now.f, 3)}</small>` : `Neighbours ≈ ${fmtLen(nn)} apart`, 'muted nodot');
      const sunPos = sunDir.clone().multiplyScalar(dist * 3).add(camera.position);
      L.put('sunlbl', sunPos, `Sun · ${(2 * PHYS.R_SUN / (d.rAU * PHYS.AU) * 180 / Math.PI).toFixed(2)}° wide<small>${format.sci(d.S)} W/m² on the panel</small>`, 'sun');
    },
    caption(state) {
      const { d, params: p, now } = state;
      const thick = format.length(d.sat.equivAlThicknessM);
      return {
        eyebrow: 'Chapter 2 · The satellite',
        title: `A ${format.length(2 * d.sat.hexSide)} sheet, ${thick} thick`,
        body: `
          <p>Each satellite is a sun-facing film: thin silicon PV on the front, <span class="num">${format.sci(d.chipsPerSat)}</span> fingernail-sized chips woven into it, the back face a radiator. It weighs <span class="num">${format.kg(d.sat.mass)}</span> and turns <span class="num">${format.watts(d.sat.heat)}</span> of sunlight into <span class="num">${format.watts(d.sat.elec)}</span> of computing.</p>
          <p>The chips have to be spread out. A thin sheet conducts heat sideways so poorly that a single 700 W GPU would cook its patch, so the panel itself is the computer: one ${p.chipPower.toFixed(2)} W die every ${format.length(d.chipPitch)}, about ${Math.round(p.dTJunction)} K above the film.</p>
          <p>${now.f < 1e-3 ? `At ${format.pct(now.f, 3)} coverage its nearest neighbour is ${format.length(Math.sqrt(p.satArea / Math.max(1e-12, now.f)))} away.` : `Look toward the Sun: the far side of the swarm glows, and a specular halo surrounds the Sun.`}</p>`,
        hint: 'Scroll to zoom from kilometres to centimetres · orbit edge-on to see how thin it is',
      };
    },
  };
  return api;
}

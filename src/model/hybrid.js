// Model v4: the hybrid swarm of docs/architecture.md, with the hardware of the era that actually
// gets built (docs/future-tech.md).
// Compute sails carry almost all chip power: thin c-Si PV film with ~0.15 W chiplets every 2-2.5 cm,
// where the film is its own radiator. A small share runs in shielded pods (PV wings, pumped
// two-phase loops, knife-edge radiators) for work the film cannot host. Sails sit as close to the
// Sun as their chip limit allows. Pods sit near their mass optimum.
//
// The build-out is a short time-stepped simulation, not a closed form, because several limits
// interact:
//  - industry doubles every T_d' = T_d + ln2 · I · a years, where the fab penalty uses
//    I = kg of fab tools per m²/yr of die and a = m² of die per kg of swarm;
//  - Mercury's surface can shed only so much heat, which caps the export rate;
//  - sails retire after L years, and a fraction ρ of their mass is recycled in orbit;
//  - Mercury's rock is finite;
//  - the build stops at the chosen coverage.
// The standing fleet is everything produced in the last L years.
import { PHYS, MERCURY, EARTH } from './constants.js';
import { pvEta, pvState, radiatorFlux } from './sat2.js';
import { flux, rForFlux, sheetTemp, fluxForTemp, launchFromMercury, earthImpact,
  mercuryRadius, mercurySurfaceLayer } from './model.js';

const { L_SUN, AU, SIGMA, C, YEAR } = PHYS;

// Energy per operation relative to 85 °C at the same clock, for 2026 logic re-optimised for heat
// (hot-silicon research: x1.20 @105, x1.43 @125, x1.76 @150, x2.31 @175 °C).
const E_REL = [[85, 1.0], [95, 1.10], [105, 1.20], [125, 1.43], [150, 1.76], [175, 2.31], [200, 4.09]];
/**
 * Energy per op at junction temperature tjC relative to 85 °C. With no slope, the 2026 table.
 * With a slope (per K), exp(slope · (Tj − 85)): mature logic approaches E ∝ T² (≈ 0.56 %/K).
 */
export function energyPenalty(tjC, slope = null) {
  if (tjC <= 85) return 1;
  if (slope != null) return Math.exp(slope * (tjC - 85));
  for (let i = 1; i < E_REL.length; i++) {
    const [t1, e1] = E_REL[i], [t0, e0] = E_REL[i - 1];
    if (tjC <= t1) return e0 * (e1 / e0) ** ((tjC - t0) / (t1 - t0));
  }
  return E_REL[E_REL.length - 1][1];
}

// Slider defaults are the mature, central era (2100+ hardware: what the bulk of the swarm is built
// with). ERAS below gives the 2026 reference and the pessimistic/optimistic bundles.
export const PARAMS = [
  // chips
  { key: 'jPerFlop85', group: 'Chips', label: 'Energy per FLOP at 85 °C, full clock', unit: 'J', min: 1e-16, max: 1e-12, log: true, value: 2.32e-15,
    help: 'System level (logic, memory, interconnect) per dense FP8-equivalent op. 2026: 1.3e-13. Mature era: ~2.3e-15 (×0.6 under-clocked = 1.4e-15). Practical irreversible floor at 358 K ≈ 7e-16.' },
  { key: 'clockFactor', group: 'Chips', label: 'Energy factor from under-clocking', unit: '', min: 0.4, max: 1, step: 0.01, value: 0.6,
    help: 'More silicon at ~0.6× clock and lower voltage.' },
  { key: 'hotLogicSlope', group: 'Chips', label: 'Energy-per-op rise above 85 °C', unit: '/K', min: 0.003, max: 0.012, step: 0.0001, value: 0.0056,
    help: 'Mature logic: E ∝ T² (0.56 %/K). 2026 hot-optimised logic: the measured table (~0.9 %/K).' },
  { key: 'tjFilmC', group: 'Chips', label: 'Sail chiplet junction limit', unit: '°C', min: 60, max: 150, step: 1, value: 85,
    help: 'Hotter chips let sails sit nearer the Sun but cost energy per op: a few percent more FLOP/s per kg at 105–150 °C, and 17–43 % less computing per joule of sunlight.' },
  { key: 'filmSpreadDT', group: 'Chips', label: 'Chiplet rise above the film', unit: 'K', min: 3, max: 30, step: 0.5, value: 9,
    help: '0.15 W at 20.9 mm pitch: 7.1 K (finite-volume check); 9 K with margin.' },
  { key: 'tjPodC', group: 'Chips', label: 'Pod junction limit', unit: '°C', min: 85, max: 150, step: 1, value: 105 },
  { key: 'chipPower', group: 'Chips', label: 'Power per sail chiplet', unit: 'W', min: 0.05, max: 1, log: true, value: 0.15,
    help: 'Spreader mass in a thin film grows as P²: 0.09 g/W at 0.1 W, 0.94 g/W at 1 W.' },
  // compute sail
  { key: 'pvEta0', group: 'Compute sail', label: 'PV efficiency (AM0, 28 °C)', unit: '', min: 0.1, max: 0.35, step: 0.005, value: 0.215,
    help: 'Thin c-Si made without hydrogen: 21–22 %. Si single-junction limit at AM0 is 30 %; a speculative all-Si tandem reaches ~25–30 %. Perovskites and III-Vs are element-limited on Mercury.' },
  { key: 'pvTempCo', group: 'Compute sail', label: 'PV temperature coefficient', unit: '/K', min: -0.006, max: 0, step: 0.0001, value: -0.0034,
    help: 'A 30 µm IBC film (Voc ≈ 0.685 V): −0.34 %/K. −0.42 %/K is an older, lower-voltage cell.' },
  { key: 'alpha', group: 'Compute sail', label: 'Solar absorptance of the film', unit: '', min: 0.7, max: 0.95, step: 0.01, value: 0.80,
    help: '25.5 % of sunlight lies below the Si band gap and is pure heat. A metal back reflector sends it back out (0.90 → 0.80).' },
  { key: 'epsFront', group: 'Compute sail', label: 'Front IR emissivity', unit: '', min: 0.5, max: 0.98, step: 0.01, value: 0.85 },
  { key: 'epsBack', group: 'Compute sail', label: 'Back IR emissivity', unit: '', min: 0.5, max: 0.98, step: 0.01, value: 0.90,
    help: 'Needs a 15 µm microtextured silicate enamel; a 5 µm coat on Mg gives only ~0.61.' },
  { key: 'filmAreal', group: 'Compute sail', label: 'Sail areal density', unit: 'kg/m²', min: 0.05, max: 0.5, step: 0.005, value: 0.195,
    help: 'Design spec: 0.203 kg/m² (glass 0.050, c-Si 0.070, Mg 0.023, enamel 0.041, wiring, structure, terminals).' },
  { key: 'filmThin', group: 'Compute sail', label: 'Film mass vs the design spec', unit: '×', min: 0.4, max: 1, step: 0.01, value: 0.52,
    help: '1: the design spec (30 µm silicon, 20 µm cover glass, 15 µm back enamel). 0.52: 10 µm light-trapped silicon, 8 µm glass, 6 µm enamel; cells ~5 % less efficient, and the thinner glass lets more solar protons through, so cells are annealed at each refresh.' },
  { key: 'filmOverbuild', group: 'Compute sail', label: 'Spare area (attrition, dead chiplets)', unit: '', min: 0, max: 0.3, step: 0.01, value: 0.10 },
  { key: 'computeShare', group: 'Compute sail', label: 'Electricity reaching chips', unit: '', min: 0.5, max: 1, step: 0.01, value: 0.9 },
  { key: 'packing', group: 'Compute sail', label: 'Cell packing factor', unit: '', min: 0.7, max: 1, step: 0.01, value: 0.92 },
  { key: 'laserKgPerW', group: 'Compute sail', label: 'Laser terminals per watt', unit: 'kg/W', min: 1e-6, max: 1e-4, log: true, value: 4.4e-6,
    help: '2026: 64 × 10 cm terminals per sail. Mature: ~12 (8 × 10 cm + 4 × 30 cm) at 50–400 Tbps each.' },
  { key: 'sailArea', group: 'Compute sail', label: 'Area of one sail', unit: 'm²', min: 1e2, max: 1e8, log: true, value: 69543,
    help: 'Design spec: 279 m square flown as a diamond. 150–300 m in every era.' },
  // pods
  { key: 'podFrac', group: 'Pods', label: 'Share of chip power in pods', unit: '', min: 0, max: 1, step: 0.005, value: 0.06,
    help: 'Radiation-soft DRAM and storage, big dies, archives, agent sandboxes the film cannot host. ~1 % if every chiplet can run a sandbox; ~15 % if none can.' },
  { key: 'rPod', group: 'Pods', label: 'Preferred pod orbit radius', unit: 'AU', min: 0.5, max: 1.5, step: 0.01, value: 0.88,
    help: 'Mass optimum 0.86–0.90 AU. Pods that serve sails fly in lanes among them (links close within ~3,000 km).' },
  { key: 'podPower', group: 'Pods', label: 'Chip power per pod', unit: 'W', min: 1e4, max: 1e8, log: true, value: 1e6 },
  { key: 'podRadC', group: 'Pods', label: 'Pod radiator temperature', unit: '°C', min: 40, max: 120, step: 1, value: 80 },
  { key: 'wingAreal', group: 'Pods', label: 'Pod PV wing areal density', unit: 'kg/m²', min: 0.1, max: 2, step: 0.01, value: 0.12 },
  { key: 'radAreal', group: 'Pods', label: 'Pod radiator areal density', unit: 'kg/m²', min: 0.5, max: 5, step: 0.05, value: 1.3,
    help: 'SO2 heat-pipe blades sized for ≤1 %/yr meteoroid loss.' },
  { key: 'podKgPerKW', group: 'Pods', label: 'Module, loops, shielding, bus', unit: 'kg/kW', min: 0.5, max: 10, step: 0.1, value: 1.0 },
  // swarm
  { key: 'coverage', group: 'Swarm', label: 'Stop building at this share of sunlight', unit: '', min: 1e-6, max: 1, log: true, value: 1,
    help: '100 % = no target: industry builds until refresh, rock or heat stops it.' },
  { key: 'placement', group: 'Swarm', label: 'Sail placement', unit: '', options: ['thermal', 'manual'], value: 'thermal',
    help: 'Thermal: as close to the Sun as the chiplet limit allows, given how much of the sky the swarm already fills.' },
  { key: 'rManual', group: 'Swarm', label: 'Manual sail orbit radius', unit: 'AU', min: 0.5, max: 2, step: 0.01, value: 0.92 },
  // Earth (docs/earth.md)
  { key: 'rhoVis', group: 'Earth', label: 'Visible reflectance of a sail, all hardware', unit: '', min: 0.001, max: 0.02, step: 0.0005, value: 0.004,
    help: 'Film 0.002 plus hinge strips, scribes, hems and vanes: 0.0024–0.0056 for the design spec.' },
  { key: 'forcingLimit', group: 'Earth', label: 'Extra heat Earth accepts', unit: 'W/m²', min: 0, max: 10, step: 0.05, value: 0,
    help: 'Net, after the L1 shade. 0 holds Earth’s average temperature where it is; doubling CO₂ is 3.9.' },
  { key: 'shadeLimit', group: 'Earth', label: 'Most the L1 shade may cancel', unit: 'W/m²', min: 0, max: 300, step: 0.5, value: 300,
    help: 'The shade swaps sunlight for the swarm’s infrared: Earth keeps its temperature but gets 0.42 % less sunlight and 0.76 % less rain per W/m². 300 is no limit.' },
  { key: 'earthPlacement', group: 'Earth', label: 'Where the sails fly', unit: '', options: ['closed', 'uniform', 'farside', 'cone', 'shell'], value: 'closed',
    help: 'closed: the Sun enclosed at 0.95 AU; a cap of cold mirrors between the Sun and Earth hides the swarm from Earth and lets sunlight through a window. uniform: all round the Sun at 0.95 AU, infrared-dark fronts on every sail, empty only within 23° of the Sun–Earth line and 15° of L3. farside: only on Earth’s orbit beyond the Sun. cone and shell: inside Earth’s orbit with ordinary fronts, with and without the empty cone.' },
  { key: 'farsideLat', group: 'Earth', label: 'Far-side cloud reaches', unit: '° from Earth’s orbital plane', min: 30, max: 70, step: 5, value: 60,
    help: 'More room higher up, but tilted orbits drift along Earth’s orbit (±20° at 60°), which eats into it: 18 % at 30°, 28 % at 60°, 29 % at 70°.' },
  { key: 'spillInside', group: 'Earth', label: 'When the far side is full', unit: '', options: ['inside', 'stop'], value: 'inside',
    help: 'inside: the rest fly inside Earth’s orbit, outside a ~30° cone round the Sun–Earth line, so Earth sees none of their hot backs and gets half the heat. stop: the swarm stops at the far side’s room.' },
  // industry
  { key: 'yieldDelivered', group: 'Industry', label: 'Spacecraft kg per kg of rock', unit: '', min: 0.2, max: 0.9, step: 0.01, value: 0.42,
    help: 'Oxides reduced to Si, Mg, Al, Ca; the oxygen becomes glass and ion-thruster propellant. 0.5 would need ~100 % Si recovery.' },
  { key: 'rockSource', group: 'Industry', label: 'What of Mercury is mined', unit: '', options: ['whole', 'mantle'], value: 'whole',
    help: 'mantle: crust and mantle, 24 % of the planet. whole: then the iron core for its ~6 % silicon, at ~4× the heat per kilogram of spacecraft; the core is lifted whole and refined in orbit, and its iron kept for shielding and reaction mass.' },
  { key: 'seedMass', group: 'Industry', label: 'Seed factory mass on Mercury', unit: 'kg', min: 1e4, max: 1e9, log: true, value: 1e6 },
  { key: 'doublingYears', group: 'Industry', label: 'Industrial doubling time (before fab tooling)', unit: 'yr', min: 0.25, max: 5, step: 0.05, value: 1 },
  { key: 'fabToolIntensity', group: 'Industry', label: 'Fab tool mass per m²/yr of chip die', unit: 'kg·yr/m²', min: 0, max: 500, step: 1, value: 40,
    help: '2026 leading-edge fab ≈ 250; space-native vacuum wafer fab ≈ 40; speculative panel imprint + self-assembly ≈ 3–15.' },
  { key: 'dieMm2PerW', group: 'Industry', label: 'Chip die per W on the film', unit: 'mm²/W', min: 5, max: 100, step: 0.5, value: 22,
    help: '2026 SRAM chiplets: 40 mm²/W. With non-volatile memory sized to the useful minimum (1–2 GB): ~22.' },
  { key: 'serviceLife', group: 'Industry', label: 'Service life before a rebuild', unit: 'yr', min: 0, max: 1000, step: 5, value: 300,
    help: '0 = never retired. Repaired in place between rebuilds: cells annealed, chiplets swapped, holes patched. The one wear nothing repairs, solar-wind sputtering, takes ~0.03 nm a year off the glass. Today’s designs: 10–30 years.' },
  { key: 'recycleFrac', group: 'Industry', label: 'Mass recycled in orbit at a rebuild', unit: '', min: 0, max: 0.999, step: 0.001, value: 0.99,
    help: 'The standing fleet levels off at export × life / (1 − recycled). Without recycling a 10-year fleet stalls near 1 % coverage.' },
  { key: 'heatPerKg', group: 'Industry', label: 'Waste heat left on Mercury per kg mined', unit: 'MJ/kg', min: 0.05, max: 20, log: true, value: 0.1,
    help: 'Digging (~0.05) plus a surface launch only to low orbit at 3 km/s: 0.1 with superconducting launchers at 99 %, 0.3 at 95 %. Catapults in orbit add the rest and shed their losses to space. Refining on the surface and a full-speed launch: ~2–5.' },
  { key: 'mercuryHeatLimit', group: 'Industry', label: 'Heat Mercury’s surface can shed', unit: 'W', min: 1e17, max: 1e22, log: true, value: 5e18,
    help: 'The whole planet paved with radiators heat-pumped to ~1,650 K. Unpumped at 500 K it sheds only 2×10¹⁷; at 2,000 K about 10¹⁹, near the end of what refractories allow.' },
  { key: 'energyPerKg', group: 'Industry', label: 'Energy to make 1 kg of spacecraft', unit: 'MJ/kg', min: 100, max: 20000, log: true, value: 1150,
    help: 'Dry chlorine/oxygen process in vacuum; chips are 80–95 % of it. Still only 3–5 % of swarm output.' },
  { key: 'seedYear', group: 'Industry', label: 'Year of the first launch', unit: '', min: 2030, max: 2200, step: 1, value: 2050 },
];

export function defaults() {
  return Object.fromEntries(PARAMS.map(s => [s.key, s.value]));
}

// Fixed design values from the research passes (not sliders).
export const FIXED = {
  film: { pvT0: 301 },
  wing: { pvAlpha: 0.9, pvEpsFront: 0.85, pvEpsBack: 0.85, pvPacking: 0.9, pvT0: 301 },
  // two faces at eps 0.9, 4 % of the view blocked by the module and wings, fin efficiency 0.75
  rad: { radEps: 0.9, radFinEff: 0.96 * 0.75 },
  podComputeShare: 0.9,
  podDieMm2PerW: 5.5,      // pod die (memory weighted) per W
  toolLife: 10,            // yr; fab tools are replaced like everything else
  // Earth-safe studies (docs/data/earth_safe*.json, docs/earth.md). Far-side cloud: a thin layer on
  // Earth's orbit, 90–165° and 195–270° from Earth (L3 ± 15° stays empty), ±30° of the ecliptic.
  // Ground illuminance once the Sun is 18° down, ecliptic upright (the worst case): 0.368 lux per
  // 1 % at rho 0.003 (render/sky_map.py; 0.31 in the study's run without the L3 gap; the shell is
  // computed by skyLux). Mercury-native Al/Mg mesh low-e fronts: 0.396 W/m² of IR per 1 %, FLOP/J
  // ×0.66 vs the shell (chips at 110 °C). At most 0.9 of the patch can be filled: 0.9 · 150/360 ·
  // sin 30° = 18.75 % (±60° would double that for ~6 % more infrared per 1 %).
  skyLuxPerFRho: 0.368 / (0.01 * 0.003),
  skyDepression: 18,       // deg: the sky rule is set at the end of astronomical twilight
  lumensPerW: 93,          // sunlight reflected off the sails
  farsideIRPerF: 39.6,
  farsideFlopFactor: 0.66,
  // room on the far side by the cloud's reach from Earth's orbital plane: 0.9 of the patch, less
  // what tilted orbits lose to their yearly drift along the orbit (±4° at 30°, ±20° at 60°)
  farsideRoom: [[30, 0.181], [45, 0.245], [60, 0.282], [70, 0.292]],
  farsideIRLat: [[30, 1.0], [60, 1.06], [70, 1.08]],   // sails higher up see Earth less squarely
  // Near-uniform swarm (docs/full-swarm.md): the far-side hardware (mesh fronts, FLOP/J ×0.66) at
  // 0.95 AU, over the whole sky round the Sun except a keep-out cone of acos(0.92) = 23° round the
  // Sun–Earth line, where Earth would see hot backs, and 15° round L3: 94.3 % of the sky, filled to
  // 0.9. Earth sees only infrared-dark fronts: the far side's 0.42 W/m² per 1 % scaled by the
  // integral of cos θ / D² over the region, 0.563 per 1 %.
  uniformR: 0.95, uniformShare: 0.943, uniformRoom: 0.849, uniformIRPerF: 56.3,
  // the same layout at other radii (sails spread ±0.03 AU, cone acos(r − 0.03); at 1 AU a 14°
  // cone keeps them off Earth's doorstep): [r, cone°, sky share, IR W/m² per unit coverage]
  uniformByR: [[0.90, 29.5, 0.918, 53.1], [0.92, 27.1, 0.928, 54.2], [0.95, 23.1, 0.943, 56.3], [0.98, 18.2, 0.958, 59.9], [1.00, 14.0, 0.968, 64.2]],
  // Closed swarm (docs/closed-swarm.md): compute sails tile the whole sphere at 0.95 AU except a cap of
  // acos(0.92) = 23° round the Sun–Earth line, which holds a co-orbiting cap of layered mirrors at
  // ~0.98 AU. Earth sees only the cap's cold back (a sphere's outer surface is visible from 1 AU only
  // within acos r of the Earth direction); the cap redirects its sunlight into the swarm and leaves a
  // window for Earth and the Moon. All the Sun's power leaves through the compute sails' backs.
  closedR: 0.95, capFrac: (1 - Math.cos((23.07 * Math.PI) / 180)) / 2, capR: 0.98,
  // The cap's areal mass is fixed by its orbit: to keep pace with Earth at 0.98 AU sunlight must
  // carry β = 1 − 0.98³ = 0.059 of its weight, 26 g/m² for a mirror. That holds 20 layers of 1.3 g/m²
  // silvered foil: the inner face reflects 99.5 % of sunlight and runs at ~440 K in the swarm's
  // 419 K cavity; ε 0.02 per face leaks 1.1 W/m² out of the back, and Earth, seeing the cap over a
  // disc 76° in radius, averages 0.40 of that (docs/closed-swarm.md).
  capIR: 0.45,             // W/m² on Earth from the cap's back
  capKgM2: 0.026,
  closedRoom: 0.999,       // all but the cap mirrors' absorption and the windows
  keepoutIR: 0.5,          // a keep-out cone of acos(r) (24.5° at 0.91 AU) hides every hot back: IR ×0.5
  rainPerW: 0.0076,        // global rainfall lost per W/m² of sunlight swapped for infrared (small swaps)
  polarPerW: 0.23,         // extra polar heating per W/m² swapped
  horizon: 6000,           // yr simulated
  // Mercury's core: Fe-Ni with ~6 % Si (estimates 1-25 %; Margot et al. 2018), against ~25 % in the
  // rock. A kilogram of spacecraft from the core means lifting ~4x as much, at ~4x the heat left on
  // the planet; it is refined in orbit and the iron kept for shielding and reaction mass.
  coreSi: 0.06, rockSi: 0.25,
};

const interp = (tab, x) => {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) {
    const [x0, y0] = tab[i - 1], [x1, y1] = tab[i];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return tab[tab.length - 1][1];
};
/** Share of the Sun's light the far side can hold, and the IR it sends Earth per unit coverage. */
export const farsideRoom = p => interp(FIXED.farsideRoom, p.farsideLat ?? 30);
export const farsideIRPerF = p => FIXED.farsideIRPerF * interp(FIXED.farsideIRLat, p.farsideLat ?? 30);
/**
 * Computing per watt of sunlight of a sail with the infrared-dark mesh front at rOrbit AU, relative
 * to the same hardware on its thermal orbit. The study's point: at 1 AU the film runs at ~370 K and
 * the chips ~9 K above it, and the sail computes ×0.66 (21 % of the cell current lost to the mesh,
 * hot cells, hot logic). Nearer the Sun the film runs hotter as r^−½, costing cells and logic more.
 */
export function darkFrontFactor(p, rOrbit) {
  const T1 = 370, T = T1 / Math.sqrt(rOrbit), dt = p.filmSpreadDT ?? 9, t0 = FIXED.film.pvT0;
  const logic = energyPenalty(T1 + dt - 273.15, p.hotLogicSlope) / energyPenalty(T + dt - 273.15, p.hotLogicSlope);
  const cells = (1 + p.pvTempCo * (T - t0)) / (1 + p.pvTempCo * (T1 - t0));
  return FIXED.farsideFlopFactor * logic * cells;
}

/**
 * Why 0.95 AU: the near-uniform swarm at other radii, with Mercury's rock spread over film ∝ r²
 * (the rock-limited coverage scales as (0.95 / r)²), capped by the room the layout leaves.
 */
export function orbitChoice(p, E) {
  const k0 = darkFrontFactor(p, FIXED.uniformR);
  return FIXED.uniformByR.map(([r, cone, share, irPerF]) => {
    const k = darkFrontFactor(p, r);
    const room = 0.9 * share;
    const f = Math.min(room, E.rock * (FIXED.uniformR / r) ** 2);
    return { r, cone, chipC: 370 / Math.sqrt(r) + (p.filmSpreadDT ?? 9) - 273.15, perWatt: k / k0, filmPerW: (r / FIXED.uniformR) ** 2,
      room, f, roomBound: f >= room - 1e-9, flops: E.flops * (f / E.cap) * (k / k0), heat: f * irPerF };
  });
}

/**
 * Film temperature of the closed swarm at coverage f (K). Sparse, a glass-fronted sail sheds heat from
 * both faces and reflects its sub-bandgap light away; closed, nothing escapes but through the backs:
 * ε_back σ T⁴ = S / (1 − cap). Between, T⁴ is interpolated in f (a simple model of a cavity whose
 * gaps close).
 */
export function closedFilmT(p, f, r = FIXED.closedR) {
  const S = flux(r);
  const open = (p.alpha * S) / ((p.epsFront + p.epsBack) * SIGMA);
  const shut = S / ((1 - FIXED.capFrac) * p.epsBack * SIGMA);
  return (open + Math.min(1, f) * (shut - open)) ** 0.25;
}

/** Computing per watt of the closed swarm's sails vs the same hardware on its thermal orbit. */
export function closedFactor(p, f, ref) {
  const T = closedFilmT(p, f), dt = p.filmSpreadDT ?? 9, t0 = FIXED.film.pvT0;
  const cells = (1 + p.pvTempCo * (T - t0)) / (1 + p.pvTempCo * (ref.T - t0));
  const logic = energyPenalty(ref.tjC, p.hotLogicSlope) / energyPenalty(T + dt - 273.15, p.hotLogicSlope);
  return cells * logic;
}

/** Coverage on the far side and inside Earth's orbit, for total coverage f. */
export function farsideSplit(p, f) {
  if (p.earthPlacement !== 'farside') return { fFar: 0, fIn: f };
  const fFar = p.spillInside === 'stop' ? f : Math.min(f, farsideRoom(p));
  return { fFar, fIn: Math.max(0, f - fFar) };
}

/** Film optics for the radiosity model (model.js uses alpha, epsFront, epsBack, reflectVis). */
export function filmOptics(p) {
  return { alpha: p.alpha, epsFront: p.epsFront, epsBack: p.epsBack, packing: p.packing,
    laserKgPerW: p.laserKgPerW, reflectVis: p.rhoVis ?? 0.004, ...FIXED.film };
}

export const joulesPerFlop = (p, tjC) => p.jPerFlop85 * p.clockFactor * energyPenalty(tjC, p.hotLogicSlope);

/** Film areal density after thinning (filmThin ≤ 1), and what the thinner silicon costs the cells:
 * 10 µm of light-trapped silicon converts ~5 % less than 30 µm (filmThin 0.52). */
export const filmAreal = p => p.filmAreal * (p.filmThin ?? 1);
export const thinCellFactor = p => 1 - 0.1 * (1 - (p.filmThin ?? 1));

/** One square metre of compute sail at distance r inside a swarm of coverage f. */
export function sailAt(p, rAU, f) {
  const o = filmOptics(p);
  const S = flux(rAU);
  const T = sheetTemp(S, f, o);
  const eta = pvEta(T, { pvEta0: p.pvEta0 * thinCellFactor(p), pvTempCo: p.pvTempCo, pvT0: o.pvT0 }) * o.packing;
  const elecM2 = eta * S;
  const chipWm2 = elecM2 * p.computeShare;
  const feasible = chipWm2 > 0;
  const kgPerW = feasible ? (filmAreal(p) * (1 + p.filmOverbuild)) / chipWm2 + o.laserKgPerW : Infinity;
  const tj = T - 273.15 + p.filmSpreadDT;
  const J = joulesPerFlop(p, tj);
  return {
    rAU, S, T, tjC: tj, eta, elecM2, chipWm2, kgPerW, feasible,
    chipPerWsun: chipWm2 / S,
    chipPitch: feasible ? Math.sqrt(p.chipPower / chipWm2) : Infinity,
    jPerFlop: J,
    flopsPerKg: feasible ? 1 / (kgPerW * J) : 0,
    overLimit: tj > p.tjFilmC + 1e-6,
  };
}

/** Closest orbit where the sail's chiplets just reach their junction limit, for coverage f. */
export function sailThermalRadius(p, f) {
  const Tmax = p.tjFilmC + 273.15 - p.filmSpreadDT;
  return rForFlux(fluxForTemp(Tmax, f, filmOptics(p)));
}

/** One pod per watt of chip power at distance r, inside a swarm of coverage f whose sails run at tSail. */
export function podAt(p, rAU, f, tSail) {
  const S = flux(rAU);
  const wing = pvState(S, f, { ...FIXED.wing, pvEta0: p.pvEta0, pvTempCo: p.pvTempCo });
  const chipWm2 = wing.elecM2 * FIXED.podComputeShare;
  const tRad = p.podRadC + 273.15;
  const q = radiatorFlux(tRad, f, tSail, FIXED.rad);
  const kgPerW = {
    wing: chipWm2 > 0 ? p.wingAreal / chipWm2 : Infinity,
    radiator: q > 0 ? p.radAreal / q : Infinity,
    fixed: p.podKgPerKW / 1e3,
  };
  const total = kgPerW.wing + kgPerW.radiator + kgPerW.fixed;
  const J = joulesPerFlop(p, p.tjPodC);
  return {
    rAU, S, wing, chipWm2, tRad, qRad: q, kgPerWItems: kgPerW, kgPerW: total,
    chipPerWsun: chipWm2 / S,
    wingAreaPerW: chipWm2 > 0 ? 1 / chipWm2 : Infinity,
    radAreaPerW: q > 0 ? 1 / q : Infinity,
    jPerFlop: J,
    flopsPerKg: Number.isFinite(total) ? 1 / (total * J) : 0,
    feasible: Number.isFinite(total),
  };
}

/** Physics of a finished swarm of sails on their thermal orbits at coverage f (no build-out). */
function swarmCore(p, fIn) {
  const f = Math.min(1, Math.max(1e-20, fIn));
  const rThermal = sailThermalRadius(p, f);
  const rSail = p.placement === 'manual' ? p.rManual : rThermal;
  const sail = sailAt(p, rSail, f);
  // Pods never sit inside the sail shell: there their radiators would face its warm inner wall.
  const rPod = Math.max(p.rPod, rSail);
  const pod = podAt(p, rPod, f, sail.T);
  // Whatever cannot work is given no power: a dead sail sends all chip power to pods and vice versa.
  let q = Math.min(1, Math.max(0, p.podFrac));
  if (!sail.feasible) q = 1;
  if (!pod.feasible) q = 0;
  const feasible = (q < 1 ? sail.feasible : true) && (q > 0 ? pod.feasible : true);
  const intercepted = f * L_SUN;
  const perWsun = (q < 1 ? (1 - q) / sail.chipPerWsun : 0) + (q > 0 ? q / pod.chipPerWsun : 0);
  const chipPower = feasible && perWsun > 0 ? intercepted / perWsun : 0;
  const sailPower = (1 - q) * chipPower;
  const podPower = q * chipPower;
  const massSails = sailPower > 0 ? sailPower * sail.kgPerW : 0;
  const massPods = podPower > 0 ? podPower * pod.kgPerW : 0;
  const flopsSails = sailPower > 0 ? sailPower / sail.jPerFlop : 0;
  const flopsPods = podPower > 0 ? podPower / pod.jPerFlop : 0;
  return {
    f, q, feasible, rThermal, rSail, rPod, sail, pod,
    intercepted, chipPower, sailPower, podPower, massSails, massPods, mass: massSails + massPods,
    filmArea: sail.chipWm2 > 0 ? sailPower / sail.chipWm2 : 0,
    flopsSails, flopsPods, flops: flopsSails + flopsPods,
  };
}

/**
 * A finished swarm at coverage f in its placement. Shell: every sail on its thermal orbit inside
 * Earth's orbit. Far side: the same hardware on Earth's orbit at 1 AU, where sunlight is weaker, so
 * each watt intercepted takes (1 AU / r)² more film, and infrared-dark fronts run the chips hotter
 * (FLOP/J ×0.66); once the far side is full, the rest fly inside Earth's orbit (fIn).
 */
export function swarmAt(p, fIn) {
  const f = Math.min(1, Math.max(1e-20, fIn));
  if (p.earthPlacement === 'closed') {
    // the sparse swarm's hardware, moved to 0.95 AU; the film per watt falls as the cap's light is
    // redirected onto it, and the swarm runs hotter as it closes
    const fr = Math.min(f, 0.01), k = f / fr;
    const a = swarmCore(p, fr);
    const r = FIXED.closedR;
    const kM = (r / a.rSail) ** 2 * (1 - FIXED.capFrac * f);
    const kF = closedFactor(p, f, a.sail);
    const cap = f * FIXED.capFrac * 4 * Math.PI * (FIXED.capR * AU) ** 2 * FIXED.capKgM2;
    const chipPower = a.chipPower * k, massSails = a.massSails * k * kM + cap, massPods = a.massPods * k * kM;
    return {
      ...a, f, farside: false, closed: true, rOrbit: r, areaFactor: kM, fFar: 0, fIn: 0, filmT: closedFilmT(p, f),
      intercepted: f * L_SUN, chipPower, sailPower: a.sailPower * k, podPower: a.podPower * k,
      massSails, massPods, mass: massSails + massPods, kgPerW: chipPower > 0 ? (massSails + massPods) / chipPower : Infinity,
      filmArea: a.filmArea * k * kM,
      flopsSails: a.flopsSails * k * kF, flopsPods: a.flopsPods * k * kF, flops: (a.flopsSails + a.flopsPods) * k * kF,
    };
  }
  if (p.earthPlacement === 'uniform') {
    // infrared-dark fronts all but remove the cavity effect (a front absorbs ~1.5 % more from the
    // swarm's inner wall than from the Sun alone), so every sail carries a sparse swarm's hardware
    const fr = Math.min(f, 0.01), k = f / fr;
    const a = swarmCore(p, fr);
    const rOrbit = Math.max(FIXED.uniformR, a.rSail);
    const kM = (rOrbit / a.rSail) ** 2, kF = darkFrontFactor(p, rOrbit);
    const chipPower = a.chipPower * k, massSails = a.massSails * k * kM, massPods = a.massPods * k * kM;
    return {
      ...a, f, farside: false, uniform: true, rOrbit, areaFactor: kM, fFar: 0, fIn: 0,
      intercepted: f * L_SUN, chipPower, sailPower: a.sailPower * k, podPower: a.podPower * k,
      massSails, massPods, mass: massSails + massPods, kgPerW: chipPower > 0 ? (massSails + massPods) / chipPower : Infinity,
      filmArea: a.filmArea * k * kM,
      flopsSails: a.flopsSails * k * kF, flopsPods: a.flopsPods * k * kF, flops: (a.flopsSails + a.flopsPods) * k * kF,
    };
  }
  if (p.earthPlacement !== 'farside') {
    const s = swarmCore(p, f);
    return { ...s, farside: false, rOrbit: s.rSail, areaFactor: 1, fFar: 0, fIn: f, kgPerW: s.chipPower > 0 ? s.mass / s.chipPower : Infinity };
  }
  const split = farsideSplit(p, f);
  const a = swarmCore(p, Math.max(1e-20, split.fFar));
  const kM = Math.max(1, 1 / a.rSail ** 2), kF = FIXED.farsideFlopFactor;
  const b = split.fIn > 1e-12 ? swarmCore(p, split.fIn) : null;
  const add = k => (b ? b[k] : 0);
  const massSails = a.massSails * kM + add('massSails');
  const massPods = a.massPods * kM + add('massPods');
  const chipPower = a.chipPower + add('chipPower');
  const mass = massSails + massPods;
  const flopsSails = a.flopsSails * kF + add('flopsSails');
  const flopsPods = a.flopsPods * kF + add('flopsPods');
  return {
    ...a, f, farside: true, rOrbit: 1, areaFactor: kM, fFar: split.fFar, fIn: split.fIn, rIn: b ? b.rSail : null,
    intercepted: f * L_SUN, chipPower, sailPower: a.sailPower + add('sailPower'), podPower: a.podPower + add('podPower'),
    massSails, massPods, mass, kgPerW: chipPower > 0 ? mass / chipPower : Infinity,
    filmArea: a.filmArea * kM + add('filmArea'),
    flopsSails, flopsPods, flops: flopsSails + flopsPods,
  };
}

/** Coverage whose finished swarm weighs `mass` kg (inverse of swarmAt(p, f).mass; f ≤ 1). */
export function coverageForMass(p, mass) {
  if (!(mass > 0)) return 0;
  if (swarmAt(p, 1).mass <= mass) return 1;
  let lo = -20, hi = 0;
  for (let i = 0; i < 56; i++) {
    const mid = (lo + hi) / 2;
    if (swarmAt(p, 10 ** mid).mass < mass) lo = mid; else hi = mid;
  }
  return 10 ** ((lo + hi) / 2);
}

/**
 * Year-by-year build-out. Gross production G = export from Mercury + recycled mass. The standing
 * fleet is everything produced in the last L years; what retires is recycled at fraction ρ.
 * Export capacity grows as seed · k · 2^(t/T_d') until Mercury's heat cap; it is also limited by
 * the remaining rock and by the target mass (after which industry only replaces what retires).
 * Fab tools are part of the industry: they slow the doubling (T_d' = T_d + ln2 · I · a) and, after
 * the wall, a share I · a / toolLife of the export goes to replacing them.
 */
export function simulateBuild(p, targetMass, rateCap, chipAreaPerKg) {
  const fabYears = Math.LN2 * (p.fabToolIntensity || 0) * chipAreaPerKg;
  const Td = p.doublingYears + fabYears;
  const k = Math.LN2 / Td;                                          // 1/yr
  const L = p.serviceLife > 0 ? p.serviceLife : Infinity;
  const rho = Math.min(0.999, Math.max(0, p.recycleFrac || 0));
  const capYr = rateCap * YEAR;                                     // kg/yr delivered
  const toolShare = (p.fabToolIntensity || 0) * chipAreaPerKg / FIXED.toolLife;
  const capToSails = capYr / (1 + toolShare);
  const rockMantle = MERCURY.M_SHELL * p.yieldDelivered;            // kg deliverable from crust + mantle
  const coreHeat = FIXED.rockSi / FIXED.coreSi;
  const rockCore = p.rockSource === 'whole' ? MERCURY.M_CORE * p.yieldDelivered / coreHeat : 0;
  const rock = rockMantle + rockCore;
  const tWall = Math.max(0, Td * Math.log2(capToSails / (p.seedMass * k)));
  // export capacity integrated over [t0, t1], exact for the exponential part
  const capInt = (t0, t1) => {
    const e = (a, b) => p.seedMass * (2 ** (b / Td) - 2 ** (a / Td));
    if (t1 <= tWall) return e(t0, t1);
    if (t0 >= tWall) return capToSails * (t1 - t0);
    return e(t0, tWall) + capToSails * (t1 - tWall);
  };
  // the seed is the first factory on Mercury, not spacecraft: the fleet starts empty
  const t = [0], Gc = [0], Dc = [0];                                 // cumulative gross, cumulative delivered
  const B = [0], R = [0];
  const GcAt = time => {                                            // cumulative gross at an earlier time
    if (time < 0) return 0;
    let lo = 0, hi = t.length - 1;
    if (time >= t[hi]) return Gc[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= time) lo = m; else hi = m; }
    const w = (time - t[lo]) / Math.max(1e-12, t[hi] - t[lo]);
    return Gc[lo] + (Gc[hi] - Gc[lo]) * w;
  };
  const settle = tWall + 3 * (Number.isFinite(L) ? L / Math.max(1e-3, 1 - rho) : 0);
  let tt = 0, quiet = 0;
  while (tt < FIXED.horizon) {
    const dt = tt < tWall + 20 ? Math.min(0.05, Td / 40) : 0.5;
    const t1 = tt + dt;
    const retired = Number.isFinite(L) ? Math.max(0, GcAt(t1 - L) - GcAt(tt - L)) : 0;
    const fleet = B[B.length - 1];
    // the mantle first; the core's silicon at the same heat delivers 1 / coreHeat as much
    const avail = capInt(tt, t1), done = Dc[Dc.length - 1];
    const fromMantle = Math.min(avail, Math.max(0, rockMantle - done));
    let exp = fromMantle + Math.min((avail - fromMantle) / coreHeat, Math.max(0, rock - done - fromMantle));
    let gross = exp + rho * retired;
    if (fleet + gross - retired > targetMass) {
      // at the target: produce only what holds the fleet there, recycling first
      gross = Math.max(0, targetMass - fleet + retired);
      exp = Math.max(0, gross - rho * retired);
    }
    t.push(t1); Gc.push(Gc[Gc.length - 1] + gross); Dc.push(Dc[Dc.length - 1] + exp);
    B.push(Math.max(0, fleet + gross - retired)); R.push(retired / dt);
    tt = t1;
    const b0 = B[B.length - 2], b1 = B[B.length - 1];
    if (tt > settle && Math.abs(b1 - b0) <= 1e-7 * Math.max(b1, 1) * dt) {
      if (++quiet > 200) break;
    } else quiet = 0;
  }
  const idx = time => {
    let lo = 0, hi = t.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= time) lo = m; else hi = m; }
    return [lo, hi, (time - t[lo]) / (t[hi] - t[lo])];
  };
  const interp = (arr, time) => {
    if (time <= 0) return arr[0];
    if (time >= t[t.length - 1]) return arr[arr.length - 1];
    const [lo, hi, w] = idx(time);
    return arr[lo] + (arr[hi] - arr[lo]) * w;
  };
  let peak = 0, tPeak = 0;
  for (let i = 0; i < B.length; i++) if (B[i] > peak) { peak = B[i]; tPeak = t[i]; }
  const yearsForMass = m => {
    if (m <= B[0]) return 0;
    for (let i = 1; i < B.length; i++) if (B[i] >= m) {
      return t[i - 1] + (t[i] - t[i - 1]) * (m - B[i - 1]) / Math.max(1e-30, B[i] - B[i - 1]);
    }
    return Infinity;
  };
  const iRock = Dc.findIndex(x => x >= rock * (1 - 1e-9));
  const iMantle = rockCore > 0 ? Dc.findIndex(x => x >= rockMantle * (1 - 1e-9)) : iRock;
  return {
    doublingYearsEff: Td, fabPenaltyYears: fabYears, tCap: tWall, rateCap, capToSails: capToSails / YEAR,
    serviceLife: L, recycleFrac: rho, refresh: Number.isFinite(L),
    steadyMass: Number.isFinite(L) ? capToSails * L / (1 - rho) : Infinity,
    peakMass: peak, tPeak, rockDeliverable: rock, rockMantle, rockCore, tRockOut: iRock >= 0 ? t[iRock] : null,
    tMantleOut: iMantle >= 0 ? t[iMantle] : null,
    reachedTarget: peak >= targetMass * (1 - 1e-6),
    yearsForMass,
    yearsToEnd: yearsForMass(0.95 * peak),
    endYear: t[t.length - 1],
    builtAtYear: time => interp(B, time),
    deliveredBy: time => interp(Dc, time),
    retiringAt: time => interp(R, time) / YEAR,
    samples: { t, B, Dc },
  };
}

/** Kilograms of Mercury dug for `mass` kg of spacecraft: the rock first, then the core. */
export function minedFor(p, mass) {
  const fromRock = MERCURY.M_SHELL * p.yieldDelivered;
  if (mass <= fromRock || p.rockSource !== 'whole') return mass / p.yieldDelivered;
  return MERCURY.M_SHELL + ((mass - fromRock) / p.yieldDelivered) * (FIXED.rockSi / FIXED.coreSi);
}

/** The whole swarm for parameters p: the finished target, and the build-out toward it. */
export function compute(p) {
  const s = swarmAt(p, p.coverage);
  const { f, q, rSail, rPod, sail, pod, intercepted, chipPower, sailPower, podPower, mass } = s;
  const o = filmOptics(p);
  const sailAreaTotal = s.filmArea;
  const wingAreaTotal = pod.chipWm2 > 0 ? podPower / pod.chipWm2 : 0;
  const radAreaTotal = podPower > 0 ? podPower * pod.radAreaPerW : 0;

  // Logistics. Mass-driver launch from Mercury's perihelion onto the transfer orbit; each spacecraft
  // circularises with its own ion engine on oxygen from the same rock.
  const minedPerDelivered = 1 / p.yieldDelivered;
  const minedRateCap = p.mercuryHeatLimit / (p.heatPerKg * 1e6);
  const deliveredRateCap = minedRateCap / minedPerDelivered;

  // The industry's constants (die area per kg, which sets the fab penalty; the launch orbit) belong
  // to the swarm actually built, not to the target, which may be far beyond reach (a closed shell
  // at 1.35 AU is twice as heavy per watt as the swarm at 0.86 AU). Iterate on the reachable
  // coverage.
  let fBuild = Math.min(f, 0.01), sB, growth, chipAreaPerKg = 0, dieM2PerW = 0;
  for (let i = 0; i < 6; i++) {
    sB = swarmAt(p, fBuild);
    dieM2PerW = ((1 - sB.q) * p.dieMm2PerW + sB.q * FIXED.podDieMm2PerW) * 1e-6;
    chipAreaPerKg = Number.isFinite(sB.kgPerW) && sB.kgPerW > 0 ? dieM2PerW / sB.kgPerW : 0;
    growth = simulateBuild(p, mass, deliveredRateCap, chipAreaPerKg);
    const fNew = Math.max(1e-9, coverageForMass(p, Math.min(mass, growth.peakMass)));
    const done = Math.abs(Math.log(fNew / fBuild)) < 0.01;
    fBuild = fNew;
    if (done) break;
  }
  const kgPerW = sB.kgPerW;
  const lnSail = launchFromMercury(sB.rOrbit, true);
  const lnPod = launchFromMercury(sB.rPod, true);
  const reachableMass = Math.min(mass, growth.peakMass);
  const reachableCoverage = coverageForMass(p, reachableMass);
  const yearsToCoverage = fc => growth.yearsForMass(swarmAt(p, fc).mass);

  const energyJ = p.energyPerKg * 1e6;
  const industry = {
    chipAreaPerKg,
    dieAreaPerW: dieM2PerW,
    doublingYearsEff: growth.doublingYearsEff,
    processingPowerAtWall: deliveredRateCap * energyJ,
    energyPaybackDays: Number.isFinite(kgPerW) ? (energyJ * kgPerW) / 86400 : Infinity,
    fabStockPerFleet: (p.fabToolIntensity || 0) * chipAreaPerKg / FIXED.toolLife,
  };
  const earth = earthImpact(o, rSail, f, sail.T, sail.S);

  return {
    ...s,
    sailAreaTotal, wingAreaTotal, radAreaTotal,
    nSails: sailAreaTotal / p.sailArea,
    nPods: podPower / p.podPower,
    chipletsTotal: sailPower / p.chipPower,
    sunlightUse: intercepted > 0 ? chipPower / intercepted : 0,
    flopsPerWsun: intercepted > 0 ? s.flops / intercepted : 0,
    massMined: minedFor(p, mass), minedPerDelivered,
    fracMercury: minedFor(p, mass) / MERCURY.M,
    fracRock: Math.min(1, minedFor(p, mass) / MERCURY.M_SHELL),
    logistics: { sail: lnSail, pod: lnPod, deliveredRateCap, minedRateCap },
    growth, reachableMass, reachableCoverage, yearsToCoverage, buildCoverage: fBuild,
    industry,
    earth,
    earthSafeCoverage: earthSafeCoverage(p, 1.0),
    lightAcross: (2 * rSail * AU) / C,
    // Thermodynamic floor: a nearly closed swarm sheds everything through its outer face.
    rFloorClosed: Math.sqrt(L_SUN / (4 * Math.PI * o.epsBack * SIGMA * (p.tjFilmC + 273.15 - p.filmSpreadDT) ** 4)) / AU,
  };
}

/**
 * Largest coverage whose swarm adds at most `limit` W/m² to Earth's absorbed energy, for sails on
 * their thermal orbits in a uniform shell (earthImpact). Placement can change this (research6).
 */
export function earthSafeCoverage(p, limit = 1.0) {
  const forcing = f => {
    const s = swarmAt(p, f);
    return earthImpact(filmOptics(p), s.rSail, f, s.sail.T, s.sail.S).forcing;
  };
  if (forcing(1e-6) > limit) return 0;
  let lo = -6, hi = 0;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (forcing(10 ** mid) <= limit) lo = mid; else hi = mid;
  }
  return 10 ** lo;
}

/**
 * Illuminance on level ground from a sky disc of unit luminance and angular radius R (rad) whose
 * centre sits `depressionDeg` below the horizon: ∫ sin(altitude) dΩ over the part above the
 * horizon. No extinction, as in the Earth study (scattered light still reaches the ground).
 */
export function discGroundFactor(R, depressionDeg = FIXED.skyDepression) {
  const d = (depressionDeg * Math.PI) / 180;
  const cx = Math.cos(d), cz = -Math.sin(d), cosR = Math.cos(R);
  const nA = 90, nZ = 180, dA = Math.PI / 2 / nA, dZ = Math.PI / nZ;
  let sum = 0;
  for (let i = 0; i < nA; i++) {
    const a = (i + 0.5) * dA, ca = Math.cos(a), sa = Math.sin(a);
    // azimuth measured from the Sun's; the disc is symmetric, so integrate one side and double
    for (let j = 0; j < nZ; j++) {
      const z = (j + 0.5) * dZ;
      if (cx * ca * Math.cos(z) + cz * sa > cosR) sum += sa * ca;
    }
  }
  return 2 * sum * dA * dZ;
}

/**
 * Ground illuminance (lux) from the swarm's glow once the Sun is 18° down.
 * Shell: through the near layer's gaps (1 − f) Earth sees the sunlit fronts of the far layer
 * (f, radiosity ρS / (1 − fρ)): a uniform disc out to asin(r) from the Sun.
 * Far-side cloud: the study's 0.31 lux per 1 % at ρ 0.003 (a cone along the ecliptic).
 */
export function skyLux(p, f) {
  if (!(f > 0)) return 0;
  const shellLux = fs => {
    if (!(fs > 0)) return 0;
    const s = swarmCore(p, fs);
    const L = ((1 - fs) * fs * p.rhoVis * s.sail.S) / Math.PI / (1 - fs * p.rhoVis) * FIXED.lumensPerW;
    return L * discGroundFactor(Math.asin(Math.min(0.9999, s.rSail)));
  };
  // outside a keep-out cone of acos(r) Earth sees none of the inner sails' near layer: only the far
  // hemisphere's fronts, which stand in front of the far-side band
  const coneLux = fs => {
    if (!(fs > 0)) return 0;
    const s = swarmCore(p, fs);
    return (fs * p.rhoVis * s.sail.S) / Math.PI / (1 - fs * p.rhoVis) * FIXED.lumensPerW
      * discGroundFactor(Math.asin(Math.min(0.9999, s.rSail)));
  };
  if (p.earthPlacement === 'shell') return shellLux(f);
  if (p.earthPlacement === 'closed') return 0;                 // Earth sees only the cap's dark back
  if (p.earthPlacement === 'uniform') {
    // a disc of sunlit fronts out to asin(0.95) = 72° round the Sun, at the local fill f / share
    const r = FIXED.uniformR, fl = Math.min(0.999, f / FIXED.uniformShare);
    return (fl * p.rhoVis * flux(r)) / Math.PI / (1 - fl * p.rhoVis) * FIXED.lumensPerW * discGroundFactor(Math.asin(r));
  }
  if (p.earthPlacement === 'cone') return coneLux(f);
  const { fFar, fIn } = farsideSplit(p, f);
  return FIXED.skyLuxPerFRho * p.rhoVis * fFar * (1 - fIn) + coneLux(fIn);
}

/**
 * Extra heat Earth absorbs at coverage f (W/m², global mean), before and after the L1 shade.
 * Shell: its infrared minus the sunlight its own sails block (earthImpact). Cone: the same sails
 * outside a keep-out cone, half the infrared and no shadow. Far side: the cloud's
 * infrared through its dark fronts; any sails inside Earth's orbit fly outside a keep-out cone, so
 * they block no sunlight and send half the infrared. The shade cancels whatever exceeds what Earth
 * accepts, up to p.shadeLimit. Every W/m² of sunlight traded for infrared, by the shade or by the
 * sails' own shadow, costs rainfall (FIXED.rainPerW) and warms the poles (FIXED.polarPerW).
 */
export function earthForcing(p, f) {
  let gross = 0, blocked = 0;
  if (p.earthPlacement === 'shell') {
    const s = swarmCore(p, f);
    const e = earthImpact(filmOptics(p), s.rSail, f, s.sail.T, s.sail.S);
    gross = e.forcing;
    blocked = e.dimming * EARTH.absorbedSolar;
  } else if (p.earthPlacement === 'closed') {
    gross = f * FIXED.capIR;                                    // the cap grows with the swarm it hides
  } else if (p.earthPlacement === 'uniform') {
    gross = f * FIXED.uniformIRPerF;
  } else if (p.earthPlacement === 'cone') {
    const s = swarmCore(p, f);
    gross = FIXED.keepoutIR * earthImpact(filmOptics(p), s.rSail, f, s.sail.T, s.sail.S).irForcing;
  } else {
    const { fFar, fIn } = farsideSplit(p, f);
    gross = fFar * farsideIRPerF(p);
    if (fIn > 0) {
      const s = swarmCore(p, fIn);
      gross += FIXED.keepoutIR * earthImpact(filmOptics(p), s.rSail, fIn, s.sail.T, s.sail.S).irForcing;
    }
  }
  // the shade can block no more sunlight than still reaches Earth
  const shade = Math.min(Math.max(0, gross - p.forcingLimit), p.shadeLimit ?? 0, Math.max(0, EARTH.absorbedSolar - blocked));
  const swapped = blocked + shade;
  // rain falls ~0.76 % per W/m² swapped for small swaps; it cannot fall below zero, so the loss saturates
  return { gross, shade, net: gross - shade, swapped, sunlightCut: swapped / EARTH.absorbedSolar,
    rainCut: 1 - Math.exp(-FIXED.rainPerW * swapped), polar: FIXED.polarPerW * swapped };
}

/** Most of the Sun's light the layout has room for. */
export function roomOf(p) {
  if (p.earthPlacement === 'closed') return FIXED.closedRoom;
  if (p.earthPlacement === 'uniform') return FIXED.uniformRoom;
  if (p.earthPlacement === 'farside' && p.spillInside === 'stop') return farsideRoom(p);
  return 1;
}

/** Largest coverage whose net extra heat on Earth stays within p.forcingLimit (net rises with f). */
function earthCapOf(p) {
  const ok = f => earthForcing(p, f).net <= p.forcingLimit + 1e-9;
  let cap;
  if (ok(1)) cap = 1;
  else if (!ok(1e-8)) cap = 0;
  else {
    let lo = -8, hi = 0;
    for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (ok(10 ** mid)) lo = mid; else hi = mid; }
    cap = 10 ** lo;
  }
  return Math.min(cap, roomOf(p));
}

/**
 * How big the swarm gets: what Earth's climate allows (with the shade), the room on the far side if
 * the swarm stops there, and, given the build-out d, what Mercury's industry can reach. The night
 * sky is reported, not limited.
 */
export function earthLimits(p, d = null) {
  const earth = earthCapOf(p);
  const rock = d ? d.reachableCoverage : 1;
  const cap = Math.min(earth, rock);
  const room = roomOf(p);
  const binding = rock < earth ? 'rock' : earth >= room - 1e-9 ? 'room' : 'climate';
  const s = swarmAt(p, cap);
  return { cap, earthCap: earth, rock, binding, room,
    shell: earthCapOf({ ...p, placement: 'thermal', earthPlacement: 'shell' }),
    flops: s.flops, mass: s.mass, nSails: s.filmArea / p.sailArea, fFar: s.fFar, fIn: s.fIn,
    forcing: earthForcing(p, cap), skyLuxAtCap: skyLux(p, cap) };
}

/** Satellite mass standing in the swarm by a given year after the first launch. */
export function builtAt(p, d, year) {
  return d.growth.builtAtYear(year);
}

/** State of the build-out at a given year: coverage and orbit follow the mass actually standing. */
export function atYear(p, d, year) {
  const g = d.growth;
  const built = builtAt(p, d, year);
  const f = coverageForMass(p, built);
  const s = swarmAt(p, f);
  const mined = minedFor(p, g.deliveredBy(year));
  const dt = 0.25;
  const exportRate = Math.max(0, (g.deliveredBy(year + dt) - g.deliveredBy(year)) / (dt * YEAR));
  const retireRate = g.retiringAt(year);
  const gross = exportRate + g.recycleFrac * retireRate;
  return {
    year, calendarYear: p.seedYear + year, built, frac: d.mass > 0 ? built / d.mass : 0, f,
    rSail: s.rSail,
    nSails: f > 0 ? s.filmArea / p.sailArea : 0,
    nPods: f > 0 ? s.podPower / p.podPower : 0,
    chipPower: f > 0 ? s.chipPower : 0,
    flops: f > 0 ? s.flops : 0,
    tSail: s.closed ? s.filmT : s.sail.T,
    mercuryRemoved: mined / MERCURY.M,
    mercuryRadius: mercuryRadius(mined),
    mercurySurface: mercurySurfaceLayer(mined),
    exportRate,
    retireRate,
    replacementShare: gross > 0 ? Math.min(1, retireRate / gross) : 0,
    processingPower: gross * p.energyPerKg * 1e6,
    heatOnMercury: ((minedFor(p, g.deliveredBy(year + dt)) - mined) / (dt * YEAR)) * p.heatPerKg * 1e6,
    heatLimited: year > g.tCap && exportRate > 0.98 * g.capToSails,
    earth: earthImpact(filmOptics(p), s.rSail, f, s.sail.T, s.sail.S),
    forcing: earthForcing(p, f),
  };
}

// ---------------------------------------------------------------------------
// Technology eras (docs/future-tech.md). 'mid' is what the bulk of the swarm is built with
// (2100+ hardware): the slider defaults. 'low' and 'high' are coherent pessimistic and optimistic
// bundles, not joint percentiles. '2026' is today's hardware, for comparison.
// ---------------------------------------------------------------------------
export const ERAS = {
  '2026': {
    label: '2026 hardware',
    params: {
      jPerFlop85: 1.3e-13, hotLogicSlope: null, filmSpreadDT: 10,
      pvEta0: 0.20, pvTempCo: -0.0042, alpha: 0.9, epsFront: 0.85, epsBack: 0.90, packing: 0.9,
      filmAreal: 0.172, filmThin: 1, laserKgPerW: 2e-5,
      podFrac: 0.15, wingAreal: 0.15, podKgPerKW: 2.1,
      yieldDelivered: 0.5, fabToolIntensity: 250, dieMm2PerW: 40, serviceLife: 10, recycleFrac: 0.9,
    },
  },
  low: {
    label: 'Mature, pessimistic',
    params: {
      jPerFlop85: 3.25e-14 / 0.6, hotLogicSlope: 0.006, pvEta0: 0.20, alpha: 0.85, packing: 0.9,
      filmAreal: 0.205, laserKgPerW: 1.7e-5, podFrac: 0.15, wingAreal: 0.125, podKgPerKW: 1.2,
      yieldDelivered: 0.38, fabToolIntensity: 120, dieMm2PerW: 40, serviceLife: 50, recycleFrac: 0.95,
      energyPerKg: 2500,
    },
  },
  mid: { label: 'Mature, central', params: {} },
  high: {
    label: 'Mature, optimistic',
    params: {
      jPerFlop85: 1.25e-16 / 0.6, pvEta0: 0.25, pvTempCo: -0.00256, alpha: 0.78, epsBack: 0.93, packing: 0.93,
      filmAreal: 0.17, laserKgPerW: 3.7e-6, podFrac: 0.011, wingAreal: 0.12, podKgPerKW: 1.0,
      yieldDelivered: 0.5, fabToolIntensity: 5, dieMm2PerW: 21.6, serviceLife: 1000, recycleFrac: 0.995,
      energyPerKg: 850,
    },
  },
};

/** Full parameter set for an era key ('2026', 'low', 'mid', 'high') on top of the defaults. */
export function eraParams(key, base = defaults()) {
  const e = ERAS[key];
  if (!e) throw new Error(`unknown era ${key}`);
  return { ...base, ...e.params };
}

// Writes render/numbers.json: the model numbers the Blender scenes need, per technology era,
// so every render is driven by src/model/hybrid.js. Run: node scripts/export-numbers.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as h from '../src/model/hybrid.js';

const out = {};
for (const era of ['2026', 'low', 'mid', 'high']) {
  const p = h.eraParams(era);
  const d = h.compute({ ...p, coverage: 1 });
  const at = f => {
    const s = h.swarmAt(p, f);
    return {
      coverage: f,
      r_AU: s.rSail,
      S_W_m2: s.sail.S,
      film_K: s.sail.T,
      chip_K: s.sail.T + p.filmSpreadDT,
      chip_pitch_m: s.sail.chipPitch,
      chip_W_m2: s.sail.chipWm2,
      sail_MW: (s.sail.chipWm2 * p.sailArea) / 1e6,
      chiplets_per_sail: (s.sail.chipWm2 * p.sailArea) / p.chipPower,
      sail_flops: (s.sail.chipWm2 * p.sailArea) / s.sail.jPerFlop,
      pod_r_AU: s.rPod,
      pod_rad_K: s.pod.tRad,
      pod_share: s.q,
    };
  };
  out[era] = {
    label: h.ERAS[era].label,
    sparse: at(0.01),
    ceiling: at(d.reachableCoverage),
    ceiling_coverage: d.reachableCoverage,
    earth_safe_coverage: d.earthSafeCoverage,
    alpha: p.alpha, eps_front: p.epsFront, eps_back: p.epsBack,
    terminals: era === '2026' ? 'per_patch' : 'consolidated',
  };
}
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'render', 'numbers.json');
writeFileSync(file, JSON.stringify(out, null, 1));
console.log('wrote', file);

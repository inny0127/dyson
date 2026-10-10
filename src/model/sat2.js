// Satellite v2: sun-facing PV wings + one concentrated compute module + knife-edge radiators.
// Pure functions; parameters come from the first-principles design pass.
import { PHYS } from './constants.js';

const { SIGMA } = PHYS;

/** c-Si efficiency at cell temperature T (AM0), never below zero. */
export function pvEta(T, p) {
  return Math.max(0, p.pvEta0 * (1 + p.pvTempCo * (T - p.pvT0)));
}

/**
 * Sun-facing PV wing in a swarm of sky coverage f. It absorbs alpha_eff·S, exports eta(T)·S as
 * electricity to the compute module, and radiates the rest from both faces; its front face sees the
 * swarm interior with probability g ≈ f (radiosity as in the film model). Solved by fixed point.
 * Returns cell temperature, efficiency and electric output per m² of wing (packing factor included).
 */
export function pvState(S, f, p) {
  const g = Math.min(1, Math.max(0, f));
  const alphaEff = p.pvAlpha / (1 - (1 - p.pvAlpha) * g);
  const k = p.pvEpsBack + (p.pvEpsFront * (1 - g)) / (1 - g * (1 - p.pvEpsFront));
  let T = 350;
  for (let i = 0; i < 60; i++) {
    const eta = pvEta(T, p) * p.pvPacking;
    const Tn = (Math.max(1e-9, alphaEff - eta) * S / (SIGMA * k)) ** 0.25;
    if (Math.abs(Tn - T) < 1e-6) { T = Tn; break; }
    T = 0.5 * (T + Tn);
  }
  const eta = pvEta(T, p) * p.pvPacking;
  return { T, eta, elecM2: eta * S };
}

/**
 * Net heat rejected per m² of planform by a double-sided knife-edge radiator blade at T_rad.
 * Half of each face's sky lies inside the swarm shell; with coverage f that half sees sun-facing
 * panel fronts at T_int (≈ PV temperature). As f → 1 the inward half stops rejecting heat.
 */
export function radiatorFlux(Trad, f, Tint, p) {
  const eps = p.radEps;
  const out = 2 * eps * SIGMA * Trad ** 4;
  const back = 2 * eps * SIGMA * 0.5 * Math.min(1, f) * Tint ** 4;
  return Math.max(0, (out - back) * p.radFinEff);
}

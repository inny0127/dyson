// Number formatting for the ledger. Physics spans 40+ orders of magnitude,
// so everything prints as either a plain number or a ×10ⁿ form.

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

export function sup(n) {
  return String(n).split('').map(ch => SUP[ch] ?? ch).join('');
}

/** 3.2e17 -> "3.2×10¹⁷"; 1234 -> "1,234"; 0.0123 -> "0.0123" */
export function sci(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e-2 && ax < 1e5) {
    const decimals = ax >= 100 ? 0 : ax >= 10 ? Math.max(0, digits - 1) : digits;
    return x.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
  }
  let exp = Math.floor(Math.log10(ax));
  let mant = x / 10 ** exp;
  // rounding can push 9.99 -> 10.0
  if (Math.abs(Number(mant.toFixed(digits - 1))) >= 10) { mant /= 10; exp += 1; }
  const m = mant.toFixed(Math.max(0, digits - 1)).replace(/\.0+$/, '');
  return `${m}×10${sup(exp)}`;
}

/** Order-of-magnitude only: 3.2e17 -> "~10¹⁷" */
export function oom(x) {
  if (!Number.isFinite(x) || x <= 0) return '—';
  return `~10${sup(Math.round(Math.log10(x)))}`;
}

export function pct(frac, digits = 1) {
  if (!Number.isFinite(frac)) return '—';
  const p = frac * 100;
  if (p !== 0 && Math.abs(p) < 1e-3) return `${sci(p, 2)}%`;
  if (p !== 0 && Math.abs(p) < 1) return `${Number(p.toPrecision(2))}%`;
  return `${p.toFixed(p >= 10 ? Math.max(0, digits - 1) : digits)}%`;
}

export function kelvin(T) {
  return `${Math.round(T)} K (${Math.round(T - 273.15)} °C)`;
}

/** Seconds -> human duration */
export function duration(s) {
  const a = Math.abs(s);
  if (a < 120) return `${a.toFixed(0)} s`;
  if (a < 7200) return `${(a / 60).toFixed(1)} min`;
  if (a < 172800) return `${(a / 3600).toFixed(1)} h`;
  if (a < 3.15576e7 * 2) return `${(a / 86400).toFixed(0)} days`;
  return `${(a / 3.15576e7).toFixed(1)} yr`;
}

/** Meters -> readable length */
export function length(m) {
  const a = Math.abs(m);
  if (a >= 1.495978707e10) return `${(m / 1.495978707e11).toFixed(3)} AU`;
  if (a >= 1e3) return `${sci(m / 1e3, 3)} km`;
  if (a >= 1) return `${m.toFixed(a >= 100 ? 0 : 1)} m`;
  if (a >= 1e-2) return `${(m * 100).toFixed(1)} cm`;
  if (a >= 1e-3) return `${(m * 1e3).toFixed(1)} mm`;
  return `${(m * 1e6).toFixed(a >= 1e-5 ? 0 : 1)} µm`;
}

/** Watts with SI prefixes up to yotta, then scientific */
export function watts(w) {
  const prefixes = [[1e24, 'YW'], [1e21, 'ZW'], [1e18, 'EW'], [1e15, 'PW'], [1e12, 'TW'], [1e9, 'GW'], [1e6, 'MW'], [1e3, 'kW']];
  const a = Math.abs(w);
  if (a >= 1e27) return `${sci(w)} W`;
  for (const [v, p] of prefixes) if (a >= v) return `${(w / v).toFixed(a / v >= 100 ? 0 : 1)} ${p}`;
  return `${w.toFixed(a >= 10 ? 0 : 1)} W`;
}

export function kg(m) {
  const a = Math.abs(m);
  if (a >= 1e6) return `${sci(m)} kg`;
  if (a >= 1e3) return `${(m / 1e3).toFixed(1)} t`;
  return `${m.toFixed(a >= 10 ? 0 : 2)} kg`;
}

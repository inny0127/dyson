// The Ledger: every number the scenes show, in one column, recomputed live.
import { sci, pct, kelvin, watts, kg, length, duration } from '../util/format.js';
import { MERCURY, REFS, EARTH } from '../model/constants.js';

function row(k, v, { note, cls } = {}) {
  return `<div class="row ${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div>${note ? `<div class="n">${note}</div>` : ''}</div>`;
}

function section(title, tag, rows) {
  return `<section><h3>${title}${tag ? `<span>${tag}</span>` : ''}</h3>${rows.join('')}</section>`;
}

/** Year marks for the timeline. */
export function milestones(state) {
  const { params: p, d } = state;
  const g = d.growth;
  const out = [
    { year: g.yearsForFraction(0.01), label: '1%' },
    { year: g.yearsForFraction(0.1), label: '10%' },
    { year: g.yearsForFraction(0.5), label: '50%' },
    { year: g.yearsToFull, label: 'complete' },
  ];
  if (g.capped) out.push({ year: g.tCap, label: 'heat wall' });
  if (d.massMined > MERCURY.M_SHELL) out.push({ year: g.yearsForMass(MERCURY.M_SHELL / d.logistics.minedPerDelivered), label: 'mantle gone' });
  return out.sort((a, b) => a.year - b.year);
}

// Spectrum of the whole system seen from far away, as λL_λ / L☉ (energy per log-wavelength).
// A blackbody of luminosity L has λL_λ = L · (15/π⁴) x⁴ / (eˣ − 1), x = hc / (λ k T): the curve's
// height depends only on L, so the swarm's infrared hump is as tall as the Sun it hides.
const SED_COLORS = { sun: '#c98426', swarm: '#9a73ec' };
const HC_K = 0.0143877688; // m·K
const shape = x => (15 / Math.PI ** 4) * x ** 4 / Math.expm1(x);
export function sedData(state) {
  const { now, d, params: p } = state;
  const f = now.f;
  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const lgl = -7 + (i / 160) * 3.3;                // 0.1 µm .. 200 µm
    const lam = 10 ** lgl;
    const sun = (1 - f) * shape(HC_K / (lam * 5772));
    const swarm = f * shape(HC_K / (lam * now.tSheet));
    pts.push({ lam, sun, swarm });
  }
  return { pts, f, T: now.tSheet };
}
function sedChart(state) {
  const { pts, f, T } = sedData(state);
  const W = 320, H = 150, L = 34, R = 8, Tp = 10, B = 26;
  const x = lam => L + ((Math.log10(lam) + 7) / 3.3) * (W - L - R);
  const ymin = -4, ymax = 0;
  const y = v => Tp + (1 - (Math.log10(Math.max(v, 1e-6)) - ymin) / (ymax - ymin)) * (H - Tp - B);
  const path = key => pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.lam).toFixed(1)},${Math.min(H - B, y(q[key])).toFixed(1)}`).join('');
  const area = key => `${path(key)}L${x(pts[pts.length - 1].lam).toFixed(1)},${H - B}L${x(pts[0].lam).toFixed(1)},${H - B}Z`;
  const ticksX = [[1e-7, '0.1'], [1e-6, '1'], [1e-5, '10'], [1e-4, '100 µm']];
  const ticksY = [[1, '1'], [1e-2, '0.01'], [1e-4, '10⁻⁴']];
  const peakSwarm = 2.897771955e-3 / T;
  const sunLbl = f < 0.999 ? `<text x="${x(5e-7) + 4}" y="${y((1 - f) * 0.74) - 5}" class="sl">Sun ${f > 0.001 ? `(${pct(1 - f, 1)} escapes)` : ''}</text>` : '';
  const swLbl = f > 1e-4 ? `<text x="${Math.min(W - 70, x(peakSwarm) + 4)}" y="${y(f * 0.74) - 5}" class="sl">Swarm, ${Math.round(T)} K</text>` : '';
  return `<div class="chart" id="sed" data-f="${f}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spectrum of the Sun and swarm seen from far away">
      <style>.ax{stroke:var(--line);stroke-width:1}.tk{fill:var(--muted);font:9px var(--font-mono)}.sl{fill:var(--fg);font:500 9.5px var(--font-mono)}</style>
      <rect x="${x(3.8e-7)}" y="${Tp}" width="${x(7.5e-7) - x(3.8e-7)}" height="${H - Tp - B}" fill="rgba(236,230,216,0.06)"/>
      <text x="${(x(3.8e-7) + x(7.5e-7)) / 2}" y="${H - B - 4}" class="tk" text-anchor="middle">eye</text>
      ${ticksY.map(([v, t]) => `<line class="ax" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tk" x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${t}</text>`).join('')}
      ${ticksX.map(([v, t]) => `<text class="tk" x="${x(v)}" y="${H - B + 12}" text-anchor="middle">${t}</text>`).join('')}
      <path d="${area('sun')}" fill="${SED_COLORS.sun}" fill-opacity="0.14"/>
      <path d="${area('swarm')}" fill="${SED_COLORS.swarm}" fill-opacity="0.14"/>
      <path d="${path('sun')}" fill="none" stroke="${SED_COLORS.sun}" stroke-width="2" stroke-linejoin="round"/>
      <path d="${path('swarm')}" fill="none" stroke="${SED_COLORS.swarm}" stroke-width="2" stroke-linejoin="round"/>
      ${sunLbl}${swLbl}
      <g class="hover" visibility="hidden"><line class="ax" y1="${Tp}" y2="${H - B}" stroke="var(--fg)"/><rect rx="3" fill="var(--panel-solid)" stroke="var(--line)" height="30" width="118"/><text class="tk"></text><text class="tk"></text></g>
      <rect class="hit" x="${L}" y="${Tp}" width="${W - L - R}" height="${H - Tp - B}" fill="transparent"/>
    </svg>
    <div class="legend"><span><i style="background:${SED_COLORS.sun}"></i>Sunlight escaping</span><span><i style="background:${SED_COLORS.swarm}"></i>Swarm waste heat</span><span class="unit">λL<sub>λ</sub> / L☉ vs wavelength</span></div>
  </div>`;
}

/** Hover layer for the spectrum chart (attached once; survives re-renders). */
export function attachLedgerInteractions(root, getState) {
  root.addEventListener('pointermove', e => {
    const svg = root.querySelector('#sed svg');
    if (!svg || !e.target.classList?.contains('hit')) { root.querySelector('#sed .hover')?.setAttribute('visibility', 'hidden'); return; }
    const box = svg.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * 320;
    const lgl = -7 + ((vx - 34) / (320 - 34 - 8)) * 3.3;
    const { pts } = sedData(getState());
    const q = pts[Math.max(0, Math.min(pts.length - 1, Math.round(((lgl + 7) / 3.3) * 160)))];
    const g = svg.querySelector('.hover');
    g.setAttribute('visibility', 'visible');
    g.querySelector('line').setAttribute('x1', vx); g.querySelector('line').setAttribute('x2', vx);
    const bx = vx > 200 ? vx - 124 : vx + 6;
    g.querySelector('rect').setAttribute('x', bx); g.querySelector('rect').setAttribute('y', 12);
    const [t1, t2] = g.querySelectorAll('text');
    const lam = q.lam * 1e6;
    t1.setAttribute('x', bx + 5); t1.setAttribute('y', 24); t1.textContent = `${lam < 1 ? lam.toFixed(2) : lam.toFixed(lam < 10 ? 1 : 0)} µm · Sun ${sci(q.sun, 2)}`;
    t2.setAttribute('x', bx + 5); t2.setAttribute('y', 36); t2.textContent = `swarm ${sci(q.swarm, 2)}`;
  });
  root.addEventListener('pointerleave', () => root.querySelector('#sed .hover')?.setAttribute('visibility', 'hidden'));
}

function myths(state) {
  const { params: p, d } = state;
  const g = d.growth;
  const y1 = g.yearsTo1pct;
  const items = [
    ['Panels hug the Sun.', `They would melt their chips: a panel at Mercury’s orbit runs at ${Math.round(d.tAtMercury)} K. The swarm sits at <b>${d.rAU.toFixed(2)} AU</b>${d.rAU > 1 ? ', beyond Earth' : ''}.`],
    ['Big rigid solar panels.', `Each satellite is a ${length(2 * d.sat.hexSide)} film about ${length(d.sat.equivAlThicknessM)} thick, with a chip every ${length(d.chipPitch ?? 0.05)}.`],
    ['A glowing golden sphere.', `It is black to the eye. It glows only in the infrared, at ${(2.897771955e-3 / d.tSheet * 1e6).toFixed(1)} µm.`],
    ['Mercury is plenty.', `The swarm digs out ${pct(d.fracMercuryMined, 0)} of Mercury, ${d.fracShellMined > 1 ? 'all of its rock and into the iron core' : `${pct(d.fracShellMined, 0)} of its rock`}.`],
    ['Earth is a spectator.', `At 1% coverage Earth already gains +${sci(d.earth1pct.forcing)} W/m² of heat; the finished swarm pushes it past the runaway greenhouse.`],
    g.capped
      ? ['It is built in a few decades.', `Growth is exponential for ${Math.round(g.tCap)} years, then Mercury cannot shed the waste heat of digging any faster. Finishing takes <b>${Math.round(g.yearsToFull).toLocaleString()} years</b>.`]
      : ['It grows steadily.', `Nothing is visible for ${Math.round(y1)} years; going from 1% to complete takes only ${Math.round(g.yearsToFull - y1)} more.`],
  ];
  return `<section class="myths"><h3>What the usual pictures get wrong</h3><ol>${items.map(([a, b]) => `<li><s>${a}</s> ${b}</li>`).join('')}</ol></section>`;
}

export function renderLedger(root, state) {
  const { params: p, d, now } = state;
  const e = d.earth, en = now.earth;
  const scroll = root.scrollTop;

  const html = [
    myths(state),
    section('Where it has to sit', 'thermal', [
      row('Chip limit → sheet temperature', `${Math.round(p.tChipMax)} K → ${Math.round(d.tSheetMax)} K`),
      row('Orbit radius', `${d.rAU.toFixed(3)} AU`, {
        cls: 'shock',
        note: d.rAU > 1
          ? `Outside Earth’s orbit. A nearly closed shell can only shed heat outward, so it runs 21% hotter than a lone panel at the same distance and has to back away from the Sun.`
          : `Inside Earth’s orbit. Sheets here only stay cool because the swarm is sparse enough to radiate from both faces.`,
      }),
      row('Sunlight there', `${sci(d.S)} W/m²`),
      row('Sheet temperature (finished swarm)', kelvin(d.tSheet)),
      row('Same panel alone in space', kelvin(d.tSheetIsolated), { note: 'The swarm warms itself: inward-facing panels trade heat with the far side of the shell.' }),
      row('Sheet temperature at Mercury’s orbit', kelvin(d.tAtMercury)),
      row('Minimum radiator area at this temperature', `${sci(d.aMinSparse)} m²`, { note: `Thermodynamic floor: no orbit choice gets below it. Swarm mass scales with T<sup>−4</sup>, so the chip temperature limit, not the orbit, decides how much of Mercury you need.` }),
    ]),
    section('One satellite', `${sci(p.satArea)} m²`, [
      row('Hexagon side', length(d.sat.hexSide)),
      row('Mass', kg(d.sat.mass)),
      row('Average thickness (as aluminium)', length(d.sat.equivAlThicknessM), { cls: 'shock', note: `Width-to-thickness ratio ${sci((2 * d.sat.hexSide) / d.sat.equivAlThicknessM)}:1. A sheet of printer paper is about 2,900:1.` }),
      row('Heat to reject', watts(d.sat.heat)),
      row('Electric power to chips', watts(d.sat.elec), { note: `${sci(d.sat.datacenters, 2)}× a 1 GW AI campus, on one satellite.` }),
      row('Compute', `${sci(d.sat.flops)} FLOP/s`, { note: `${sci(d.sat.h100Equiv)} H100-equivalents.` }),
      row('PV efficiency when hot', pct(d.etaPV)),
    ]),
    section('The finished swarm', `coverage ${pct(d.f, 1)}`, [
      row('Satellites', sci(d.nSats), { cls: 'shock', note: `${sci(d.vsMilkyWayStars)}× the number of stars in the Milky Way.` }),
      row('Collecting area', `${sci(d.satAreaTotal)} m²`),
      row('Power captured', `${sci(d.intercepted)} W`),
      row('Electricity', `${sci(d.elecTotal)} W`, { note: `${sci(d.elecTotal / REFS.worldElectricityW)}× all human electricity.` }),
      row('Compute', `${sci(d.flopsTotal)} FLOP/s`, { cls: 'shock', note: `${sci(d.vsHumanity)}× every AI chip on Earth today. Landauer floor is ${sci(d.landauerGap)}× below current chips.` }),
      row('Light-time across the swarm', duration(d.lightAcross), { note: 'Not one brain: a satellite on the far side is this many minutes away.' }),
    ]),
    section('Seen from another star', `year ${p.year.toFixed(0)}`, [
      sedChart(state),
      row('Visible light still escaping', pct(1 - now.f, 2), { cls: now.f > 0.5 ? 'shock' : '' }),
      row('Infrared peak of the swarm', `${(2.897771955e-3 / now.tSheet * 1e6).toFixed(1)} µm`, { note: `The Sun peaks near 0.5 µm. A finished swarm turns the Sun into a ${Math.round(d.tSheet)} K infrared object ${(2 * d.rAU).toFixed(1)} AU across: the signature searches for Dyson spheres look for.` }),
    ]),
    section('Mercury', 'the mine', [
      row('Swarm mass', kg(d.massSwarm)),
      row('Share of Mercury', pct(d.fracMercury), { cls: d.fracShell > 1 ? 'bad' : 'shock', note: d.fracShell > 1 ? `More than Mercury’s whole rocky mantle and crust (${pct(MERCURY.M_SHELL / MERCURY.M, 0)} of the planet). You dig into the iron core.` : `${pct(d.fracShell, 0)} of Mercury’s rocky mantle and crust.` }),
      row('Mined so far', `${pct(now.mercuryRemoved, 3)}`, { note: `Radius ${Math.round(now.mercuryRadius / 1e3).toLocaleString()} km (was ${Math.round(MERCURY.R / 1e3).toLocaleString()} km).` }),
      row('Mass-driver launch speed', `${(d.logistics.vLaunch / 1e3).toFixed(1)} km/s`, { note: `Fired at Mercury’s perihelion: escape plus ${(d.logistics.vInf / 1e3).toFixed(1)} km/s to coast out to ${d.rAU.toFixed(2)} AU in ${Math.round(d.logistics.tTransfer / 86400)} days. Track length at 100 g: ${Math.round(d.logistics.trackLength / 1e3)} km.` }),
      row('Then each panel circularises', `${(d.logistics.dvCirc / 1e3).toFixed(1)} km/s`, { note: `Its own ion thruster, powered by its own PV, burning Mercury magnesium or oxygen. Propellant: ${pct(d.logistics.propFracCirc, 0)} of launch mass. A sail cannot do this: an absorbing panel gets only radial push, which never raises an orbit.` }),
      row('Launch energy', `${sci(d.logistics.launchEnergyPerKg / 1e6)} MJ/kg`),
      row('Heat left on Mercury now', `${sci(now.heatOnMercury)} W`, { cls: now.heatLimited ? 'bad' : '', note: `Limit ${sci(p.mercuryHeatLimit)} W: the night side’s radiators. ${now.heatLimited ? 'Growth is heat-limited right now.' : ''}` }),
      row('Exponential phase ends', d.growth.capped ? `year ${d.growth.tCap.toFixed(0)}` : 'never', { note: d.growth.capped ? `Then export is capped at ${sci(d.growth.rateCap)} kg/s of satellites (${sci(d.growth.rateCap * 3.15576e7)} kg a year).` : 'The heat limit is never reached.' }),
      row('Years to 1% / 10% / complete', `${d.growth.yearsTo1pct.toFixed(0)} / ${d.growth.yearsTo10pct.toFixed(0)} / ${Math.round(d.growth.yearsToFull).toLocaleString()}`),
    ]),
    section('Earth', `year ${p.year.toFixed(0)}`, [
      row('Extra heat on Earth now', `${en.forcing >= 0 ? '+' : ''}${sci(en.forcing)} W/m²`, { cls: en.forcing > 3.7 ? 'bad' : '', note: `${sci(en.co2Doublings, 2)}× the forcing of doubling CO₂.` }),
      row('Night sky now', en.nightLux > 0 ? `${sci(en.nightLux)} lux` : 'unchanged', { cls: en.nightLux > 1 ? 'bad' : '', note: 'Full Moon ≈ 0.25 lux. Overcast daylight ≈ 1,000 lux.' }),
      row('Finished swarm: extra heat', `+${sci(e.forcing)} W/m²`, { cls: 'bad', note: e.exterior ? `Earth sits inside a shell whose inner face glows at ${Math.round(e.skyTemp)} K.` : 'Waste heat from a swarm inside Earth’s orbit still streams outward past Earth.' }),
      row('Finished swarm: Earth’s radiating temperature', kelvin(e.tEff), { cls: 'bad', note: `Today ${EARTH.tEff} K. ${e.runaway ? 'Beyond the runaway-greenhouse limit (≈282 W/m² absorbed): the oceans eventually boil off.' : ''}` }),
    ]),
  ].join('');
  root.innerHTML = html;
  root.scrollTop = scroll;
}

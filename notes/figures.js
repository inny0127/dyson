// Explanatory diagrams for the technical notes: each one shows a mechanism the prose would
// otherwise have to assemble (where heat goes, how a sail folds, why orbits cross). Inline SVG in
// the page's ink colours, so they follow light and dark themes; one hue only where it carries
// meaning (sunlight amber, heat red, Earth blue, the swarm violet). Numbers come from the model or
// the design study and are noted where they are drawn.
import * as h from '../src/model/hybrid.js';

const P = h.eraParams('mid');
const HALO = ';paint-order:stroke;stroke:var(--paper);stroke-width:4px;stroke-linejoin:round';
const HUE = { ink: 'var(--ink)', ink2: 'var(--ink-2)', ink3: 'var(--ink-3)', sun: 'var(--sun)', heat: 'var(--heat)', earth: 'var(--earth)', swarm: 'var(--swarm)', rule: 'var(--rule)' };

// ---------------------------------------------------------------- drawing helpers
let uid = 0;
/** An SVG figure: viewBox W×H, an accessible label, arrowheads in every hue (ids unique per figure). */
function svg(W, H, label, body) {
  const id = `f${++uid}`;
  const defs = Object.entries(HUE).map(([k, c]) => `<marker id="${id}-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" style="fill:${c}"/></marker>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}"><defs>${defs}</defs>${body(id)}</svg>`;
}
/** Text: size s, weight w, colour c (a HUE key), anchor a, halo over lines. */
const T = (x, y, s, { a = 'start', c = 'ink2', w = 400, sz = 12, halo = false, it = false } = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${a}" style="fill:${HUE[c]};font:${it ? 'italic ' : ''}${w} ${sz}px var(--sans)${halo ? HALO : ''}">${s}</text>`;
/** A line, optionally an arrow (arrow: the figure id) and dashed. */
const Ln = (x1, y1, x2, y2, { c = 'ink', w = 1.5, dash = '', arrow = null, both = false } = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${HUE[c]};stroke-width:${w}${dash ? `;stroke-dasharray:${dash}` : ''}"${arrow ? ` marker-end="url(#${arrow}-${c})"${both ? ` marker-start="url(#${arrow}-${c})"` : ''}` : ''}/>`;
const Rect = (x, y, w, hh, { fill = 'none', stroke = 'ink', sw = 1, op = 1, rx = 0, dash = '' } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="${rx}" style="fill:${HUE[fill] ?? fill};fill-opacity:${op};stroke:${stroke === 'none' ? 'none' : HUE[stroke]};stroke-width:${sw}${dash ? `;stroke-dasharray:${dash}` : ''}"/>`;
const Circ = (cx, cy, r, { fill = 'none', stroke = 'ink', sw = 1.5, op = 1, dash = '' } = {}) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" style="fill:${HUE[fill] ?? fill};fill-opacity:${op};stroke:${stroke === 'none' ? 'none' : HUE[stroke]};stroke-width:${sw}${dash ? `;stroke-dasharray:${dash}` : ''}"/>`;
const Path = (d, { stroke = 'ink', sw = 1.5, fill = 'none', op = 1, arrow = null, dash = '' } = {}) =>
  `<path d="${d}" style="fill:${HUE[fill] ?? fill};fill-opacity:${op};stroke:${stroke === 'none' ? 'none' : HUE[stroke]};stroke-width:${sw}${dash ? `;stroke-dasharray:${dash}` : ''}"${arrow ? ` marker-end="url(#${arrow}-${stroke})"` : ''}/>`;
/** A curved arrow round (cx, cy): an arc of radius r from angle a0 to a1 (degrees, clockwise from east). */
const Arc = (cx, cy, r, a0, a1, o = {}) => {
  const p = a => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return Path(`M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1.toFixed(1)},${y1.toFixed(1)}`, o);

};
const put = (el, s) => { el.innerHTML = s; };

// ---------------------------------------------------------------- the sail
export const FIGURES = {
  /** The film in cross-section: light in, electricity to the chiplet, heat out of both faces. */
  sailStack(el) {
    // mature film, thicknesses to scale with each other (µm); the chiplet is drawn narrower than it is
    const layers = [
      ['Anti-reflection coating', 0.1, 'var(--wash)', 'lets light in'],
      ['Cover glass', 8, 'rule', 'stops solar protons'],
      ['Silicon solar cell', 10, 'ink3', 'turns light into electricity'],
      ['Contacts and insulation', 1.5, 'ink2', 'collect the current, all at the back'],
      ['Magnesium spreader', 13, 'rule', 'carries each chip’s heat a few cm'],
      ['Emitter enamel', 6, 'var(--wash)', 'radiates heat into space'],
    ];
    const k = 5.2, x0 = 70, wFilm = 330, yTop = 62, chipX = x0 + 140;
    put(el, svg(720, 400, 'Cross-section of the film: sunlight enters the front, the silicon turns part of it into electricity for the chiplet on the back, and the heat leaves from both faces', id => {
      let s = '', y = yTop;
      const mid = {};
      layers.forEach(([name, um, fill, role], i) => {
        const hh = Math.max(3, um * k);
        s += Rect(x0, y, wFilm, hh, { fill, stroke: 'ink3', sw: 0.75, op: fill === 'ink3' ? 0.55 : fill === 'ink2' ? 0.8 : 1 });
        mid[name] = y + hh / 2;
        const ly = yTop + 8 + i * 33;
        s += Ln(x0 + wFilm + 4, y + hh / 2, x0 + wFilm + 40, ly - 4, { c: 'ink3', w: 0.75 });
        s += T(x0 + wFilm + 46, ly, `${name}${um >= 1 ? `, ${um} µm` : ''}`, { c: 'ink', w: 500 }) + T(x0 + wFilm + 46, ly + 14, role, { sz: 11.5 });
        y += hh;
      });
      const yBot = y;
      // sunlight in, and heat out of the front
      for (const dx of [30, 90, 150]) s += Ln(x0 + dx, 6, x0 + dx + 22, yTop + 52, { c: 'sun', w: 2, arrow: id });
      s += T(x0 + 30, 16, 'sunlight', { a: 'end', c: 'sun', w: 500 });
      for (const dx of [250, 300]) s += Ln(x0 + dx, yTop - 3, x0 + dx + 6, 10, { c: 'heat', w: 2, arrow: id });
      s += T(x0 + wFilm + 12, 22, 'some heat leaves the front', { c: 'heat', w: 500 });
      // electricity from the cell to the chiplet
      s += Path(`M${x0 + 112},${mid['Silicon solar cell']} C${x0 + 112},${yBot - 20} ${chipX - 50},${yBot + 2} ${chipX - 2},${yBot + 11}`, { stroke: 'ink', sw: 1.5, dash: '4 3', arrow: id });
      s += T(x0 + 104, mid['Silicon solar cell'] + 34, 'electricity', { a: 'end', c: 'ink', w: 500, halo: true });
      // the chiplet, and its heat spreading sideways in the magnesium
      s += Rect(chipX, yBot, 60, 22, { fill: 'ink', stroke: 'ink', op: 0.9 });
      s += T(chipX + 30, yBot + 40, 'chiplet, 0.15 W', { a: 'middle', c: 'ink', w: 500, halo: true });
      const ym = mid['Magnesium spreader'];
      s += Ln(chipX - 6, ym, x0 + 40, ym, { c: 'heat', w: 1.5, arrow: id }) + Ln(chipX + 66, ym, x0 + wFilm - 40, ym, { c: 'heat', w: 1.5, arrow: id });
      // heat out of the back
      for (const dx of [30, 90, 240, 300]) s += Ln(x0 + dx, yBot + 4, x0 + dx, yBot + 56, { c: 'heat', w: 2, arrow: id });
      s += T(x0 + wFilm + 12, yBot + 40, 'most heat leaves the back', { c: 'heat', w: 500 });
      s += T(x0, 372, 'Layer thicknesses to scale with each other (the mature film, about 40 µm in all).', { c: 'ink3', sz: 11.5 });
      s += T(x0, 388, 'The chiplet is drawn narrower than it is: 2.5 mm wide and 50 µm thick, one per 2.5 cm square.', { c: 'ink3', sz: 11.5 });
      return s;
    }));
  },

  /** Three sails edge-on: where the heat can go decides the temperature. */
  threeSails(el) {
    const cs = [
      { t: 'A lone sail, glass front', sub: 'on its own orbit, 0.862 AU', T: '349 K film, chips 85 °C', front: 1, back: 1 },
      { t: 'A lone sail, dark front', sub: 'the sphere while open, 0.95 AU', T: '382 K film, chips 118 °C', front: 0.1, back: 1 },
      { t: 'The closed sphere', sub: 'fronts face fronts, 0.95 AU', T: '419 K film, chips 155 °C', front: 0, back: 1, closed: true },
    ];
    put(el, svg(720, 290, 'Three sails seen edge-on: a glass-fronted sail sheds heat from both faces and runs coolest; a dark-fronted sail sheds it mostly from its back; in the closed sphere the fronts face other fronts and all the heat leaves from the backs, so it runs hottest', id => {
      let s = '';
      cs.forEach((c, i) => {
        const cx = 120 + i * 240, top = 78, bot = 198;
        s += T(cx, 22, c.t, { a: 'middle', c: 'ink', w: 600, sz: 13 }) + T(cx, 40, c.sub, { a: 'middle' });
        // sunlight from the left (in the closed sphere, from the Sun between the two sails)
        if (c.closed) {
          s += Circ(cx - 53, 138, 9, { fill: 'sun', stroke: 'none' });
          for (const y of [118, 138, 158]) s += Ln(cx - 42, y, cx - 18, y, { c: 'sun', w: 2, arrow: id }) + Ln(cx - 64, y, cx - 88, y, { c: 'sun', w: 2, arrow: id });
          s += T(cx - 53, 102, 'Sun', { a: 'middle', c: 'sun', sz: 11.5 });
        } else {
          for (const y of [100, 138, 176]) s += Ln(cx - 105, y, cx - 22, y, { c: 'sun', w: 2, arrow: id });
          s += T(cx - 105, 92, 'sunlight', { c: 'sun', sz: 11.5 });
        }
        // the sail, edge-on
        s += Ln(cx - 10, top, cx - 10, bot, { c: 'ink', w: 4 });
        // back: heat out to the right
        for (const y of [104, 138, 172]) s += Ln(cx - 4, y, cx + 70, y, { c: 'heat', w: 2.2, arrow: id });
        s += T(cx + 8, 92, 'back', { sz: 11.5 });
        if (c.closed) {
          // across the hollow middle, with the Sun between them, another sail faces this one
          s += Ln(cx - 96, top, cx - 96, bot, { c: 'ink3', w: 4 });
          for (const x of [cx - 102]) for (const y of [112, 164]) s += Ln(x, y, x - 22, y, { c: 'heat', w: 2.2, arrow: id });
          s += Ln(cx - 90, 70, cx - 16, 70, { c: 'heat', w: 1.4, dash: '3 3', arrow: id, both: true });
          s += T(cx - 53, 62, 'fronts trade heat', { a: 'middle', sz: 11.5, halo: true });
          s += T(cx - 53, 222, 'none escapes', { a: 'middle', sz: 11.5 }) + T(cx - 53, 236, 'between the fronts', { a: 'middle', sz: 11.5 });
        } else {
          s += Ln(cx - 16, 120, cx - 16 - (c.front > 0.5 ? 64 : 22), 120, { c: 'heat', w: c.front > 0.5 ? 2.2 : 1, arrow: id });
          s += T(cx - 22, 222, c.front > 0.5 ? 'front radiates too' : 'front barely radiates', { a: 'middle', sz: 11.5 });
        }
        s += T(cx, 268, c.T, { a: 'middle', c: 'heat', w: 600 });
      });
      return s;
    }));
  },

  /** How a sail folds into one launch package. */
  foldSequence(el) {
    put(el, svg(720, 250, 'How a sail is packed: the square is folded like an accordion along its hinge lines into a strip 1.63 m wide and 395 m long, then rolled from both ends toward the hub into two rolls', id => {
      let s = '';
      // 1: the diamond with hinge lines
      const cx = 105, cy = 118, r = 82;
      s += Path(`M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`, { stroke: 'ink', sw: 1.5, fill: 'var(--wash)' });
      for (let i = -7; i <= 7; i++) { const y = cy + (i * r) / 8, w = r - Math.abs(i * r) / 8; s += Ln(cx - w, y, cx + w, y, { c: 'ink3', w: 0.8 }); }
      s += T(cx, 226, '1. The flat sail', { a: 'middle', c: 'ink', w: 600 }) + T(cx, 242, '243 hinge lines', { a: 'middle', sz: 11.5 });
      s += Ln(205, cy, 250, cy, { c: 'ink', arrow: id }) + T(228, cy - 10, 'fold', { a: 'middle', sz: 11.5 });
      // 2: the accordion, seen from its end
      let z = `M270,${cy - 40}`;
      for (let i = 0; i < 12; i++) z += ` L${272 + i * 9 + 4.5},${i % 2 ? cy - 40 : cy + 40}`;
      s += Path(z, { stroke: 'ink', sw: 1.2 });
      s += T(330, 226, '2. An accordion strip', { a: 'middle', c: 'ink', w: 600 }) + T(330, 242, '1.63 m wide, 395 m long', { a: 'middle', sz: 11.5 });
      s += T(330, cy - 54, 'seen end-on', { a: 'middle', sz: 11.5, c: 'ink3' });
      s += Ln(400, cy, 445, cy, { c: 'ink', arrow: id }) + T(422, cy - 10, 'roll', { a: 'middle', sz: 11.5 });
      // 3: two rolls and the hub
      s += Circ(500, cy, 30, { fill: 'var(--wash)' }) + Circ(500, cy, 6) + Arc(500, cy, 20, 200, 520, { stroke: 'ink3', sw: 0.8 });
      s += Rect(538, cy - 22, 44, 44, { fill: 'var(--wash)', stroke: 'ink' }) + T(560, cy + 4, 'hub', { a: 'middle', sz: 11 });
      s += Circ(620, cy, 30, { fill: 'var(--wash)' }) + Circ(620, cy, 6) + Arc(620, cy, 20, 200, 520, { stroke: 'ink3', sw: 0.8 });
      s += Ln(470, cy + 46, 650, cy + 46, { c: 'ink3', w: 0.8 }) + T(560, cy + 62, '7.7 m', { a: 'middle', sz: 11.5 });
      s += T(560, 226, '3. One launch package', { a: 'middle', c: 'ink', w: 600 }) + T(560, 242, '14.4 t, two rolls 2.2 m across', { a: 'middle', sz: 11.5 });
      return s;
    }));
  },

  /** Steering: vanes tilt the push of sunlight; a flywheel flips the sail. */
  steering(el) {
    put(el, svg(720, 270, 'Two ways a sail turns: tilting a corner vane moves where sunlight pushes and makes a slow torque; spinning up a flywheel turns the whole sail the other way in minutes', id => {
      let s = '';
      // left: vane
      const cx = 170, cy = 140;
      s += Path(`M${cx},${cy - 90} L${cx + 90},${cy} L${cx},${cy + 90} L${cx - 90},${cy} Z`, { stroke: 'ink', fill: 'var(--wash)' });
      s += Rect(cx - 7, cy - 7, 14, 14, { fill: 'ink' });
      s += Ln(cx + 90, cy, cx + 112, cy, { c: 'ink', w: 1 });
      s += Path(`M${cx + 112},${cy - 16} L${cx + 128},${cy + 16}`, { stroke: 'ink', sw: 3 });
      for (const dy of [-12, 0, 12]) s += Ln(cx + 165, cy + dy - 30, cx + 128 + dy * 0.3, cy + dy, { c: 'sun', w: 1.8, arrow: id });
      s += T(cx + 170, cy - 48, 'sunlight on', { sz: 11.5, c: 'sun' }) + T(cx + 170, cy - 34, 'a tilted vane', { sz: 11.5, c: 'sun' });
      s += Arc(cx, cy, 44, -40, 40, { stroke: 'ink', sw: 1.6, arrow: id });
      s += T(cx + 6, cy + 64, 'torque', { sz: 11.5, c: 'ink', w: 500 });
      s += T(cx, 252, 'Vanes: slow, steady pointing', { a: 'middle', c: 'ink', w: 600 }) + T(cx, 268, '0.35 N·m on each axis', { a: 'middle', sz: 11.5 });
      // right: flywheel
      const fx = 530, fy = 130;
      s += Ln(fx - 120, fy, fx + 120, fy, { c: 'ink', w: 4 });
      s += Circ(fx, fy, 24, { fill: 'var(--paper)' }) + Circ(fx, fy, 3, { fill: 'ink' });
      s += Arc(fx, fy, 34, 200, 340, { stroke: 'swarm', sw: 2, arrow: id });
      s += T(fx, fy - 46, 'wheel spins one way', { a: 'middle', c: 'swarm', sz: 11.5, w: 500 });
      s += Arc(fx, fy, 112, 15, -28, { stroke: 'ink', sw: 1.6, arrow: id });
      s += Arc(fx, fy, 112, 195, 152, { stroke: 'ink', sw: 1.6, arrow: id });
      s += T(fx + 112, fy - 70, 'the sail turns', { a: 'end', c: 'ink', sz: 11.5, w: 500 }) + T(fx + 112, fy - 56, 'the other way', { a: 'end', c: 'ink', sz: 11.5, w: 500 });
      s += T(fx - 120, fy + 22, 'sail, edge-on', { sz: 11.5 });
      s += T(fx, 252, 'Flywheel: a ten-minute flip', { a: 'middle', c: 'ink', w: 600 }) + T(fx, 268, 'the wheel ends at its starting speed', { a: 'middle', sz: 11.5 });
      return s;
    }));
  },

  // ---------------------------------------------------------------- chips in the film
  /** A message crossing the film: hop by hop on wires, or in one go on a light guide. */
  meshVsLight(el) {
    put(el, svg(720, 300, 'Two ways for one chip to reach a chip far across the sail: hop by hop through every chip in between on the electrical mesh, or in one step along a light guide laid in the film', id => {
      let s = '';
      const panel = (ox, title, sub, light) => {
        const n = 7, g = 30, x0 = ox + 40, y0 = 52;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += Rect(x0 + i * g, y0 + j * g, 10, 10, { fill: 'ink3', stroke: 'none', op: 0.7 });
        const a = [x0 + 5, y0 + 6 * g + 5], b = [x0 + 6 * g + 5, y0 + 5];
        s += Rect(a[0] - 7, a[1] - 7, 14, 14, { fill: 'none', stroke: 'swarm', sw: 2 }) + Rect(b[0] - 7, b[1] - 7, 14, 14, { fill: 'none', stroke: 'swarm', sw: 2 });
        if (!light) {
          let d = `M${a[0]},${a[1]}`;
          for (let k = 1; k <= 6; k++) d += ` L${a[0] + k * g},${a[1] - (k - 1) * g} L${a[0] + k * g},${a[1] - k * g}`;
          s += Path(d, { stroke: 'heat', sw: 2, arrow: id });
          s += T(ox + 145, y0 + 222, '12 hops, each costing energy and time', { a: 'middle', sz: 11.5 });
        } else {
          s += Path(`M${a[0]},${a[1]} L${b[0] - 8},${b[1] + 8}`, { stroke: 'swarm', sw: 2.5, arrow: id });
          s += T(ox + 145, y0 + 222, 'one step, at the speed of light in glass', { a: 'middle', sz: 11.5 });
        }
        s += T(ox + 145, 24, title, { a: 'middle', c: 'ink', w: 600, sz: 13 });
        s += T(ox + 145, y0 + 244, sub, { a: 'middle', c: light ? 'swarm' : 'heat', w: 600 });
      };
      panel(40, 'Wires only (2026)', 'about 220–1,465 pJ a bit, 11–94 µs', false);
      panel(390, 'With light guides (mature)', 'about 0.03–2 pJ a bit, under 3 µs', true);
      return s;
    }));
  },

  /** How tightly computers cooperate at each scale, from one chip to the whole swarm. */
  scales(el) {
    const rows = [
      ['One chiplet', '0.15 W', 'its own memory', 'nanoseconds'],
      ['One sail', '~15 MW, 10⁸ chiplets', 'light guides in the film', 'microseconds: one machine'],
      ['An island of sails', '10²–10⁵ sails', 'laser links', 'swap updates every few minutes'],
      ['The whole swarm', '5×10¹⁸ sails', 'relayed laser network', 'hours: a population'],
    ];
    put(el, svg(720, 300, 'Four scales of cooperation: chips inside one sail work as one machine; sails cooperate loosely in islands; the swarm as a whole syncs only over hours', id => {
      let s = '';
      s += T(170, 20, 'How big', { a: 'middle', c: 'ink3', sz: 11.5, w: 500 }) + T(420, 20, 'Joined by', { a: 'middle', c: 'ink3', sz: 11.5, w: 500 }) + T(615, 20, 'How tightly', { a: 'middle', c: 'ink3', sz: 11.5, w: 500 });
      rows.forEach(([name, size, link, sync], i) => {
        const y = 40 + i * 64, w = 70 + i * 50;
        s += Rect(170 - w / 2, y, w, 40, { fill: i === 1 ? 'swarm' : 'var(--wash)', stroke: i === 1 ? 'swarm' : 'ink3', op: i === 1 ? 0.18 : 1, rx: 6 });
        s += T(170, y + 17, name, { a: 'middle', c: 'ink', w: 600 }) + T(170, y + 32, size, { a: 'middle', sz: 11.5 });
        s += T(420, y + 25, link, { a: 'middle' });
        s += T(615, y + 25, sync, { a: 'middle', c: i === 1 ? 'swarm' : 'ink', w: i === 1 ? 600 : 400 });
        if (i < rows.length - 1) s += Ln(170, y + 42, 170, y + 62, { c: 'ink3', w: 1.2, arrow: id });
      });
      return s;
    }));
  },

  // ---------------------------------------------------------------- hardware after 2095
  /** When the swarm is built, against the hardware generations. */
  eraTimeline(el) {
    const d = h.compute({ ...P }), g = d.growth;
    const yr = f => Math.round(P.seedYear + d.yearsToCoverage(Math.min(f, 0.9999) * h.FIXED.closedRoom));
    const x0 = 40, x1 = 690, a = 2020, b = 2400, X = y => x0 + ((y - a) / (b - a)) * (x1 - x0), ax = 136;
    put(el, svg(720, 270, 'A timeline from 2020 to 2400: the first factory lands in 2050, but the swarm reaches a millionth of the Sun only in 2116 and closes in 2361, so almost all of it is built with hardware from after 2100', id => {
      let s = '';
      const gens = [[2026, 2040], [2040, 2070], [2070, 2100]];
      gens.forEach(([p0, p1], i) => { s += Rect(X(p0), 176, X(p1) - X(p0) - 2, 24, { fill: 'ink3', stroke: 'none', op: 0.14 + i * 0.07, rx: 3 }); });
      s += T((X(2026) + X(2100)) / 2, 192, 'earlier', { a: 'middle', sz: 11.5 });
      s += Rect(X(2100), 176, X(2400) - X(2100), 24, { fill: 'swarm', stroke: 'none', op: 0.25, rx: 3 });
      s += T((X(2100) + X(2400)) / 2, 192, 'mature hardware, from 2100', { a: 'middle', c: 'ink', w: 600, sz: 11.5 });
      s += T(x0, 168, 'Hardware generations', { c: 'ink3', sz: 11.5, w: 500 });
      s += Ln(x0, ax, x1, ax, { c: 'ink3', w: 1 });
      for (const t of [2050, 2100, 2150, 2200, 2250, 2300, 2350, 2400]) s += Ln(X(t), ax - 4, X(t), ax + 4, { c: 'ink3', w: 1 }) + T(X(t), 222, t, { a: 'middle', sz: 11.5, c: 'ink3' });
      const tiers = [104, 76, 48];
      const ev = [[2050, 'first factory', 0], [yr(1e-6), 'a millionth', 2], [yr(0.01), '1%', 0, 'end'], [Math.round(P.seedYear + g.tCap), 'heat wall', 1], [yr(0.5), 'half', 0], [2361, 'closed', 0]];
      ev.forEach(([t, lab, k, anchor = 'middle']) => {
        const top = tiers[k], tx = X(t) + (anchor === 'end' ? -5 : 0);
        s += Ln(X(t), ax - 4, X(t), top + 4, { c: 'ink3', w: 0.75 });
        s += Circ(X(t), ax, 4, { fill: 'var(--paper)', stroke: 'ink', sw: 2 });
        s += T(tx, top - 2, lab, { a: anchor, c: 'ink', w: 500, sz: 11.5 }) + T(tx, top - 16, t, { a: anchor, sz: 11 });
      });
      s += T(x0, 256, 'Everything built before 2100 is under a millionth of the finished swarm, so the page shows mature hardware.', { c: 'ink3', sz: 11.5 });
      return s;
    }));
  },

  /** Radiation each memory survives, against the dose it would get on the film and in a pod. */
  memoryRad(el) {
    const mems = [['DRAM and HBM', 2, 100, 'pod'], ['3D NAND flash', 10, 50, 'pod'], ['Magnetic RAM', 1000, 3000, 'film', true], ['Ferroelectric RAM', 8000, 12000, 'film'], ['Resistive RAM', 5000, 20000, 'film']];
    const x0 = 160, x1 = 590, lo = 0.3, hi = 30000, X = v => x0 + (Math.log10(v / lo) / Math.log10(hi / lo)) * (x1 - x0);
    put(el, svg(720, 300, 'Radiation tolerance of memory types on a logarithmic scale: DRAM and flash fail far below the dose an unshielded film collects in a decade, so they stay in shielded pods; magnetic, ferroelectric and resistive memory survive it, and resistive memory survives centuries', id => {
      let s = '';
      // dose bands
      s += Rect(X(0.4), 30, X(3.3) - X(0.4), 200, { fill: 'earth', stroke: 'none', op: 0.12 });
      s += T((X(0.4) + X(3.3)) / 2, 24, 'in a pod, a decade', { a: 'middle', c: 'earth', sz: 11.5, w: 500 });
      s += Rect(X(142), 30, X(466) - X(142), 200, { fill: 'heat', stroke: 'none', op: 0.14 });
      s += T((X(142) + X(466)) / 2, 24, 'on the film, a decade', { a: 'middle', c: 'heat', sz: 11.5, w: 500 });
      s += Rect(X(4260), 30, X(13980) - X(4260), 200, { fill: 'heat', stroke: 'heat', op: 0.05, dash: '4 3', sw: 0.75 });
      s += T((X(4260) + X(13980)) / 2, 24, '300 years on the film', { a: 'middle', c: 'heat', sz: 11.5, w: 500 });
      mems.forEach(([name, a, b, where, open], i) => {
        const y = 62 + i * 34;
        s += T(x0 - 10, y + 4, name, { a: 'end', c: 'ink', w: 500 });
        s += Rect(X(a), y - 6, X(b) - X(a), 12, { fill: where === 'pod' ? 'ink3' : 'swarm', stroke: 'none', op: 0.9, rx: 3 });
        if (open) s += Ln(X(b), y, X(b) + 18, y, { c: 'swarm', w: 2, arrow: id });
        s += T(604, y + 4, where === 'pod' ? 'stays in pods' : 'flies on the film', { sz: 11.5, c: where === 'pod' ? 'ink2' : 'swarm', w: 500 });
      });
      for (const v of [1, 10, 100, 1000, 10000]) s += Ln(X(v), 230, X(v), 236, { c: 'ink3', w: 1 }) + T(X(v), 252, v >= 1000 ? `${v / 1000} Mrad` : `${v} krad`, { a: 'middle', sz: 11.5, c: 'ink3' });
      s += Ln(x0, 230, x1, 230, { c: 'ink3', w: 1 });
      s += T(x1, 276, 'radiation dose a memory survives (logarithmic)', { a: 'end', sz: 11.5 });
      s += T(604, 44, 'where it goes', { c: 'ink3', sz: 11.5, w: 500 });
      return s;
    }));
  },

  /** The refresh balance: what is built, what retires, what is recycled. */
  refreshLoop(el) {
    put(el, svg(720, 236, 'The refresh balance: industry adds new sails to the fleet; every year a share of the fleet retires; most of that is recycled back into industry and the rest is lost. The fleet stops growing when the loss equals what industry can add', id => {
      let s = '';
      s += Rect(30, 90, 150, 64, { fill: 'var(--wash)', stroke: 'ink', rx: 8 }) + T(105, 118, 'Industry', { a: 'middle', c: 'ink', w: 600 }) + T(105, 136, 'limited by heat', { a: 'middle', sz: 11.5 });
      s += Rect(285, 80, 170, 84, { fill: 'swarm', stroke: 'swarm', op: 0.14, rx: 8 }) + T(370, 114, 'The standing fleet', { a: 'middle', c: 'ink', w: 600 }) + T(370, 132, 'B kg of sails', { a: 'middle', sz: 11.5 });
      s += Ln(184, 112, 280, 112, { c: 'ink', w: 2, arrow: id }) + T(232, 104, 'new sails, D', { a: 'middle', sz: 11.5, c: 'ink', w: 500 });
      s += Ln(460, 122, 560, 122, { c: 'ink', w: 2, arrow: id }) + T(510, 114, 'retire, B ÷ L', { a: 'middle', sz: 11.5, c: 'ink', w: 500 }) + T(510, 140, 'each year', { a: 'middle', sz: 11 });
      s += Rect(565, 100, 120, 44, { fill: 'var(--wash)', stroke: 'ink3', rx: 8 }) + T(625, 126, 'Retired sails', { a: 'middle', c: 'ink', w: 500 });
      s += Path('M625,148 C625,200 105,200 105,158', { stroke: 'earth', sw: 2, arrow: id }) + T(365, 214, 'recycled in orbit: a share ρ', { a: 'middle', c: 'earth', sz: 11.5, w: 500 });
      s += Ln(625, 96, 625, 40, { c: 'heat', w: 2, arrow: id }) + T(632, 50, 'lost: 1 − ρ', { c: 'heat', sz: 11.5, w: 500 });
      s += T(30, 30, 'Growth stops when the loss equals what industry adds:', { c: 'ink', sz: 12.5 });
      s += T(30, 50, 'B = D × L ÷ (1 − ρ)', { c: 'ink', sz: 14, w: 600 });
      return s;
    }));
  },
};

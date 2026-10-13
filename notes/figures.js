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

  // ---------------------------------------------------------------- Mercury
  /** Mercury cut open to scale, and what each layer yields. */
  mercuryCutaway(el) {
    const R = 2439.7, Rc = 2024, crust = 35, k = 0.072;      // px per km
    const cx = 200, cy = 210;
    put(el, svg(720, 300, 'Mercury cut in half, to scale: a thin rocky crust and mantle, 416 km thick, over an iron core 2,024 km in radius that is three quarters of the planet’s mass. The rock yields 3.4×10²² kg of spacecraft, the core about 2.5×10²² kg more', id => {
      let s = '';
      const half = r => `M${cx - r * k},${cy} A${r * k},${r * k} 0 0 1 ${cx + r * k},${cy} Z`;
      s += Path(half(R), { fill: 'ink3', stroke: 'ink', sw: 1, op: 0.45 });
      s += Path(half(R - crust), { fill: 'ink3', stroke: 'none', op: 0.25 });
      s += Path(half(Rc), { fill: 'heat', stroke: 'ink', sw: 1, op: 0.35 });
      s += Ln(cx - R * k - 10, cy, cx + R * k + 10, cy, { c: 'ink', w: 1 });
      // labels
      s += Ln(cx + 40, cy - Rc * k * 0.55, 420, 96, { c: 'ink3', w: 0.75 }) + Ln(cx + 120, cy - (Rc + 200) * k * 0.86, 420, 50, { c: 'ink3', w: 0.75 });
      s += T(426, 46, 'Crust and mantle: 416 km of rock', { c: 'ink', w: 600 }) + T(426, 62, '8.0×10²² kg, 24% of Mercury, a quarter silicon', { sz: 11.5 }) + T(426, 78, '→ 3.4×10²² kg of spacecraft', { sz: 11.5, c: 'swarm', w: 500 });
      s += T(426, 100, 'Iron core: 2,024 km radius', { c: 'ink', w: 600 }) + T(426, 116, '2.5×10²³ kg, 76% of Mercury, ~6% silicon', { sz: 11.5 }) + T(426, 132, '→ 2.5×10²² kg more, at 4× the digging', { sz: 11.5, c: 'swarm', w: 500 });
      s += T(cx, cy + 22, '4,880 km across', { a: 'middle', sz: 11.5 });
      // what the swarm takes
      const bx = 426, bw = 260, by = 176;
      s += T(bx, by - 10, 'The finished swarm, 5.67×10²² kg, takes', { c: 'ink', w: 500, sz: 12 });
      const parts = [[0.24, 'ink3', 0.55], [0.76 * 0.91, 'heat', 0.45], [0.76 * 0.09, 'heat', 0.12]];
      let x = bx;
      parts.forEach(([w, c, op]) => { s += Rect(x, by, bw * w - 1, 18, { fill: c, stroke: 'none', op }); x += bw * w; });
      s += T(bx, by + 34, 'all the rock', { sz: 11.5 }) + T(bx + bw * 0.24 + 4, by + 34, '91% of the core', { sz: 11.5 });
      s += T(bx, by + 56, '93% of the planet in all', { c: 'ink', w: 600 });
      return s;
    }));
  },

  /** Heat left on Mercury per kilogram, by how the work is done, and the export each allows. */
  heatBudget(el) {
    const rows = [
      ['Dig and throw to low orbit; 99% launcher', 0.1, true],
      ['The same with a 95% launcher', 0.28],
      ['Launch all the way from the surface', 1.85],
      ['Refine on the surface too', 30],
    ];
    const x0 = 270, x1 = 520, X = v => x0 + (Math.log10(v / 0.05) / Math.log10(60 / 0.05)) * (x1 - x0);
    put(el, svg(720, 240, 'Heat left on Mercury per kilogram of rock, on a logarithmic scale, for four ways of working, with the export each allows: the less heat per kilogram, the faster the swarm can be built', id => {
      let s = '';
      s += T(x0, 20, 'Heat left per kg of rock', { c: 'ink3', sz: 11.5, w: 500 }) + T(600, 20, 'Spacecraft a year', { a: 'middle', c: 'ink3', sz: 11.5, w: 500 });
      rows.forEach(([name, q, pick], i) => {
        const y = 44 + i * 40;
        s += T(x0 - 10, y + 13, name, { a: 'end', c: pick ? 'ink' : 'ink2', w: pick ? 600 : 400, sz: 11.5 });
        s += Rect(x0, y, X(q) - x0, 18, { fill: pick ? 'heat' : 'ink3', stroke: 'none', op: pick ? 0.8 : 0.5, rx: 2 });
        s += T(X(q) + 6, y + 13, `${q < 1 ? q : q.toFixed(q < 10 ? 1 : 0)} MJ`, { sz: 11.5, c: 'ink' });
        const exportKg = (5e18 / (q * 1e6)) * 0.42 * 3.156e7;
        const e = Math.floor(Math.log10(exportKg)), m = exportKg / 10 ** e;
        s += T(600, y + 13, `${m.toFixed(1)}×10${String(e).split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join('')} kg`, { a: 'middle', sz: 11.5, c: pick ? 'ink' : 'ink2', w: pick ? 600 : 400 });
      });
      s += T(x0 - 240, 214, 'With the 5×10¹⁸ W of heat Mercury can shed and 0.42 kg of spacecraft per kg of rock. Part of the output', { c: 'ink3', sz: 11.5 }) + T(x0 - 240, 229, 'goes into factory machines, leaving 5.9×10²⁰ kg of sails a year in the central case.', { c: 'ink3', sz: 11.5 });
      return s;
    }));
  },

  /** How Mercury sheds 5×10¹⁸ W: heat pumps lift the mining heat to radiators at 1,650 K. */
  heatPump(el) {
    put(el, svg(720, 260, 'Power flow on Mercury at the heat wall: 5×10¹⁸ W of mining heat at about 500 K is lifted by heat pumps, driven by 2.3×10¹⁹ W beamed from the swarm, to radiators at 1,650 K, which shed 2.8×10¹⁹ W to space. Bare ground at 500 K could shed only 2.4×10¹⁷ W', id => {
      let s = '';
      const w = p => Math.max(3, p * 2.2);        // stroke width per 10¹⁸ W
      s += Rect(30, 120, 140, 56, { fill: 'var(--wash)', stroke: 'ink', rx: 8 }) + T(100, 144, 'Mining heat', { a: 'middle', c: 'ink', w: 600 }) + T(100, 162, '5×10¹⁸ W, ~500 K', { a: 'middle', sz: 11.5 });
      s += Rect(280, 110, 140, 76, { fill: 'swarm', stroke: 'swarm', op: 0.12, rx: 8 }) + T(350, 140, 'Heat pumps', { a: 'middle', c: 'ink', w: 600 }) + T(350, 158, 'half of Carnot', { a: 'middle', sz: 11.5 });
      s += Rect(530, 104, 160, 88, { fill: 'heat', stroke: 'heat', op: 0.15, rx: 8 }) + T(610, 138, 'Radiators', { a: 'middle', c: 'ink', w: 600 }) + T(610, 156, '1,650 K, glowing orange', { a: 'middle', sz: 11.5 }) + T(610, 172, 'the whole planet paved', { a: 'middle', sz: 11.5 });
      s += Ln(172, 148, 276, 148, { c: 'heat', w: w(5) }) + T(224, 136, '5×10¹⁸ W', { a: 'middle', sz: 11.5, c: 'ink' });
      s += Ln(350, 40, 350, 106, { c: 'swarm', w: w(23) / 2.5 }) + T(358, 34, 'work: 2.3×10¹⁹ W, beamed from the swarm', { sz: 11.5, c: 'swarm', w: 500 });
      s += Ln(422, 148, 526, 148, { c: 'heat', w: w(28) / 2.5 }) + T(474, 128, '2.8×10¹⁹ W', { a: 'middle', sz: 11.5, c: 'ink' });
      s += Ln(692, 148, 712, 148, { c: 'heat', w: 2, arrow: id });
      for (const dy of [-30, 30]) s += Ln(690, 148 + dy, 712, 148 + dy * 1.5, { c: 'heat', w: 2, arrow: id });
      s += T(30, 222, 'Without the pumps: bare ground at 500 K sheds only 2.4×10¹⁷ W, a twentieth as much.', { c: 'ink', sz: 12 });
      s += T(30, 242, 'At 2,000 K the same arithmetic gives about 9×10¹⁸ W; refractory radiators cannot go much hotter.', { c: 'ink3', sz: 11.5 });
      return s;
    }));
  },

  // ---------------------------------------------------------------- closing the sphere
  /** The shell, the cap and Earth, drawn to true scale on the Sun's side of Earth. */
  sphereLayout(el) {
    const sx = 60, sy = 235, k = 420;                     // px per AU
    const pt = (r, deg) => [sx + r * k * Math.cos((deg * Math.PI) / 180), sy - r * k * Math.sin((deg * Math.PI) / 180)];
    const arc = (r, a0, a1) => { const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1); return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r * k},${r * k} 0 0 0 ${x1.toFixed(1)},${y1.toFixed(1)}`; };
    const tan = (Math.acos(0.95) * 180) / Math.PI, cap = 23.07;
    put(el, svg(720, 474, 'The layout to true scale: the compute shell at 0.95 AU, the mirror cap at 0.98 AU spanning 23 degrees either side of the line to Earth, and Earth at 1 AU. Lines from Earth just touching the shell meet it 18 degrees from the Sun–Earth line: inside that, Earth would see the outer faces of compute sails, so that part is mirrors', id => {
      let s = '';
      s += Circ(sx, sy, 9, { fill: 'sun', stroke: 'none' }) + T(sx, sy + 26, 'Sun', { a: 'middle', c: 'sun', w: 500 });
      s += Path(arc(0.95, -33, 33), { stroke: 'swarm', sw: 3 });
      s += Path(arc(0.98, -cap, -0.6), { stroke: 'ink2', sw: 3 }) + Path(arc(0.98, 0.6, cap), { stroke: 'ink2', sw: 3 });
      const [ex, ey] = pt(1, 0);
      s += Circ(ex, ey, 5, { fill: 'earth', stroke: 'none' });
      // the Sun–Earth line and the cap's edges
      s += Ln(sx + 12, sy, ex - 7, sy, { c: 'ink3', w: 0.75, dash: '3 4' });
      for (const sg of [1, -1]) { const [x, y] = pt(1.02, sg * cap); s += Ln(sx, sy, x, y, { c: 'ink3', w: 0.75, dash: '3 4' }); }
      // lines from Earth just touching the shell
      for (const sg of [1, -1]) { const [x, y] = pt(0.95, sg * tan); s += Ln(ex, ey, x, y, { c: 'earth', w: 1.2 }) + Circ(x, y, 3, { fill: 'earth', stroke: 'none' }); }
      // labels
      const [lx1, ly1] = pt(0.95, 30); s += T(lx1 - 8, ly1 + 4, 'compute shell, 0.95 AU', { a: 'end', c: 'swarm', w: 600 });
      const [lx2, ly2] = pt(0.98, cap); s += T(lx2 + 10, ly2 - 4, 'mirror cap, 0.98 AU', { c: 'ink', w: 600 }) + T(lx2 + 10, ly2 + 12, '23° either side of Earth', { sz: 11.5 });
      s += T(ex + 10, ey + 4, 'Earth, 1 AU', { c: 'earth', w: 600 });
      s += T(ex + 10, ey + 20, 'window', { sz: 11.5 });
      const [tx, ty] = pt(0.95, -tan); s += T(tx + 14, ty + 30, 'Earth’s sight lines touch the shell', { sz: 11.5 }) + T(tx + 14, ty + 45, '18° from the Sun–Earth line: inside', { sz: 11.5 }) + T(tx + 14, ty + 60, 'that, Earth sees the outer face', { sz: 11.5 });
      s += T(20, 462, 'True scale. The two layers are 4.5 million km apart; Earth is 3 million km beyond the mirrors.', { c: 'ink3', sz: 11.5 });
      return s;
    }));
  },

  /** Bands on a sphere, rendered pixel by pixel: random orbits leave gaps; bands sharing an axis close it. */
  bandsRender(el) {
    const N = 6, hw = Math.PI / (2 * N);                 // six bands of total width π
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const randAxis = () => { const z = 2 * rnd() - 1, ph = 2 * Math.PI * rnd(), r = Math.sqrt(1 - z * z); return [r * Math.cos(ph), r * Math.sin(ph), z]; };
    const sets = [
      { title: 'Six orbits, at random', axes: Array.from({ length: N }, randAxis) },
      { title: 'Six orbits sharing an axis', axes: Array.from({ length: N }, (_, i) => [Math.cos((i * Math.PI) / N), Math.sin((i * Math.PI) / N), 0]) },
    ];
    const css = getComputedStyle(document.documentElement);
    const rgb = v => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = css.getPropertyValue(v).trim() || '#888'; const hx = c.fillStyle; return [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16)); };
    const paper = rgb('--paper'), swarm = rgb('--swarm'), sun = rgb('--sun');
    const gap = sun.map((c, j) => paper[j] + (c - paper[j]) * 0.3);
    const S = 300, dpr = Math.min(2, window.devicePixelRatio || 1), n = Math.round(S * dpr);
    const tilt = (25 * Math.PI) / 180, ct = Math.cos(tilt), st = Math.sin(tilt);
    el.innerHTML = `<div class="bands">${sets.map((q, i) => `<div><canvas width="${n}" height="${n}" aria-label="${q.title}"></canvas><p><b>${q.title}</b><span id="bands-${i}"></span></p></div>`).join('')}</div>
      <div class="legend" style="margin-top:0.9rem;justify-content:center"><span><i style="background:rgb(${gap.map(Math.round)});height:8px;width:12px"></i>gap: sunlight escapes</span><span><i style="background:rgb(${swarm});opacity:0.35;height:8px;width:12px"></i>one layer</span><span><i style="background:rgb(${swarm});opacity:0.7;height:8px;width:12px"></i>two</span><span><i style="background:rgb(${swarm});height:8px;width:12px"></i>three or more: idle sails</span></div>`;
    el.querySelectorAll('canvas').forEach((cv, i) => {
      const ctx = cv.getContext('2d'), img = ctx.createImageData(n, n), d = img.data, axes = sets[i].axes;
      let cov = 0, tot = 0;
      for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
        const x = (2 * (px + 0.5)) / n - 1, y = 1 - (2 * (py + 0.5)) / n, r2 = x * x + y * y, o = 4 * (py * n + px);
        if (r2 > 1) { d[o + 3] = 0; continue; }
        const z = Math.sqrt(1 - r2);
        // view from 25° above the equator: rotate about x
        const v = [x, y * ct + z * st, -y * st + z * ct];
        let c = 0;
        for (const a of axes) if (Math.abs(a[0] * v[0] + a[1] * v[1] + a[2] * v[2]) < Math.sin(hw)) c++;
        tot++; if (c) cov++;
        const shade = 0.75 + 0.25 * z;
        const col = c === 0 ? gap : c === 1 ? swarm.map((s, j) => paper[j] + (s - paper[j]) * 0.35) : c === 2 ? swarm.map((s, j) => paper[j] + (s - paper[j]) * 0.7) : swarm;
        d[o] = col[0] * shade; d[o + 1] = col[1] * shade; d[o + 2] = col[2] * shade; d[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      // the share of the whole sphere covered, by sampling it evenly
      let hit = 0; const M = 20000;
      for (let k = 0; k < M; k++) { const zz = 1 - (2 * (k + 0.5)) / M, rr = Math.sqrt(1 - zz * zz), ph = k * 2.399963; const v = [rr * Math.cos(ph), rr * Math.sin(ph), zz]; if (axes.some(a => Math.abs(a[0] * v[0] + a[1] * v[1] + a[2] * v[2]) < Math.sin(hw))) hit++; }
      el.querySelector(`#bands-${i}`).textContent = ` covers ${Math.round((100 * hit) / M)}% of the sky`;
    });
  },

  /** The closed sphere in cross-section: light goes out to the shell, the fronts trade it, heat leaves through the backs. */
  sphereFlow(el) {
    const cx = 200, cy = 210, r = 140;
    put(el, svg(720, 420, 'The closed sphere in cross-section, not to scale: sunlight travels out to the shell; light and heat that a front gives off cross the hollow middle to other fronts, so they are not lost; the only way out is through the sails’ backs, and through the window, where mirrors in the cap turn edge-on', id => {
      let s = '';
      s += Circ(cx, cy, r, { stroke: 'swarm', sw: 5 });
      s += Arc(cx, cy, r + 12, -23, 23, { stroke: 'ink2', sw: 5 });
      s += Circ(cx, cy, 16, { fill: 'sun', stroke: 'none' });
      for (const a of [60, 110, 160, 200, 250, 300]) {
        const c = Math.cos((a * Math.PI) / 180), sn = Math.sin((a * Math.PI) / 180);
        s += Ln(cx + 22 * c, cy + 22 * sn, cx + (r - 8) * c, cy + (r - 8) * sn, { c: 'sun', w: 1.6, arrow: id });
        s += Ln(cx + (r + 6) * c, cy + (r + 6) * sn, cx + (r + 50) * c, cy + (r + 50) * sn, { c: 'heat', w: 2.2, arrow: id });
      }
      // fronts trade light across the middle
      s += Path(`M${cx - 104},${cy - 104} Q${cx - 20},${cy - 40} ${cx + 30},${cy + 144}`, { stroke: 'heat', sw: 1.2, dash: '3 3', arrow: id });
      s += Path(`M${cx - 140},${cy + 50} Q${cx},${cy + 30} ${cx + 120},${cy - 88}`, { stroke: 'heat', sw: 1.2, dash: '3 3', arrow: id });
      // the window
      s += Ln(cx + 24, cy, cx + r + 48, cy, { c: 'sun', w: 2, arrow: id });
      s += Circ(cx + r + 66, cy, 7, { fill: 'earth', stroke: 'none' }) + T(cx + r + 66, cy + 24, 'Earth', { a: 'middle', c: 'earth', w: 500 });
      s += T(cx + r + 20, cy - 70, 'mirror cap', { c: 'ink', w: 500, sz: 11.5 });
      // labels
      const L = 500;
      s += Ln(L - 8, 66, L - 30, 66, { c: 'sun', w: 2 }) + T(L, 70, 'Sunlight goes out to the shell', { c: 'ink', w: 500 });
      s += Ln(L - 8, 110, L - 30, 110, { c: 'heat', w: 1.2, dash: '3 3' }) + T(L, 106, 'What a front gives off crosses', { c: 'ink', w: 500 }) + T(L, 122, 'the middle to another front', { c: 'ink', w: 500 });
      s += Ln(L - 8, 162, L - 30, 162, { c: 'heat', w: 2.2 }) + T(L, 158, 'So all the heat leaves', { c: 'ink', w: 500 }) + T(L, 174, 'through the backs: 419 K', { c: 'ink', w: 500 });
      s += Ln(L - 8, 214, L - 30, 214, { c: 'ink2', w: 5 }) + T(L, 210, 'Mirrors return their light', { c: 'ink', w: 500 }) + T(L, 226, 'and show Earth a cold back', { c: 'ink', w: 500 });
      s += T(L, 270, 'Only Earth’s window lets light out:', { sz: 11.5 }) + T(L, 286, '5 billionths of the Sun’s output.', { sz: 11.5 });
      s += T(20, 410, 'Not to scale.', { c: 'ink3', sz: 11.5 });
      return s;
    }));
  },

  /** Why Earth's window is 20,300 km in radius: Earth's own size plus the Sun's width over 3 million km. */
  windowGeometry(el) {
    put(el, svg(720, 260, 'Why Earth’s window is 20,300 km in radius: every point on Earth must see the whole Sun through it, so the window is Earth’s radius plus the spread of the Sun’s half-degree disc over the 3 million km from the cap to Earth', id => {
      let s = '';
      const sunX = 70, capX = 470, eX = 650, cy = 130;
      s += Circ(sunX, cy, 60, { fill: 'sun', stroke: 'none', op: 0.85 }) + T(sunX, cy + 84, 'the Sun', { a: 'middle', c: 'sun', w: 500 });
      s += Circ(eX, cy, 22, { fill: 'earth', stroke: 'none', op: 0.85 }) + T(eX, cy + 46, 'Earth', { a: 'middle', c: 'earth', w: 500 });
      // the cap with its window
      const wR = 54;
      s += Ln(capX, 14, capX, cy - wR, { c: 'ink2', w: 5 }) + Ln(capX, cy + wR, capX, 246, { c: 'ink2', w: 5 });
      for (let y = cy - wR + 6; y < cy + wR; y += 12) s += Ln(capX - 5, y, capX + 5, y, { c: 'ink3', w: 1.5 });
      s += T(capX - 8, 24, 'the cap', { a: 'end', c: 'ink', w: 500 });
      // rays: the Sun's top edge to Earth's bottom, the bottom edge to the top
      s += Ln(sunX, cy - 60, eX, cy + 22, { c: 'sun', w: 1.2 }) + Ln(sunX, cy + 60, eX, cy - 22, { c: 'sun', w: 1.2 });
      s += Ln(sunX, cy - 60, eX, cy - 22, { c: 'sun', w: 0.6, dash: '3 4' }) + Ln(sunX, cy + 60, eX, cy + 22, { c: 'sun', w: 0.6, dash: '3 4' });
      // dimensions
      s += Ln(capX + 16, cy, capX + 16, cy - wR, { c: 'ink', w: 1, arrow: id, both: true }) + Ln(capX + 16, cy - wR / 2, capX + 40, 52, { c: 'ink3', w: 0.75 }) + T(capX + 44, 44, 'window radius 20,300 km', { c: 'ink', w: 600 });
      s += Ln(capX, 236, eX, 236, { c: 'ink3', w: 1, arrow: id, both: true }) + T((capX + eX) / 2, 228, '3 million km', { a: 'middle', sz: 11.5 });
      s += T(capX + 44, 60, '= Earth’s radius, 6,400 km', { sz: 11.5 }) + T(capX + 44, 75, '+ 0.27° × 3 million km', { sz: 11.5 });
      s += T(20, 254, 'Not to scale: the Sun’s width is exaggerated so the rays can be seen.', { c: 'ink3', sz: 11.5 });
      return s;
    }));
  },

  // ---------------------------------------------------------------- Earth
  /** What each line of sight from Earth meets, drawn to true scale. */
  whatEarthSees(el) {
    const sx = 190, sy = 210, k = 165;                     // px per AU, true scale
    const pt = (r, deg) => [sx + r * k * Math.cos((deg * Math.PI) / 180), sy - r * k * Math.sin((deg * Math.PI) / 180)];
    const [ex, ey] = pt(1, 0);
    put(el, svg(720, 420, 'Left, to true scale: a line of sight from Earth 45 degrees from the Sun passes the mirrors and crosses the hollow sphere to its far side. Right, Earth’s sky toward the Sun: within 72 degrees of the Sun lines end on the far side’s sunlit sails, which glow while the sphere is open; from 72 to 78 degrees only the mirrors; beyond, the open sky', id => {
      let s = '';
      // left: true-scale cross-section with one line of sight
      const arc = (r, a0, a1, o) => { const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1); return Path(`M${x0.toFixed(1)},${y0.toFixed(1)} A${r * k},${r * k} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 0 ${x1.toFixed(1)},${y1.toFixed(1)}`, o); };
      s += arc(0.95, 23, 337, { stroke: 'swarm', sw: 3 }) + arc(0.98, -23, 23, { stroke: 'ink2', sw: 3 });
      s += Circ(sx, sy, 6, { fill: 'sun', stroke: 'none' }) + T(sx, sy + 20, 'Sun', { a: 'middle', c: 'sun', sz: 11.5, w: 500 });
      s += Ln(ex, ey, sx + 8, sy, { c: 'sun', w: 1, dash: '3 4' });
      // a ray at 45° from the Sun direction, to the far side of the shell
      const d = [-Math.cos(Math.PI / 4), -Math.sin(Math.PI / 4)], ox = ex - sx, oy = ey - sy, R = 0.95 * k, b = ox * d[0] + oy * d[1], t = -b + Math.sqrt(b * b - (ox * ox + oy * oy - R * R));
      s += Ln(ex, ey, ex + t * d[0], ey + t * d[1], { c: 'swarm', w: 1.6 }) + Circ(ex + t * d[0], ey + t * d[1], 4, { fill: 'swarm', stroke: 'none' });
      s += T(ex + t * d[0] + 10, ey + t * d[1] - 6, 'far side: sunlit sails', { c: 'swarm', sz: 11.5, w: 500 });
      s += Circ(ex, ey, 4, { fill: 'earth', stroke: 'none' }) + T(ex + 8, ey + 18, 'Earth', { c: 'earth', w: 600, sz: 11.5 });
      s += T(ex - 14, ey - 74, 'mirrors', { a: 'end', sz: 11.5, halo: true });
      s += T(20, 404, 'Left: true scale. Right: Earth’s sky on the Sun’s side.', { c: 'ink3', sz: 11.5 });
      // right: the sky from Earth, angles from the Sun's direction
      const cx = 600, cy = 330, r = 210;
      const wedge = (a0, a1, fill, op) => { const p = a => [cx - r * Math.cos((a * Math.PI) / 180), cy - r * Math.sin((a * Math.PI) / 180)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return Path(`M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`, { fill, stroke: 'none', op }); };
      s += wedge(0, 71.8, 'swarm', 0.22) + wedge(71.8, 78.5, 'ink3', 0.35) + wedge(78.5, 110, 'var(--wash)', 1);
      const ray = a => [cx - r * Math.cos((a * Math.PI) / 180), cy - r * Math.sin((a * Math.PI) / 180)];
      for (const a of [71.8, 78.5]) { const [x, y] = ray(a); s += Ln(cx, cy, x, y, { c: 'ink3', w: 0.8 }); }
      s += Circ(cx - r - 10, cy, 7, { fill: 'sun', stroke: 'none' }) + T(cx - r - 10, cy + 22, 'toward the Sun', { a: 'middle', c: 'sun', sz: 11.5 });
      s += Circ(cx, cy, 4, { fill: 'earth', stroke: 'none' }) + T(cx + 8, cy + 18, 'you, on Earth', { c: 'earth', sz: 11.5, w: 500 });
      const lab = (a, lines, c = 'ink') => { const [x, y] = [cx - 0.62 * r * Math.cos((a * Math.PI) / 180), cy - 0.62 * r * Math.sin((a * Math.PI) / 180)]; lines.forEach((ln, i) => { s += T(x, y + i * 14, ln, { a: 'middle', c: i ? 'ink2' : c, w: i ? 400 : 600, sz: 11.5, halo: true }); }); };
      lab(36, ['0–72°', 'the far side glows', 'black once closed'], 'swarm');
      const [qx, qy] = ray(75); s += Ln(qx, qy, qx - 30, qy - 26, { c: 'ink3', w: 0.75 }) + T(qx - 34, qy - 40, '72–78°', { a: 'end', c: 'ink', w: 600, sz: 11.5 }) + T(qx - 34, qy - 26, 'mirrors only', { a: 'end', sz: 11.5 });
      lab(96, ['beyond 78°', 'open sky']);
      return s;
    }));
  },

  /** Why reflected sunlight cannot be focused smaller than the Sun's angle allows. */
  etendue(el) {
    put(el, svg(720, 270, 'A mirror reflecting sunlight onto the ground: light from the two edges of the Sun’s disc arrives half a degree apart, so the reflected beam spreads by half a degree and the spot on the ground is at least the distance times 0.0093', id => {
      let s = '';
      const mx = 260, my = 70, gy = 230;
      s += Circ(60, 50, 26, { fill: 'sun', stroke: 'none', op: 0.85 }) + T(60, 96, 'the Sun, 0.53° wide', { a: 'middle', c: 'sun', sz: 11.5, w: 500 });
      s += Ln(60, 24, mx, my, { c: 'sun', w: 1.2 }) + Ln(60, 76, mx, my, { c: 'sun', w: 1.2 });
      s += Path(`M${mx - 26},${my - 10} L${mx + 26},${my + 10}`, { stroke: 'ink', sw: 4 }) + T(mx + 20, my - 16, 'a mirror in orbit', { c: 'ink', w: 500 });
      s += Ln(mx, my, mx - 40, gy, { c: 'sun', w: 1.2 }) + Ln(mx, my, mx + 40, gy, { c: 'sun', w: 1.2 });
      s += Path(`M${mx - 40},${gy} L${mx + 40},${gy}`, { stroke: 'sun', sw: 6 });
      s += Ln(20, gy, 700, gy, { c: 'ink3', w: 1 }) + T(30, gy + 20, 'the ground', { sz: 11.5 });
      s += Ln(mx + 60, my, mx + 60, gy, { c: 'ink3', w: 1, arrow: id, both: true }) + T(mx + 68, (my + gy) / 2, 'height d', { sz: 11.5 });
      s += T(mx, gy + 22, 'spot ≥ 0.0093 d', { a: 'middle', c: 'ink', w: 600 });
      const rows = [['from the mirrors, 3 million km', '28,000 km'], ['from L1, 1.5 million km', '14,000 km'], ['from 10,000 km up', '90 km'], ['from 1,000 km up', '9 km']];
      s += T(440, 64, 'Smallest spot of reflected sunlight', { c: 'ink', w: 600 });
      rows.forEach(([a, b], i) => { s += T(440, 90 + i * 22, a, { sz: 11.5 }) + T(700, 90 + i * 22, b, { a: 'end', c: 'ink', w: 600, sz: 11.5 }); });
      s += T(440, 196, 'A laser has no such limit: from 3 million km,', { sz: 11.5 }) + T(440, 211, 'a 1 km beam director makes a 7 m spot.', { sz: 11.5 });
      return s;
    }));
  },

  /** Making rain: warm the sea upwind, then trigger the rain where it is wanted. */
  rainMaking(el) {
    put(el, svg(720, 290, 'Making rain in two steps: a beam warms the sea so that more water evaporates and the wind carries the moist air inland; there, a beam at a wavelength water vapour absorbs heats a column of air, which rises, cools and rains', id => {
      let s = '';
      const gy = 230;
      s += Rect(20, gy, 300, 40, { fill: 'earth', stroke: 'none', op: 0.25 }) + T(40, gy + 26, 'the sea', { c: 'earth', w: 500 });
      s += Path(`M320,${gy} L700,${gy} L700,270 L320,270 Z`, { fill: 'ink3', stroke: 'none', op: 0.25 }) + T(680, gy + 26, 'land', { a: 'end', c: 'ink', w: 500 });
      // beam 1 onto the sea
      s += Ln(120, 10, 150, gy - 4, { c: 'sun', w: 3, arrow: id }) + T(128, 26, '1. light warms the sea', { c: 'sun', w: 600, sz: 11.5 });
      for (const dx of [130, 160, 190]) s += Path(`M${dx},${gy - 6} q-8,-20 0,-40 q8,-20 0,-40`, { stroke: 'earth', sw: 1.4, dash: '3 3' });
      s += T(200, 150, 'more water evaporates', { c: 'earth', sz: 11.5 });
      // wind carries it inland
      s += Ln(230, 110, 420, 110, { c: 'ink2', w: 2, arrow: id }) + T(325, 100, 'the wind carries it inland', { a: 'middle', sz: 11.5 });
      // beam 2: infrared heats the air column
      s += Rect(470, 70, 60, gy - 70, { fill: 'heat', stroke: 'none', op: 0.12 });
      s += Ln(560, 10, 512, 150, { c: 'heat', w: 3, arrow: id }) + T(712, 22, '2. infrared that the air absorbs', { a: 'end', c: 'heat', w: 600, sz: 11.5, halo: true }) + T(712, 37, 'warms a column a few degrees', { a: 'end', c: 'heat', sz: 11.5 });
      s += Ln(500, 200, 500, 80, { c: 'ink', w: 2, arrow: id }) + T(458, 176, 'it rises', { a: 'end', sz: 11.5 }) + T(458, 191, 'and cools', { a: 'end', sz: 11.5 });
      // cloud and rain
      s += Path('M455,72 q10,-26 35,-18 q14,-22 40,-6 q26,-4 26,20 q-2,16 -26,14 l-58,0 q-24,0 -17,-10 z', { fill: 'var(--wash)', stroke: 'ink2', sw: 1.4 });
      for (const dx of [470, 490, 510, 530]) s += Ln(dx, 92, dx - 6, 116, { c: 'earth', w: 1.6 });
      s += T(556, 128, 'rain, where', { c: 'earth', w: 600, sz: 11.5 }) + T(556, 143, 'it is wanted', { c: 'earth', w: 600, sz: 11.5 });
      s += T(20, 286, 'A metre of rain a year over ten million km² takes about 8×10¹⁴ W, two trillionths of the Sun.', { c: 'ink3', sz: 11.5 });
      return s;
    }));
  },
};

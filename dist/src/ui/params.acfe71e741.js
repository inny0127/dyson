import { sci } from '../util/format.49a4deeddc.js';

function fmt(spec, v) {
  if (spec.options) return v;
  if (v === null || v === undefined) return 'measured table';
  if (spec.key === 'seedYear') return String(Math.round(v));
  if (spec.unit === '' && v <= 1) return `${(v * 100).toFixed(spec.step && spec.step < 0.01 ? 1 : 0)}%`;
  if (spec.unit === '/K') return `${(v * 100).toFixed(2)} %/K`;
  if (spec.unit === 'K') return `${v} K`;
  if (spec.unit === '°C') return `${Math.round(v)} °C`;
  return `${sci(v, 3)} ${spec.unit}`;
}

/**
 * Builds the Assumptions drawer from the model's PARAMS. Returns { sync, rebind }: sync pushes
 * external changes into the inputs; rebind points the inputs at a new params object.
 */
export function renderParams(root, specs, params, onChange) {
  root.innerHTML = '';
  const ref = { params };
  const inputs = new Map();
  let group = null;
  for (const spec of specs) {
    if (spec.group !== group) {
      group = spec.group;
      const g = document.createElement('div');
      g.className = 'param-group';
      g.textContent = group;
      root.appendChild(g);
    }
    const wrap = document.createElement('div');
    wrap.className = 'param';
    const id = `p-${spec.key}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.innerHTML = `<span>${spec.label}</span><output></output>`;
    const out = label.querySelector('output');
    wrap.appendChild(label);
    let input;
    if (spec.options) {
      input = document.createElement('select');
      for (const o of spec.options) {
        const opt = document.createElement('option');
        opt.value = o; opt.textContent = o;
        input.appendChild(opt);
      }
      input.addEventListener('change', () => { ref.params[spec.key] = input.value; out.textContent = fmt(spec, input.value); onChange(); });
    } else {
      input = document.createElement('input');
      input.type = 'range';
      if (spec.log) {
        input.min = String(Math.log10(spec.min));
        input.max = String(Math.log10(spec.max));
        input.step = '0.01';
      } else {
        input.min = String(spec.min); input.max = String(spec.max); input.step = String(spec.step ?? 'any');
      }
      input.addEventListener('input', () => {
        const raw = Number(input.value);
        ref.params[spec.key] = spec.log ? 10 ** raw : raw;
        out.textContent = fmt(spec, ref.params[spec.key]);
        onChange();
      });
    }
    input.id = id;
    wrap.appendChild(input);
    if (spec.help) {
      const hlp = document.createElement('div');
      hlp.className = 'help';
      hlp.textContent = spec.help;
      wrap.appendChild(hlp);
    }
    root.appendChild(wrap);
    inputs.set(spec.key, { input, out, spec });
  }

  function sync() {
    for (const { input, out, spec } of inputs.values()) {
      const v = ref.params[spec.key];
      if (spec.options) input.value = v;
      else if (v !== null && v !== undefined) input.value = String(spec.log ? Math.log10(v) : v);
      else input.value = String(spec.key === 'hotLogicSlope' ? 0.0091 : spec.value);   // 2026: measured table, ~0.9 %/K
      out.textContent = fmt(spec, v);
    }
  }
  sync();
  return { sync, rebind(p) { ref.params = p; sync(); } };
}

import { sci } from '../util/format.js';

function fmt(spec, v) {
  if (spec.options) return v;
  if (spec.unit === '' && v <= 1) return `${(v * 100).toFixed(spec.step && spec.step < 0.01 ? 1 : 0)}%`;
  if (spec.unit === '/K') return `${(v * 100).toFixed(2)} %/K`;
  if (spec.unit === 'K') return `${Math.round(v)} K (${Math.round(v - 273.15)} °C)`;
  return `${sci(v, 2)} ${spec.unit}`;
}

/**
 * Builds the Assumptions drawer. Returns { sync } to push external param changes back into the inputs.
 */
export function renderParams(root, specs, params, onChange) {
  root.innerHTML = '';
  const inputs = new Map();
  let group = null;
  for (const spec of specs) {
    if (spec.key === 'year') continue;
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
      input.addEventListener('change', () => { params[spec.key] = input.value; out.textContent = fmt(spec, input.value); onChange(); });
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
        params[spec.key] = spec.log ? 10 ** raw : raw;
        out.textContent = fmt(spec, params[spec.key]);
        onChange();
      });
    }
    input.id = id;
    wrap.appendChild(input);
    if (spec.help) {
      const h = document.createElement('div');
      h.className = 'help';
      h.textContent = spec.help;
      wrap.appendChild(h);
    }
    root.appendChild(wrap);
    inputs.set(spec.key, { input, out, spec });
  }

  function sync() {
    for (const { input, out, spec } of inputs.values()) {
      const v = params[spec.key];
      input.value = spec.options ? v : String(spec.log ? Math.log10(v) : v);
      out.textContent = fmt(spec, v);
    }
  }
  sync();
  return { sync };
}

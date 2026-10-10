// HTML labels pinned to 3D points. Scenes call begin(), put() for each label
// they want this frame, then end(camera) positions them and hides the rest.

export function createLabels(container) {
  const pool = new Map();
  let used = new Set();
  let size = { w: 1, h: 1 };

  function el(key, cls) {
    let e = pool.get(key);
    if (!e) {
      e = document.createElement('div');
      e.className = 'lbl';
      container.appendChild(e);
      pool.set(key, e);
    }
    e.className = `lbl ${cls || ''}`;
    return e;
  }

  const pending = [];

  return {
    resize(w, h) { size = { w, h }; },
    begin() { used = new Set(); pending.length = 0; },
    /**
     * @param {string} key stable id
     * @param {{x:number,y:number,z:number}} pos world position (THREE.Vector3)
     * @param {string} html label content
     * @param {string} [cls] extra class names
     */
    put(key, pos, html, cls) {
      used.add(key);
      pending.push({ key, pos: pos.clone(), html, cls });
    },
    end(camera) {
      for (const { key, pos, html, cls } of pending) {
        const e = el(key, cls);
        if (e._html !== html) { e.innerHTML = html; e._html = html; }
        const p = pos.project(camera);
        const visible = p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2;
        e.hidden = !visible;
        if (visible) {
          const x = (p.x * 0.5 + 0.5) * size.w;
          const y = (-p.y * 0.5 + 0.5) * size.h;
          e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
      }
      for (const [key, e] of pool) if (!used.has(key)) e.hidden = true;
    },
    clear() {
      for (const e of pool.values()) e.remove();
      pool.clear();
    },
  };
}

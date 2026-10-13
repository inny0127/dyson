// Site chrome shared by the main page and the technical notes: the list of notes for the menus, the
// navigation bar (clear over the hero, solid below it, tucked away while scrolling down on narrow
// screens), a reading-progress line, a back-to-top button, and full-screen viewing of photographs.

export const NOTES = [
  ['sail.html', 'The compute sail', 'One satellite, layer by layer'],
  ['compute.html', 'Chips in the film', 'Why the computer is spread through the panel'],
  ['hardware.html', 'Hardware after 2095', 'What the swarm is actually built with'],
  ['mercury.html', 'Taking Mercury apart', 'Rock, heat and the pace of the build'],
  ['sphere.html', 'Closing the sphere', 'Orbits, overlap, heat and windows'],
  ['earth.html', 'Earth inside the swarm', 'Heat, night sky and a climate by design'],
  ['pictures.html', 'How the pictures were made', 'Light, air and cameras'],
];

const CSS = `
.to-top { position: fixed; right: max(1rem, 2vw); bottom: max(1rem, 2.5vh); z-index: 45; width: 2.75rem; height: 2.75rem; border-radius: 50%; border: 1px solid var(--rule); background: var(--paper); color: var(--ink); box-shadow: 0 4px 18px rgb(0 0 0 / 0.12); cursor: pointer; display: grid; place-items: center; opacity: 0; transform: translateY(0.6rem); pointer-events: none; transition: opacity 0.2s, transform 0.2s; }
.to-top.on { opacity: 1; transform: none; pointer-events: auto; }
.to-top:hover { border-color: var(--ink); }
.to-top svg { width: 1.1rem; height: 1.1rem; }
.lightbox { position: fixed; inset: 0; z-index: 60; background: rgb(2 3 4 / 0.94); display: grid; grid-template-rows: 1fr auto; place-items: center; padding: 3vh 2vw 2vh; cursor: zoom-out; animation: lb-in 0.18s ease-out; }
.lightbox img { max-width: 96vw; max-height: 84vh; object-fit: contain; box-shadow: 0 10px 50px rgb(0 0 0 / 0.5); }
.lightbox p { margin: 0.9rem 0 0; max-width: 46rem; color: #d9d7d2; font: 400 0.875rem/1.5 var(--sans); text-align: center; }
.lightbox button { position: absolute; top: 1rem; right: 1rem; width: 2.5rem; height: 2.5rem; border-radius: 50%; border: 1px solid rgb(255 255 255 / 0.3); background: none; color: #fff; font: 400 1.25rem/1 var(--sans); cursor: pointer; }
.plate img { cursor: zoom-in; }
@keyframes lb-in { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .lightbox { animation: none; } .to-top { transition: none; } }
`;

/**
 * Wire up the chrome. notesBase: the path from this page to the notes ('' inside notes/,
 * 'notes/' from the main page). current: this page's note file, if any.
 */
export function siteChrome({ notesBase = '', current = null } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // the notes menus
  for (const ol of document.querySelectorAll('[data-notes-menu], #notes-menu')) {
    ol.innerHTML = NOTES.map(([file, title, dek]) =>
      `<li><a href="${notesBase}${file}"${file === current ? ' aria-current="page"' : ''}>${title}<span>${dek}</span></a></li>`).join('');
  }
  // menus close on a choice, a click elsewhere, or Escape
  const menus = [...document.querySelectorAll('details.menu')];
  const closeAll = except => menus.forEach(m => { if (m !== except) m.open = false; });
  document.addEventListener('click', e => closeAll(menus.find(m => m.contains(e.target))));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
  for (const m of menus) m.addEventListener('click', e => { if (e.target.closest('a')) m.open = false; });

  // the bar: solid once past the hero, tucked away while scrolling down on narrow screens
  const bar = document.querySelector('[data-nav]');
  const hero = document.querySelector('.hero');
  const progress = document.createElement('div');
  progress.className = 'nav-progress'; progress.setAttribute('aria-hidden', 'true'); progress.innerHTML = '<i></i>';
  bar?.appendChild(progress);
  const fill = progress.firstChild;

  const top = document.createElement('button');
  top.className = 'to-top'; top.setAttribute('aria-label', 'Back to top'); top.title = 'Back to top';
  top.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  top.addEventListener('click', () => {
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    (bar?.querySelector('a') ?? document.body).focus?.({ preventScroll: true });
  });
  document.body.appendChild(top);

  let lastY = scrollY, ticking = false;
  const narrow = matchMedia('(max-width: 1199px)');
  const onScroll = () => {
    ticking = false;
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    fill.style.width = `${max > 0 ? Math.min(100, (100 * y) / max) : 0}%`;
    top.classList.toggle('on', y > innerHeight * 1.2);
    if (!bar) return;
    if (hero) bar.classList.toggle('solid', y > hero.offsetHeight - bar.offsetHeight - 1);
    const menuOpen = menus.some(m => m.open && bar.contains(m));
    const away = narrow.matches && !menuOpen && y > lastY + 4 && y > (hero ? hero.offsetHeight : 200);
    const back = y < lastY - 4 || y < 80;
    if (away) { bar.classList.add('away'); document.body.classList.add('nav-away'); }
    else if (back) { bar.classList.remove('away'); document.body.classList.remove('nav-away'); }
    lastY = y;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  // photographs: click to see them full-screen, with their caption
  document.addEventListener('click', e => {
    const img = e.target.closest('.plate img');
    if (!img) return;
    const cap = img.closest('figure')?.querySelector('figcaption b')?.textContent
      ?? img.closest('figure')?.querySelector('figcaption')?.firstChild?.textContent ?? img.alt;
    const box = document.createElement('div');
    box.className = 'lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', img.alt);
    box.innerHTML = `<img src="${img.currentSrc || img.src}" alt="${img.alt.replace(/"/g, '&quot;')}"><p></p><button aria-label="Close">×</button>`;
    box.querySelector('p').textContent = cap || '';
    const close = () => { box.remove(); document.removeEventListener('keydown', esc); img.focus?.(); };
    const esc = ev => { if (ev.key === 'Escape') close(); };
    box.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    document.body.appendChild(box);
    box.querySelector('button').focus();
  });
}

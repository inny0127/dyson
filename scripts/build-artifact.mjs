// Stage the app for publishing as a claude.ai Artifact: the host wraps the page in its own
// <!doctype>/<html>/<head>/<body>, so strip ours and keep everything else as-is. With --site, keep
// the whole document, for a static host such as GitHub Pages.
// Usage: node scripts/build-artifact.mjs <outDir> [--site]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const site = args.includes('--site');
const out = resolve(args.find(a => !a.startsWith('--')) || join(root, 'dist'));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let html = readFileSync(join(root, 'index.html'), 'utf8');
if (!site) html = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
// the <title> must lead the file (only the first 8 KB is scanned)
const title = html.match(/<title>.*?<\/title>/)[0];
if (!site) html = `${title}\n${html.replace(title, '')}`;
writeFileSync(join(out, 'index.html'), html);

// Every script and photograph is published under a content-stamped name (app.3f2a9c1b0d.js), so a
// changed file always has a new URL and no browser can keep using a stale copy.
const hash = buf => createHash('sha1').update(buf).digest('hex').slice(0, 10);
const files = {};
const named = new Map();
function nameOf(rel) {
  if (named.has(rel)) return named.get(rel);
  let src = readFileSync(join(root, rel), 'utf8');
  // relative imports point at the dependencies' stamped names (dependencies first)
  src = src.replace(/(\bfrom\s*['"]|\bimport\s*\(\s*['"]|\bimport\s+['"])(\.{1,2}\/[^'"]+\.js)(['"])/g, (m, a, spec, b) => {
    const dep = relative(root, resolve(dirname(join(root, rel)), spec));
    let r = relative(dirname(rel), nameOf(dep));
    if (!r.startsWith('.')) r = `./${r}`;
    return a + r + b;
  });
  const name = rel.replace(/\.js$/, `.${hash(src)}.js`);
  mkdirSync(dirname(join(out, name)), { recursive: true });
  writeFileSync(join(out, name), src);
  files[name] = join(out, name);
  named.set(rel, name);
  return name;
}
const app = nameOf('src/app.js');
html = html.replace('src="src/app.js"', `src="${app}"`);
// photographs the page shows
for (const name of readdirSync(join(root, 'renders'))) {
  if (!name.endsWith('.jpg')) continue;
  const buf = readFileSync(join(root, 'renders', name));
  const stamped = join('renders', name.replace(/\.jpg$/, `.${hash(buf)}.jpg`));
  if (!html.includes(`renders/${name}"`)) continue;            // only what the page uses
  html = html.split(`renders/${name}"`).join(`${stamped}"`);
  mkdirSync(join(out, 'renders'), { recursive: true });
  copyFileSync(join(root, 'renders', name), join(out, stamped));
  files[stamped] = join(out, stamped);
}
writeFileSync(join(out, 'index.html'), html);
if (site) writeFileSync(join(out, '.nojekyll'), '');                // serve files as they are
else writeFileSync(join(out, 'files.json'), JSON.stringify(files, null, 2));
console.log(`staged ${Object.keys(files).length + 1} files in ${out}`);

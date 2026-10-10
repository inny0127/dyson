// Stage the app for publishing as a claude.ai Artifact: the host wraps the page in its own
// <!doctype>/<html>/<head>/<body>, so strip ours and keep everything else as-is.
// Usage: node scripts/build-artifact.mjs <outDir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'dist'));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html
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
html = `${title}\n${html.replace(title, '')}`;
writeFileSync(join(out, 'index.html'), html);

const files = {};
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) {
      const rel = relative(root, p);
      mkdirSync(dirname(join(out, rel)), { recursive: true });
      copyFileSync(p, join(out, rel));
      files[rel] = join(out, rel);
    }
  }
}
walk(join(root, 'src'));
// photographs the page shows
for (const name of readdirSync(join(root, 'renders'))) {
  if (!name.endsWith('.jpg')) continue;
  const rel = join('renders', name);
  mkdirSync(join(out, 'renders'), { recursive: true });
  copyFileSync(join(root, rel), join(out, rel));
  files[rel] = join(out, rel);
}
writeFileSync(join(out, 'files.json'), JSON.stringify(files, null, 2));
console.log(`staged ${Object.keys(files).length + 1} files in ${out}`);

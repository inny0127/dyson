// Screenshot the app headlessly and report console errors.
// Usage: node scripts/shot.mjs [chapter] [out.png] [--width=1440] [--height=900] [--wait=4000]
//        [--eval="js to run before the shot, e.g. __swarm.params.year=55;__swarm.onYearChanged()"]
// Starts a static server on a free port, so it can run from anywhere.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PW = '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => {
  const [k, ...v] = a.slice(2).split('=');
  return [k, v.join('=') || true];
}));
const [chapter = 'swarm', out = 'shot.png'] = args.filter(a => !a.startsWith('--'));
const width = Number(flags.width || 1440), height = Number(flags.height || 900);
const wait = Number(flags.wait || 4000);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${port}/index.html#${chapter}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__swarm, null, { timeout: 30000 }).catch(() => errors.push('app did not boot (window.__swarm missing)'));
if (flags.eval) await page.evaluate(flags.eval).catch(e => errors.push(`[eval] ${e.message}`));
await page.waitForTimeout(wait);
await page.screenshot({ path: out });
console.log(`saved ${out}`);
if (errors.length) console.log(errors.join('\n'));
else console.log('no console errors');
await browser.close();
server.close();

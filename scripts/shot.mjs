// Screenshot the app headlessly and report console errors.
// Usage: node scripts/shot.mjs [section] [out.png] [--width=1440] [--height=900] [--wait=1500] [--full]
//        [--eval="js to run before the shot, e.g. __ledger.setEra('2026')"]
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
const [chapter = 'sail', out = 'shot.png'] = args.filter(a => !a.startsWith('--'));
const width = Number(flags.width || 1440), height = Number(flags.height || 900);
const wait = Number(flags.wait || 1500);

const TYPES = { '.jpg': 'image/jpeg', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
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
await page.waitForFunction(() => window.__ledger, null, { timeout: 30000 }).catch(() => errors.push('app did not boot (window.__ledger missing)'));
if (flags.eval) await page.evaluate(flags.eval).catch(e => errors.push(`[eval] ${e.message}`));
await page.waitForTimeout(wait);
await page.evaluate(id => document.getElementById(id)?.scrollIntoView(), chapter);
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: !!flags.full });
console.log(`saved ${out}`);
if (errors.length) console.log(errors.join('\n'));
else console.log('no console errors');
await browser.close();
server.close();

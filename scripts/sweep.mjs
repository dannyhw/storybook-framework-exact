#!/usr/bin/env node
// Open every story of a Storybook on its own and say whether it rendered and its play function passed.
//
//   node scripts/sweep.mjs --url http://localhost:6116            every story of a running Storybook
//   node scripts/sweep.mjs --dir examples/basic/storybook-static   every story of a static build
//   --filter <text>        only the stories whose id contains the text
//   --shots <directory>    keep a screenshot of each story, named by its id
//   --dark                 in the dark colour scheme
//   --width <n> --height <n>   the canvas's size (default 1100 x 800)
//
// Exits 1 when a story failed to render or its play function failed.
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

/** Serve a static build as a static host would, on a free port, and give its address. */
function serve(directory) {
  const root = resolve(directory);
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    let file = join(root, path);
    if (file !== root && !file.startsWith(root + sep)) return response.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

const directory = option('--dir');
if (directory && !existsSync(join(directory, 'index.json'))) {
  console.error(`${directory} is not a static Storybook: it has no index.json. Build it first (storybook build).`);
  process.exit(2);
}
const served = directory ? await serve(directory) : undefined;
const base = served?.url ?? option('--url');
if (!base) {
  console.error('usage: node scripts/sweep.mjs (--url <storybook> | --dir <static build>) [--filter <text>] [--shots <directory>] [--dark]');
  process.exit(2);
}
const filter = option('--filter') ?? '';
/** How long a story's play function may take. */
const PLAY_MS = 120_000;
const shots = option('--shots');
if (shots) mkdirSync(shots, { recursive: true });

const index = await (await fetch(`${base}/index.json`)).json();
const ids = Object.values(index.entries)
  .filter((entry) => entry.type === 'story' && entry.id.includes(filter))
  .map((entry) => entry.id);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: Number(option('--width') ?? 1100), height: Number(option('--height') ?? 800) },
  colorScheme: args.includes('--dark') ? 'dark' : 'light',
});
let refused = [];
let problems = [];
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().replace(/\s+/g, ' ').slice(0, 200));
});
page.on('pageerror', (error) => problems.push(String(error.message).slice(0, 200)));
page.on('response', (response) => {
  if (response.status() >= 400) refused.push(`${response.status()} ${new URL(response.url()).pathname}`);
});

// What Storybook says of a story's run, kept as it says it. A render's phase is no use here: a play function
// that throws passes through `errored` and ends `finished`, as one that passes does.
await page.addInitScript(() => {
  const heard = (window.__sweep = { threw: null, unhandled: null, finished: null });
  const message = (error) => String(error?.message ?? error).replace(/\s+/g, ' ').slice(0, 400);
  let channel;
  Object.defineProperty(window, '__STORYBOOK_ADDONS_CHANNEL__', {
    configurable: true,
    get: () => channel,
    set(value) {
      channel = value;
      value.on('playFunctionThrewException', (error) => (heard.threw = message(error)));
      value.on('unhandledErrorsWhilePlaying', (errors) => (heard.unhandled = errors.map(message).join(' | ')));
      value.on('storyFinished', (payload) => (heard.finished = { id: payload.storyId, status: payload.status }));
    },
  });
});

let failed = 0;
for (const id of ids) {
  refused = [];
  problems = [];
  await page.goto(`${base}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'domcontentloaded' });
  const errorText = () => `${document.querySelector('#error-message')?.textContent ?? ''} ${document.querySelector('#error-stack')?.textContent ?? ''}`;
  const state = await page
    .waitForFunction(() => {
      if (document.body.classList.contains('sb-show-errordisplay')) return { error: true };
      const root = document.querySelector('#exact-root');
      return root?.childElementCount && document.body.classList.contains('sb-show-main') ? { ok: true } : null;
    }, null, { timeout: 60_000 })
    .then((handle) => handle.jsonValue(), () => ({ error: true, timeout: true }));
  const heard = await page
    .waitForFunction((story) => (window.__sweep?.finished?.id === story ? window.__sweep : null), id, { timeout: PLAY_MS })
    .then((handle) => handle.jsonValue(), () => null);
  // A late source or an image may still change the canvas.
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
  const screen = await page.evaluate(() => document.body.classList.contains('sb-show-errordisplay'));
  let error = '';
  if (heard?.threw) error = `its play function failed: ${heard.threw}`;
  else if (heard?.unhandled) error = `an error was thrown while it played: ${heard.unhandled}`;
  else if (state.timeout) error = 'did not render within 60 s';
  else if (state.error || screen) error = (await page.evaluate(errorText)).replace(/\s+/g, ' ').slice(0, 300) || 'shows an error';
  else if (!heard) error = `did not finish within ${PLAY_MS / 1000} s`;
  else if (heard.finished.status !== 'success') error = `finished with an error: ${problems.join(' | ').slice(0, 400) || 'see the Interactions panel'}`;
  if (shots) await page.screenshot({ path: join(shots, `${id}.png`) });
  if (error) failed++;
  console.log(`${error ? 'FAIL' : 'ok  '} ${id}${error ? `\n       ${error}` : ''}${refused.length ? `\n       ${[...new Set(refused)].join(', ')}` : ''}`);
}
console.log(`\n${ids.length - failed} of ${ids.length} passed`);
await browser.close();
served?.server.close();
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
// End-to-end checks of the example Storybook in a real Chrome.
//
//   npm run e2e                 start the example's dev server and check it, hot updates included
//   npm run e2e -- --static     `storybook build` the example, serve the output, and check that
//   --port <n>                  use this port instead of a free one (also E2E_PORT)
//
// Exact's toolchain comes from the framework's own resolution: run `storybook-exact setup` first, or set
// EXACT_ROOT (and BUN) to a checkout that is already built. Screenshots of failed checks go to e2e-output/.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXAMPLE = join(ROOT, 'examples/basic');
const OUTPUT = join(ROOT, 'e2e-output');
const args = process.argv.slice(2);
const STATIC = args.includes('--static');
const portArg = args.includes('--port') ? args[args.indexOf('--port') + 1] : process.env.E2E_PORT;

// A cold first story builds its component (and, without `setup`, the whole toolchain): give it time.
const FIRST_RENDER_MS = 180_000;
const RENDER_MS = 60_000;

/** The `storybook` CLI the example resolves, run with this Node rather than through npx. */
const STORYBOOK_BIN = (() => {
  const require = createRequire(join(EXAMPLE, 'package.json'));
  const manifest = require.resolve('storybook/package.json');
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
  return join(manifest, '..', typeof bin === 'string' ? bin : bin.storybook);
})();

function freePort() {
  return new Promise((done, fail) => {
    const server = createNetServer();
    server.unref();
    server.on('error', fail);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** A child process whose output is kept, to print when something fails. */
function start(command, commandArgs, options = {}) {
  // Its own process group: Storybook starts children of its own, and stopping it must stop them too.
  const child = spawn(command, commandArgs, { cwd: EXAMPLE, env: process.env, detached: process.platform !== 'win32', ...options });
  const output = [];
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', (chunk) => output.push(chunk));
  const exited = new Promise((done) => child.on('exit', (code, signal) => done({ code, signal })));
  // Without colours: the output is read in a log.
  const text = () => Buffer.concat(output).toString('utf8').replace(/\x1b\[[0-9;]*m|\x1b\]8;;[^\x07\x1b]*(\x07|\x1b\\)/g, '');
  return { child, exited, output: text };
}

async function stop(proc) {
  if (!proc || proc.child.exitCode !== null || proc.child.signalCode !== null) return;
  const signal = (name) => {
    try {
      if (process.platform === 'win32') proc.child.kill(name);
      else process.kill(-proc.child.pid, name);
    } catch {
      // already gone
    }
  };
  signal('SIGTERM');
  const timedOut = await Promise.race([proc.exited.then(() => false), sleep(10_000).then(() => true)]);
  if (timedOut) {
    signal('SIGKILL');
    await proc.exited;
  }
}

async function waitForServer(url, proc, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (proc && proc.child.exitCode !== null) throw new Error(`the server exited with code ${proc.child.exitCode}:\n${proc.output()}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await sleep(500);
  }
  throw new Error(`${url} did not answer within ${timeout / 1000} s${proc ? `:\n${proc.output()}` : ''}`);
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/** Serve a directory as a static host would: no rewrites, index.html for a directory. */
function serveStatic(dir, port) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    let file = normalize(join(dir, path));
    if (file !== dir && !file.startsWith(dir + sep)) {
      response.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((done) => server.listen(port, '127.0.0.1', () => done(server)));
}

// --- the checks ---------------------------------------------------------------------------------------------

const results = [];

/**
 * Run a named check. `knownBug` marks one that shows a bug in the framework, as `it.fails` does: its failure
 * is expected and passes the run, and its passing fails it, so the marker is removed with the fix.
 */
async function check(name, run, knownBug) {
  const started = Date.now();
  const took = () => `${Date.now() - started} ms`;
  try {
    await run();
    if (knownBug) {
      results.push({ name, ok: false });
      console.log(`  ✗ ${name} (${took()})\n      passed, but is marked as a known bug (${knownBug}): remove the marker`);
    } else {
      results.push({ name, ok: true });
      console.log(`  ✓ ${name} (${took()})`);
    }
  } catch (error) {
    const message = String(error?.message ?? error).split('\n').slice(0, 6).join('\n      ');
    if (knownBug) {
      results.push({ name, ok: true });
      console.log(`  ✓ ${name} (${took()}) fails as expected, known bug: ${knownBug}\n      ${message}`);
      return;
    }
    results.push({ name, ok: false });
    console.log(`  ✗ ${name} (${took()})\n      ${message}`);
    await page?.screenshot({ path: join(OUTPUT, `${name.replace(/[^\w-]+/g, '_')}.png`) }).catch(() => {});
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let page;
let base;
const errors = [];
const frame = () => page.frameLocator('#storybook-preview-iframe');
const preview = () => page.frame({ name: 'storybook-preview-iframe' });
const panelText = async () => (await page.locator('#storybook-panel-root').innerText()).replace(/\s+/g, ' ');
const panelTab = (name) => page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
const rootText = async () => (await frame().locator('#exact-root').innerText()).replace(/\s+/g, ' ').trim();

async function open(storyId, timeout = RENDER_MS) {
  await page.goto(`${base}/?path=/story/${storyId}`, { waitUntil: 'domcontentloaded' });
  await waitForRendered(storyId, timeout);
}

/** Until the preview has rendered the story and the app in it has content. */
async function waitForRendered(storyId, timeout = RENDER_MS) {
  await frame().locator('#exact-root').filter({ hasText: /\S/ }).waitFor({ timeout });
  await page.waitForFunction(
    (id) => document.querySelector('#storybook-preview-iframe')?.contentWindow?.__STORYBOOK_PREVIEW__?.currentRender?.id === id,
    storyId,
    { timeout }
  );
}

/** Mark the preview document and its app root, to tell later whether either was replaced. */
const mark = () =>
  preview().evaluate(() => {
    window.__e2eDocument = true;
    document.getElementById('exact-root').dataset.e2e = 'same';
  });
const marks = () =>
  preview().evaluate(() => ({
    document: window.__e2eDocument === true,
    root: document.getElementById('exact-root')?.dataset.e2e === 'same',
    roots: document.querySelectorAll('#exact-root').length,
  }));

/** Select a story the way a link in the preview does, and wait until the preview reports it rendered. */
const select = (storyId) =>
  preview().evaluate(
    (id) =>
      new Promise((done, fail) => {
        const channel = window.__STORYBOOK_ADDONS_CHANNEL__;
        const timer = setTimeout(() => fail(new Error(`${id} did not render within 30 s`)), 30_000);
        const rendered = (renderedId) => {
          if (renderedId !== id) return;
          channel.off('storyRendered', rendered);
          clearTimeout(timer);
          done();
        };
        channel.on('storyRendered', rendered);
        channel.emit('selectStory', { storyId: id });
      }),
    storyId
  );

async function run(index) {
  const stories = Object.values(index.entries).filter((e) => e.type === 'story');
  const played = stories.filter((e) => e.tags?.includes('play-fn'));
  const docs = Object.values(index.entries).filter((e) => e.type === 'docs' && e.tags?.includes('autodocs'));

  await check('a story renders', async () => {
    await open('button--primary', FIRST_RENDER_MS);
    const button = frame().locator('#exact-root button');
    assert((await button.innerText()).trim() === 'Hello Exact', `the button reads ${JSON.stringify(await button.innerText())}`);
  });

  await check('a Controls edit updates the running app without a remount', async () => {
    await panelTab('Controls');
    await mark();
    await page.locator('#control-label').fill('Edited');
    await frame().locator('#exact-root button', { hasText: 'Edited' }).waitFor({ timeout: 10_000 });
    const background = () => preview().evaluate(() => getComputedStyle(document.querySelector('#exact-root button')).backgroundColor);
    const primary = await background();
    await page.locator('#control-tone').selectOption('secondary');
    await page.waitForFunction(
      (before) => {
        const button = document.querySelector('#storybook-preview-iframe')?.contentDocument?.querySelector('#exact-root button');
        return button && getComputedStyle(button).backgroundColor !== before;
      },
      primary,
      { timeout: 10_000 }
    );
    const after = await marks();
    assert(after.document && after.root && after.roots === 1, `the app was remounted: ${JSON.stringify(after)}`);
  });

  await check('a press reaches the Actions panel', async () => {
    await frame().locator('#exact-root button').click();
    await panelTab('Actions');
    await page.locator('#storybook-panel-root').filter({ hasText: /press/ }).waitFor({ timeout: 10_000 });
  });

  assert(played.length > 0, 'the example has no story with a play function');
  for (const story of played) {
    await check(`play ${story.id} reports PASS in Interactions`, async () => {
      await open(story.id);
      // A click in the manager takes focus out of the preview iframe, and typing a play function does after
      // that goes nowhere: the panel is opened only once the play function is done.
      await page.waitForFunction(
        () => ['finished', 'errored', 'aborted'].includes(document.querySelector('#storybook-preview-iframe')?.contentWindow?.__STORYBOOK_PREVIEW__?.currentRender?.phase),
        null,
        { timeout: 30_000 }
      );
      await panelTab('Interactions');
      // The status badge: PASS, FAIL, or RUNS while the play function is still going. innerText, not the
      // text content a locator filter matches, keeps the badge apart from the tab's count beside it.
      let text = '';
      for (const deadline = Date.now() + 30_000; Date.now() < deadline; await sleep(250)) {
        text = await panelText();
        if (/\b(PASS|FAIL)\b/.test(text)) break;
      }
      assert(/\bPASS\b/.test(text), `the Interactions panel says: ${text.slice(0, 300)}`);
    });
  }

  await check('the async source story shows its late answer', async () => {
    await open('todos--slow-answer');
    const early = await rootText();
    assert(!early.includes('Arrived after 800 ms'), `the answer was there from the start: ${early}`);
    await frame().locator('#exact-root', { hasText: 'Arrived after 800 ms' }).waitFor({ timeout: 10_000 });
    assert(/1 left/.test(await rootText()), `after the answer the app reads ${await rootText()}`);
  });

  assert(docs.length > 0, 'the example has no autodocs page');
  for (const doc of docs) {
    await check(`autodocs ${doc.id} renders each story in its own iframe`, async () => {
      const expected = stories.filter((s) => s.title === doc.title).map((s) => s.id);
      await page.goto(`${base}/?path=/docs/${doc.id}`, { waitUntil: 'domcontentloaded' });
      await frame().locator('.sbdocs').first().waitFor({ timeout: RENDER_MS });
      const deadline = Date.now() + RENDER_MS;
      let seen = {};
      while (Date.now() < deadline) {
        seen = {};
        for (const nested of page.frames()) {
          if (!nested.url().includes('viewMode=story')) continue;
          const id = new URL(nested.url()).searchParams.get('id');
          if (!expected.includes(id)) continue;
          seen[id] = await nested.evaluate(() => [...document.querySelectorAll('#exact-root')].map((r) => r.innerText.trim())).catch(() => []);
        }
        if (expected.every((id) => seen[id]?.length === 1 && seen[id][0])) return;
        await sleep(500);
      }
      throw new Error(`expected one rendered app in an iframe for each of ${expected.join(', ')}; saw ${JSON.stringify(seen)}`);
    });
  }

  await check('switching stories of different components ten times leaves one #exact-root and no console errors', async () => {
    // One story of each component, visited in turn without a page load.
    const byComponent = [...new Map(stories.filter((s) => !s.tags?.includes('play-fn')).map((s) => [s.title, s.id])).values()];
    assert(byComponent.length >= 2, 'the example needs stories of two components');
    await open(byComponent[0]);
    await mark();
    const before = errors.length;
    for (let i = 1; i <= 10; i++) {
      const id = byComponent[i % byComponent.length];
      await select(id);
      const state = await marks();
      assert(state.document, `the preview reloaded on switch ${i}, to ${id}`);
      assert(state.roots === 1, `switch ${i}, to ${id}, left ${state.roots} #exact-root`);
      assert((await rootText()).length > 0, `switch ${i}, to ${id}, left an empty app`);
    }
    const logged = errors.slice(before);
    assert(logged.length === 0, `console errors:\n${logged.join('\n')}`);
  });

  if (!STATIC) {
    await check('editing a .contract file hot-updates the canvas and keeps an edited control', async () => {
      const file = join(EXAMPLE, 'app/button.contract');
      const original = readFileSync(file);
      try {
        await open('button--primary');
        await panelTab('Controls');
        await page.locator('#control-label').fill('Kept');
        await frame().locator('#exact-root button', { hasText: 'Kept' }).waitFor({ timeout: 10_000 });
        await mark();
        const edited = original.toString('utf8').replace('text label color=', 'text `${label} (hot)` color=');
        assert(edited !== original.toString('utf8'), 'button.contract no longer has the line this check edits');
        writeFileSync(file, edited);
        await frame().locator('#exact-root button', { hasText: 'Kept (hot)' }).waitFor({ timeout: RENDER_MS });
        const state = await marks();
        assert(state.document, 'the preview page reloaded');
        assert(state.roots === 1, `${state.roots} #exact-root after the update`);
      } finally {
        writeFileSync(file, original);
      }
      // Back to the source as committed, before the server stops.
      await frame().locator('#exact-root button', { hasText: /^\s*Kept\s*$/ }).waitFor({ timeout: RENDER_MS });
    });

    await check(
      'reverting a .contract file after two edits shows the original again',
      async () => {
        const file = join(EXAMPLE, 'app/button.contract');
        const original = readFileSync(file, 'utf8');
        const before = errors.length;
        try {
          await open('button--primary');
          for (const tag of ['(one)', '(two)']) {
            writeFileSync(file, original.replace('text label color=', `text \`\${label} ${tag}\` color=`));
            await frame().locator('#exact-root button', { hasText: tag }).waitFor({ timeout: RENDER_MS });
          }
        } finally {
          writeFileSync(file, original);
        }
        await frame().locator('#exact-root button', { hasText: /^\s*Hello Exact\s*$/ }).waitFor({ timeout: 15_000 });
        const logged = errors.slice(before);
        assert(logged.length === 0, `console errors:\n${logged.join('\n')}`);
      }
    );
  }
}

// --- main ---------------------------------------------------------------------------------------------------

let server;
let staticServer;
let browser;

async function cleanup() {
  await browser?.close().catch(() => {});
  staticServer?.close();
  await stop(server);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => cleanup().finally(() => process.exit(130)));
}

try {
  rmSync(OUTPUT, { recursive: true, force: true });
  mkdirSync(OUTPUT, { recursive: true });
  const port = portArg ? Number(portArg) : await freePort();
  base = `http://localhost:${port}`;

  if (STATIC) {
    console.log('Building the example with `storybook build`');
    const build = start(process.execPath, [STORYBOOK_BIN, 'build', '--output-dir', 'storybook-static'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const { code } = await build.exited;
    if (code !== 0) throw new Error(`storybook build failed with exit code ${code}:\n${build.output()}`);
    staticServer = await serveStatic(join(EXAMPLE, 'storybook-static'), port);
  } else {
    console.log(`Starting the example's dev server on port ${port}`);
    server = start(process.execPath, [STORYBOOK_BIN, 'dev', '-p', String(port), '--no-open', '--ci', '--exact-port'], { stdio: ['ignore', 'pipe', 'pipe'] });
  }
  await waitForServer(`${base}/index.json`, server, FIRST_RENDER_MS);
  const index = await (await fetch(`${base}/index.json`)).json();

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[console] ${message.text().split('\n')[0]}`);
  });
  page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message.split('\n')[0]}`));

  console.log(`Checking ${STATIC ? 'the static build' : 'the dev server'} at ${base}`);
  await run(index);
} catch (error) {
  results.push({ name: 'setup', ok: false });
  console.log(`  ✗ ${error?.stack ?? error}`);
} finally {
  if (results.some((r) => !r.ok) && server) console.log(`\n--- dev server output ---\n${server.output().slice(-8000)}`);
  if (errors.length) console.log(`\n--- console errors seen ---\n${[...new Set(errors)].join('\n')}`);
  await cleanup();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);

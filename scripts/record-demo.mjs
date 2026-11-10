// Records the walkthrough shown in the README: `node scripts/record-demo.mjs [--url http://localhost:6116]`.
//
// It drives the example Storybook (start it first with `npm run example`) in headless Chrome, with a caption
// for each step, and writes docs/demo.mp4 and docs/demo.gif. It needs Chrome, ffmpeg, and the ffmpeg build
// Playwright records with (`npx playwright-core install ffmpeg`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const base = option('--url', 'http://localhost:6116');
const out = resolve(option('--out', join(root, 'docs')));
const size = { width: 1280, height: 800 };
const buttonSource = join(root, 'examples/basic/app/button.contract');

const frames = mkdtempSync(join(tmpdir(), 'exact-demo-'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: size, recordVideo: { dir: frames, size } });
const page = await context.newPage();
const canvas = page.frameLocator('#storybook-preview-iframe');
const preview = () => page.frames().find((frame) => frame.url().includes('iframe.html') && frame.parentFrame() === page.mainFrame());
const pause = (ms) => page.waitForTimeout(ms);

/** The caption and a pointer: a headless recording shows neither a cursor nor what a step is for. */
async function overlay() {
  await page.evaluate(() => {
    if (document.getElementById('demo-caption')) return;
    const caption = document.createElement('div');
    caption.id = 'demo-caption';
    caption.style.cssText =
      'position:fixed;right:20px;bottom:316px;z-index:99999;max-width:560px;padding:12px 18px;border-radius:12px;background:#111827;color:#fff;' +
      'font:600 17px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.28);opacity:0;transition:opacity .25s;pointer-events:none';
    const pointer = document.createElement('div');
    pointer.id = 'demo-pointer';
    pointer.style.cssText =
      'position:fixed;left:0;top:0;z-index:100000;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,71,133,.45);' +
      'border:2px solid #ff4785;transform:translate(640px,400px);transition:transform .35s ease-out;pointer-events:none';
    document.body.append(caption, pointer);
  });
}

async function say(text) {
  await overlay();
  await page.evaluate((text) => {
    const caption = document.getElementById('demo-caption');
    caption.textContent = text;
    caption.style.opacity = text ? '1' : '0';
  }, text);
}

/** Move the pointer to an element, in the page or in the canvas, then click it. */
async function click(locator, options = {}) {
  const box = await locator.boundingBox();
  if (box) {
    await page.evaluate(([x, y]) => { document.getElementById('demo-pointer').style.transform = `translate(${x}px,${y}px)`; }, [box.x + box.width / 2, box.y + box.height / 2]);
    await pause(450);
  }
  await locator.click(options);
}

/** A story by its sidebar entry, opening its component first when it is closed. */
async function open(id) {
  const entry = page.locator(`#${id}`);
  if (!(await entry.isVisible())) await click(page.locator(`[data-item-id="${id.split('--')[0]}"]`));
  await click(entry);
}

const original = readFileSync(buttonSource, 'utf8');
try {
  await page.goto(`${base}/?path=/story/button--primary`, { waitUntil: 'domcontentloaded' });
  await canvas.locator('#exact-root button').waitFor({ timeout: 120_000 });
  await page.getByRole('button', { name: /dismiss|close/i }).last().click({ timeout: 1500 }).catch(() => {});
  await overlay();
  await pause(600);

  await say("A Contract component, running on Exact's web runtime inside Storybook");
  await pause(2800);

  await say('Its props are the controls. An edit reaches the running app: no rebuild, no remount');
  const label = page.locator('#control-label');
  await click(label);
  await label.press('ControlOrMeta+a');
  await label.pressSequentially('Ship it', { delay: 90 });
  await pause(700);
  await click(page.locator('#control-tone'));
  await page.locator('#control-tone').selectOption('secondary');
  await pause(1300);
  await page.locator('#control-tone').selectOption('primary');
  await pause(1100);

  await say('An action prop reports to the Actions panel');
  await click(canvas.locator('#exact-root button'));
  await click(page.getByRole('tab', { name: /Actions/ }));
  await pause(600);
  await click(canvas.locator('#exact-root button'));
  await pause(1800);

  await say('A play function drives the component and asserts on it');
  await open('counter--bumped');
  await canvas.locator('[data-testid="count"]').waitFor();
  // Not before the play function is done: a click in the manager takes focus out of the canvas.
  await pause(2200);
  await click(page.getByRole('tab', { name: /Interactions/ }));
  await pause(2600);

  await say('A component that owns data runs on sources the story answers');
  await open('todos--empty');
  const field = canvas.locator('[data-testid="new-todo"]');
  await field.waitFor();
  await pause(600);
  await click(field);
  for (const title of ['Buy milk', 'Walk the dog']) {
    await page.keyboard.type(title, { delay: 70 });
    await page.keyboard.press('Enter');
    await pause(700);
  }
  await click(canvas.locator('[data-testid="toggle-1"]'));
  await pause(1800);

  await say('A docs page shows every story, each in its own frame');
  await open('button--docs');
  await canvas.locator('.sbdocs').first().waitFor();
  await pause(2800);
  await page.mouse.move(760, 300);
  await page.mouse.wheel(0, 520);
  await pause(2600);

  await say('Edit the .contract file and the canvas hot-reloads');
  await open('button--primary');
  await canvas.locator('#exact-root button').waitFor();
  await pause(1500);
  writeFileSync(buttonSource, original.replace('border-radius=8', 'border-radius=24').replace('"#1ea7fd"', '"#7c3aed"'));
  await say('button.contract:  border-radius=8 → 24,  #1ea7fd → #7c3aed');
  // The button is briefly gone while the new build mounts.
  await preview().waitForFunction(() => {
    const button = document.querySelector('#exact-root button');
    return !!button && getComputedStyle(button).borderTopLeftRadius === '24px';
  }, null, { timeout: 30_000 });
  await pause(3000);
  await say('');
  await pause(500);
} finally {
  writeFileSync(buttonSource, original);
  await context.close();
  await browser.close();
}

const recording = join(frames, readdirSync(frames).find((name) => name.endsWith('.webm')));
mkdirSync(out, { recursive: true });
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
// The first moments are the page loading.
ffmpeg('-ss', '1.2', '-i', recording, '-vf', 'fps=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', '-an', join(out, 'demo.mp4'));
// An animated image is what a README can show inline.
const palette = 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';
ffmpeg('-ss', '1.2', '-i', recording, '-vf', `fps=8,scale=960:-1:flags=lanczos,${palette}`, '-loop', '0', '-an', join(out, 'demo.gif'));
rmSync(frames, { recursive: true, force: true });
console.log(`Wrote ${join(out, 'demo.mp4')} and ${join(out, 'demo.gif')}`);

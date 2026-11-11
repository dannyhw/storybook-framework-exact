// What the README's recordings share: a headless Chrome on a running Storybook, a caption and a pointer over
// it, and the encoding of what was recorded. It needs Chrome, ffmpeg, and the ffmpeg build Playwright records
// with (`npx playwright-core install ffmpeg`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A command-line option's value: `--url http://localhost:6116`. */
export const option = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
};

/**
 * Record `steps` as `<name>.mp4` and `<name>.gif` in the directory `--out` names (docs/ when not given).
 * The steps get the page, the canvas and the helpers below. `height` is the window's, `gifWidth` the animated
 * image's: photographs make a heavy one.
 */
export async function record(name, steps, { height = 800, gifWidth = 960 } = {}) {
  const size = { width: 1280, height };
  const out = resolve(option('--out', join(root, 'docs')));
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

  /** A story by its sidebar entry, opening what it is under (`within`, outermost first) when that is closed. */
  async function open(id, within = [id.split('--')[0]]) {
    const entry = page.locator(`#${id}`);
    for (const parent of within) {
      if (await entry.isVisible()) break;
      const next = within[within.indexOf(parent) + 1];
      if (!next || !(await page.locator(`[data-item-id="${next}"]`).isVisible())) await click(page.locator(`[data-item-id="${parent}"]`));
    }
    await click(entry);
  }

  try {
    await steps({ page, canvas, preview, pause, overlay, say, click, open });
  } finally {
    await context.close();
    await browser.close();
  }

  const recording = join(frames, readdirSync(frames).find((file) => file.endsWith('.webm')));
  mkdirSync(out, { recursive: true });
  const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  // The first moments are the page loading.
  ffmpeg('-ss', '1.2', '-i', recording, '-vf', 'fps=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', '-an', join(out, `${name}.mp4`));
  // An animated image is what a README can show inline.
  const palette = 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';
  ffmpeg('-ss', '1.2', '-i', recording, '-vf', `fps=8,scale=${gifWidth}:-2:flags=lanczos,${palette}`, '-loop', '0', '-an', join(out, `${name}.gif`));
  rmSync(frames, { recursive: true, force: true });
  console.log(`Wrote ${join(out, `${name}.mp4`)} and ${join(out, `${name}.gif`)}`);
}

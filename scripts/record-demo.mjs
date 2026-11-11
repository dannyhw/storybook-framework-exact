// Records the walkthrough shown in the README: `node scripts/record-demo.mjs [--url http://localhost:6116]`.
//
// It drives the example Storybook (start it first with `npm run example`) in headless Chrome, with a caption
// for each step, and writes docs/demo.mp4 and docs/demo.gif (see recording.mjs for what it needs).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { option, record, root } from './recording.mjs';

const base = option('--url', 'http://localhost:6116');
const buttonSource = join(root, 'examples/basic/app/button.contract');
const original = readFileSync(buttonSource, 'utf8');

try {
  await record('demo', async ({ page, canvas, preview, pause, overlay, say, click, open }) => {
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

    await say("A library's component has its package's tokens, and its action gets the event's value");
    await open('library-chip--off', ['library', 'library-chip']);
    const toggle = canvas.locator('[data-testid="chip-toggle"]');
    await toggle.waitFor();
    await pause(900);
    await click(page.getByRole('tab', { name: /Actions/ }));
    await click(toggle);
    await pause(2200);

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
  });
} finally {
  writeFileSync(buttonSource, original);
}

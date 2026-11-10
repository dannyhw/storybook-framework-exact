import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WRAPPER_PREFIX, appDirectory, libraryOf, syncShadow, unshadow } from '../src/node/shadow.ts';

const BUTTON = `component Button
  props
    label: string
  view
    button
      text label
`;

let root: string;
const put = (path: string, text = '') => {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
};
const read = (path: string) => readFileSync(join(root, path), 'utf8');

beforeEach(() => {
  // Real paths: on macOS the temp directory is behind a symlink, and the shadow's paths are compared as strings.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'sb-exact-shadow-')));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('appDirectory', () => {
  it('is the nearest directory with an app.json', () => {
    put('app/app.json', '{}');
    expect(appDirectory(put('app/components/deep/button.contract'))).toBe(join(root, 'app'));
  });

  it('prefers an app.json further up to a nearer package.json', () => {
    put('app/app.json', '{}');
    put('app/lib/package.json', '{}');
    expect(appDirectory(put('app/lib/button.contract'))).toBe(join(root, 'app'));
  });

  it('takes a library kept inside an app for a library', () => {
    put('app/app.json', '{}');
    put('app/cards/package.json', JSON.stringify({ name: '@acme/cards', exports: { '.': './index.contract' } }));
    expect(appDirectory(put('app/cards/parts/card.contract'))).toBe(join(root, 'app/cards'));
    expect(appDirectory(put('app/screen.contract'))).toBe(join(root, 'app'));
  });

  it('is a library’s package directory when there is no app.json', () => {
    put('lib/package.json', '{}');
    expect(appDirectory(put('lib/src/button.contract'))).toBe(join(root, 'lib'));
  });

  it('is the file’s own directory when neither is found', () => {
    const outside = [root, ...ancestors(root)].some((dir) => existsSync(join(dir, 'app.json')) || existsSync(join(dir, 'package.json')));
    if (outside) return; // A marker above the temp directory would be found first; nothing to check here.
    expect(appDirectory(put('loose/button.contract'))).toBe(join(root, 'loose'));
  });
});

function ancestors(dir: string): string[] {
  const list: string[] = [];
  for (let d = dirname(dir); d !== dirname(d); d = dirname(d)) list.push(d);
  return list;
}

describe('syncShadow', () => {
  const app = () => join(root, 'app');
  const shadow = () => join(root, 'cache', 'shadow');

  it('mirrors the Contract and design sources, and nothing an app builds or runs', () => {
    put('app/app.json', '{"name":"Basic"}');
    put('app/button.contract', BUTTON);
    put('app/theme.tamber', 'color brand = "#1ea7fd"');
    put('app/components/web/card.contract', BUTTON.replace('Button', 'Card'));
    put('app/app.ts', 'export {}');
    put('app/src/lib.rs', '');
    put('app/README.md', '');
    put('app/.hidden/secret.contract', BUTTON);
    put('app/node_modules/pkg/dep.contract', BUTTON);
    put('app/web/host.contract', BUTTON);
    put('app/apple/host.contract', BUTTON);
    put('app/android/host.contract', BUTTON);
    put('app/dist/out.contract', BUTTON);
    put('app/components/target/built.contract', BUTTON);

    const { sources } = syncShadow(app(), shadow());

    // Host crates are skipped only at the top: `components/web` is the app's own.
    expect(sources).toEqual([join(app(), 'button.contract'), join(app(), 'components/web/card.contract'), join(app(), 'theme.tamber')]);
    expect(read('cache/shadow/button.contract')).toBe(BUTTON);
    expect(read('cache/shadow/theme.tamber')).toBe('color brand = "#1ea7fd"');
    expect(existsSync(join(shadow(), 'components/web/card.contract'))).toBe(true);
    for (const skipped of ['app.ts', 'src/lib.rs', 'README.md', '.hidden', 'node_modules', 'web', 'apple', 'android', 'dist', 'components/target']) {
      expect(existsSync(join(shadow(), skipped)), skipped).toBe(false);
    }
  });

  it('writes a trimmed app.json, without what makes Exact build code a story never runs', () => {
    put('app/button.contract', BUTTON);
    put(
      'app/app.json',
      JSON.stringify({
        $schema: './schema.json',
        name: 'Basic',
        id: 'dev.example.basic',
        start_url: '/home',
        theme: { tint: '#1ea7fd' },
        rust: { crate: 'src' },
        typescript: 'app.ts',
        modules: ['camera'],
        server: { port: 3000 },
        deploy: {},
        icons: ['icon.png'],
        app: { name: 'Basic App' },
      })
    );
    syncShadow(app(), shadow());
    expect(JSON.parse(read('cache/shadow/app.json'))).toEqual({
      name: 'Basic',
      id: 'dev.example.basic',
      start_url: '/',
      theme: { tint: '#1ea7fd' },
      app: { id: 'dev.example.basic', name: 'Basic App' },
    });
    // The app's own manifest is not touched.
    expect(JSON.parse(read('app/app.json')).rust).toEqual({ crate: 'src' });
  });

  it('gives a library an app.json named after its directory', () => {
    put('My Lib/package.json', '{}');
    put('My Lib/button.contract', BUTTON);
    syncShadow(join(root, 'My Lib'), shadow());
    expect(JSON.parse(read('cache/shadow/app.json'))).toEqual({
      name: 'My Lib',
      id: 'dev.storybook.my-lib',
      start_url: '/',
      app: { id: 'dev.storybook.my-lib', name: 'My Lib' },
    });
  });

  it('removes a source deleted or renamed in the app, and keeps the wrappers', () => {
    put('app/app.json', '{}');
    put('app/button.contract', BUTTON);
    put('app/old/card.contract', BUTTON);
    syncShadow(app(), shadow());
    put(`cache/shadow/${WRAPPER_PREFIX}Button-1234.contract`, 'component Story');

    rmSync(join(app(), 'old'), { recursive: true });
    renameSync(join(app(), 'button.contract'), join(app(), 'primary-button.contract'));
    syncShadow(app(), shadow());

    expect(existsSync(join(shadow(), 'old/card.contract'))).toBe(false);
    expect(existsSync(join(shadow(), 'button.contract'))).toBe(false);
    expect(read('cache/shadow/primary-button.contract')).toBe(BUTTON);
    expect(existsSync(join(shadow(), `${WRAPPER_PREFIX}Button-1234.contract`))).toBe(true);
  });

  it('keeps the revision while nothing changes, and changes it when a source, a name or the manifest does', () => {
    put('app/app.json', '{"name":"A"}');
    put('app/button.contract', BUTTON);
    const first = syncShadow(app(), shadow()).revision;
    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(syncShadow(app(), shadow()).revision).toBe(first);

    put('app/button.contract', BUTTON.replace('label: string', 'label: string\n    tone: string'));
    const edited = syncShadow(app(), shadow()).revision;
    expect(edited).not.toBe(first);
    expect(read('cache/shadow/button.contract')).toContain('tone: string');

    renameSync(join(app(), 'button.contract'), join(app(), 'b.contract'));
    const renamed = syncShadow(app(), shadow()).revision;
    expect(renamed).not.toBe(edited);

    put('app/app.json', '{"name":"B"}');
    expect(syncShadow(app(), shadow()).revision).not.toBe(renamed);
  });

  it('does not rewrite a mirrored file that has not changed, so the build sees no change', () => {
    put('app/app.json', '{}');
    put('app/button.contract', BUTTON);
    syncShadow(app(), shadow());
    const mirrored = join(shadow(), 'button.contract');
    // A whole second: a file system keeps a time as it stores it, which is not always to the millisecond given.
    const past = new Date(Math.floor(Date.now() / 1000) * 1000 - 60_000);
    utimesSync(mirrored, past, past);
    const before = statSync(mirrored).mtimeMs;
    syncShadow(app(), shadow());
    expect(statSync(mirrored).mtimeMs).toBe(before);
    expect(Math.abs(before - past.getTime())).toBeLessThan(1000);
  });

  it('mirrors the app’s assets as files of the shadow’s own, which the compiler will read a font from', () => {
    put('app/app.json', '{}');
    put('app/button.contract', BUTTON);
    put('app/assets/logo.png', 'png');
    put('app/assets/fonts/brand.ttf', 'ttf');
    const first = syncShadow(app(), shadow());
    const assets = join(shadow(), 'assets');
    expect(lstatSync(assets).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(assets, 'logo.png'), 'utf8')).toBe('png');
    expect(readFileSync(join(assets, 'fonts/brand.ttf'), 'utf8')).toBe('ttf');
    expect(first.sources).toContain(join(app(), 'assets/logo.png'));
    expect(syncShadow(app(), shadow()).revision).toBe(first.revision);
  });

  it('follows an asset that changed or went, and gives the build a new revision', () => {
    put('app/app.json', '{}');
    put('app/assets/logo.png', 'png');
    put('app/assets/old.png', 'old');
    const first = syncShadow(app(), shadow());
    // As an editor saves: a new file in the old one's place.
    rmSync(join(app(), 'assets/logo.png'));
    put('app/assets/logo.png', 'new png');
    rmSync(join(app(), 'assets/old.png'));
    const second = syncShadow(app(), shadow());
    expect(readFileSync(join(shadow(), 'assets/logo.png'), 'utf8')).toBe('new png');
    expect(existsSync(join(shadow(), 'assets/old.png'))).toBe(false);
    expect(second.revision).not.toBe(first.revision);
  });

  it('replaces the link to the assets an earlier version left', () => {
    put('app/app.json', '{}');
    put('app/assets/logo.png', 'png');
    mkdirSync(shadow(), { recursive: true });
    symlinkSync(join(app(), 'assets'), join(shadow(), 'assets'), 'dir');
    syncShadow(app(), shadow());
    expect(lstatSync(join(shadow(), 'assets')).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(app(), 'assets/logo.png'), 'utf8')).toBe('png');
  });

  it('installs a library in an empty app instead of mirroring it, so that it is used as a package', () => {
    put('app/package.json', JSON.stringify({ name: '@acme/cards', exports: { '.': './index.contract' } }));
    put('app/index.contract', 'use Card from "./card.contract"\n');
    put('app/card.contract', BUTTON);
    put('app/cards.tamber', 'tokens');
    const synced = syncShadow(app(), shadow());
    expect(libraryOf(app())).toEqual({ name: '@acme/cards' });
    expect(existsSync(join(shadow(), 'card.contract'))).toBe(false);
    expect(existsSync(join(shadow(), 'cards.tamber'))).toBe(false);
    expect(JSON.parse(readFileSync(join(shadow(), 'app.json'), 'utf8'))).toMatchObject({ start_url: '/' });
    expect(realpathSync(join(shadow(), 'node_modules/@acme/cards'))).toBe(realpathSync(app()));
    // Its sources are still what a build depends on.
    expect(synced.sources).toContain(join(app(), 'card.contract'));
    put('app/card.contract', `${BUTTON}// changed\n`);
    expect(syncShadow(app(), shadow()).revision).not.toBe(synced.revision);
  });

  it('takes a package that exports no Contract, or has an app.json, for an app', () => {
    put('app/package.json', JSON.stringify({ name: 'site', exports: { '.': './index.js' } }));
    expect(libraryOf(app())).toBeNull();
    put('app/package.json', JSON.stringify({ name: '@acme/cards', exports: './index.contract' }));
    expect(libraryOf(app())).toEqual({ name: '@acme/cards' });
    put('app/app.json', '{}');
    expect(libraryOf(app())).toBeNull();
  });

  it('does not mirror a shadow kept inside the app into itself', () => {
    put('app/app.json', '{}');
    put('app/button.contract', BUTTON);
    const inside = join(app(), 'cache', 'shadow');
    syncShadow(app(), inside);
    const { sources } = syncShadow(app(), inside);
    expect(sources).toEqual([join(app(), 'button.contract')]);
    expect(existsSync(join(inside, 'cache'))).toBe(false);
  });
});

describe('unshadow', () => {
  const app = '/work/app';
  const shadow = '/work/app/node_modules/.cache/storybook-framework-exact/app-1234/shadow';

  it('turns a path in the shadow into the author’s', () => {
    const message = `${shadow}${sep}components${sep}button.contract:9:5 [type-call-arity] \`on_press\` takes 0 argument(s), given 1`;
    expect(unshadow(message, app, shadow)).toBe(`${app}${sep}components${sep}button.contract:9:5 [type-call-arity] \`on_press\` takes 0 argument(s), given 1`);
  });

  it('turns every mention, and the shadow directory itself', () => {
    const message = `in ${shadow}: ${shadow}${sep}a.contract and ${shadow}${sep}b.contract`;
    expect(unshadow(message, app, shadow)).toBe(`in ${app}: ${app}${sep}a.contract and ${app}${sep}b.contract`);
  });

  it('leaves other text alone', () => {
    expect(unshadow('expected `string`, given `bool`', app, shadow)).toBe('expected `string`, given `bool`');
  });
});

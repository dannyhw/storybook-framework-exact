// The shadow app: a copy of an app's Contract sources that stories are built in.
//
// Exact builds an app directory, and a `use` may not leave it. A story's wrapper has to sit at that
// directory's root to reach every component, and Exact's build would also pick up the app's own `app.ts`,
// Rust module and native modules, none of which a story runs. So the build happens in a mirror kept in a
// cache: the app's `.contract` and `.tamber` files, a trimmed `app.json`, and a link to its assets. Nothing
// is written into the app's own tree.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { cacheHome } from './toolchain.ts';

const MIRRORED = ['.contract', '.tamber'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'target', 'dist', 'storybook-static', 'apple', 'android', 'web']);
export const WRAPPER_PREFIX = '__story_';

/**
 * `app.json` keys that make Exact's build compile or bundle code a story never runs (the app's data
 * modules, native modules, delivery), or that name files the shadow does not hold.
 */
const DROPPED_MANIFEST_KEYS = [
  '$schema', 'rust', 'typescript', 'data', 'modules', 'moduleConfig', 'launch', 'gpu', 'game', 'hatches', 'implementations',
  'before_build', 'commands', 'server', 'deploy', 'install', 'verify', 'env', 'auth', 'purchases', 'dev',
  'live_activities', 'watch', 'widgets', 'icons',
];

const digest = (text: string, length = 8) => createHash('sha256').update(text).digest('hex').slice(0, length);

/** The app a Contract file belongs to: the nearest directory with an `app.json`, else with a `package.json` (a library), else its own. */
export function appDirectory(file: string): string {
  const start = dirname(resolve(file));
  for (const marker of ['app.json', 'package.json']) {
    for (let dir = start; ; dir = dirname(dir)) {
      if (existsSync(join(dir, marker))) return dir;
      if (dirname(dir) === dir) break;
    }
  }
  return start;
}

/**
 * Where an app's shadow and builds are kept: under the nearest `node_modules`, so a `use` of a package
 * resolves from the shadow as it does from the app (and git ignores it), else in the machine cache.
 */
export function projectCache(appDir: string): string {
  for (let dir = appDir; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules'))) return join(dir, 'node_modules', '.cache', 'storybook-framework-exact', `${basename(appDir)}-${digest(appDir)}`);
    if (dirname(dir) === dir) return join(cacheHome(), 'projects', `${basename(appDir)}-${digest(appDir)}`);
  }
}

function walk(dir: string, visit: (file: string) => void, top = true): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // An Exact app's host crates (`apple/`, `web/`) sit beside its sources and hold no Contract.
      if (SKIPPED_DIRECTORIES.has(entry.name) && (top || entry.name === 'node_modules' || entry.name === 'target')) continue;
      walk(path, visit, false);
    } else if (MIRRORED.some((ext) => entry.name.endsWith(ext))) visit(path);
  }
}

function shadowManifest(appDir: string): string {
  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf8'));
  } catch {
    // A library has no app.json: the shadow gets one, since Exact builds apps.
  }
  for (const key of DROPPED_MANIFEST_KEYS) delete manifest[key];
  const name = typeof manifest.name === 'string' ? manifest.name : basename(appDir);
  const id = typeof manifest.id === 'string' ? manifest.id : `dev.storybook.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'stories'}`;
  const app = typeof manifest.app === 'object' && manifest.app ? (manifest.app as Record<string, unknown>) : {};
  return `${JSON.stringify({ ...manifest, name, id, start_url: '/', app: { ...app, id: app.id ?? id, name: app.name ?? name } }, null, 2)}\n`;
}

function writeIfChanged(path: string, text: string | Buffer): void {
  try {
    if (Buffer.from(text).equals(readFileSync(path))) return;
  } catch {
    // not there yet
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export interface Synced {
  /** The app's Contract and design sources, absolute: what a watcher must watch. */
  sources: string[];
  /** A digest of every mirrored file: it changes when a build could. */
  revision: string;
}

/** Bring `shadow` up to date with `appDir`, and say what it holds. */
export function syncShadow(appDir: string, shadow: string): Synced {
  mkdirSync(shadow, { recursive: true });
  const sources: string[] = [];
  const hash = createHash('sha256');
  const kept = new Set<string>();
  walk(appDir, (file) => {
    // The cache may be inside the app (its own node_modules is skipped, a parent's is not reached).
    if (file.startsWith(shadow + sep)) return;
    const rel = relative(appDir, file);
    const content = readFileSync(file);
    sources.push(file);
    kept.add(rel);
    hash.update(rel).update('\0').update(content).update('\0');
    writeIfChanged(join(shadow, rel), content);
  });
  const manifest = shadowManifest(appDir);
  hash.update(manifest);
  writeIfChanged(join(shadow, 'app.json'), manifest);

  // A source deleted or renamed in the app leaves the shadow too, or a `use` of it would still resolve.
  const stale: string[] = [];
  walk(shadow, (file) => {
    const rel = relative(shadow, file);
    if (!kept.has(rel) && !basename(file).startsWith(WRAPPER_PREFIX)) stale.push(file);
  });
  for (const file of stale) rmSync(file, { force: true });

  const assets = join(appDir, 'assets');
  const linked = join(shadow, 'assets');
  if (existsSync(assets) && statSync(assets).isDirectory() && !lstatSync(linked, { throwIfNoEntry: false })) {
    symlinkSync(assets, linked, 'dir');
  }
  return { sources: sources.sort(), revision: hash.digest('hex').slice(0, 16) };
}

/** A path inside the shadow as the author knows it, for a compiler message. */
export function unshadow(text: string, appDir: string, shadow: string): string {
  return text.split(shadow + sep).join(appDir + sep).split(shadow).join(appDir);
}

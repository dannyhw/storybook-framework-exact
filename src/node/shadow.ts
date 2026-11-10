// The shadow app: a copy of an app's Contract sources that stories are built in.
//
// Exact builds an app directory, and a `use` may not leave it. A story's wrapper has to sit at that
// directory's root to reach every component, and Exact's build would also pick up the app's own `app.ts`,
// Rust module and native modules, none of which a story runs. So the build happens in a mirror kept in a
// cache: the app's `.contract` and `.tamber` files, a trimmed `app.json`, and its assets. Nothing is written
// into the app's own tree.
//
// A library (a package whose `exports` name a Contract file) is not mirrored: Exact gives a package its
// tokens only when it is reached as a package, so the shadow is an empty app that depends on it.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
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

/**
 * What a Contract file is built as part of: the nearest app (a directory with an `app.json`) or library (a
 * package that exports Contract), else the nearest package, else its own directory. A library kept inside
 * an app is still a library: Exact gives it its tokens only as one.
 */
export function appDirectory(file: string): string {
  const start = dirname(resolve(file));
  let packaged: string | null = null;
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'app.json')) || libraryOf(dir)) return dir;
    if (!packaged && existsSync(join(dir, 'package.json'))) packaged = dir;
    if (dirname(dir) === dir) return packaged ?? start;
  }
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

export interface Library {
  /** The name it is used by: `use Card from "@scope/cards"`. */
  name: string;
}

/** The library an app directory is, when it is a package that exports Contract and not an app. */
export function libraryOf(appDir: string): Library | null {
  if (existsSync(join(appDir, 'app.json'))) return null;
  try {
    const { name, exports } = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as { name?: unknown; exports?: unknown };
    const main = typeof exports === 'string' ? exports : (exports as Record<string, unknown> | null)?.['.'];
    return typeof name === 'string' && typeof main === 'string' && main.endsWith('.contract') ? { name } : null;
  } catch {
    return null;
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

/** Every file under `dir`, whatever it is. */
function files(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files(path, found);
    else found.push(path);
  }
  return found;
}

/**
 * The app's assets in the shadow, as hard links where the file system allows them and copies where it does
 * not. A link to the directory would be cheaper, and the compiler refuses a font it reaches through one.
 */
function mirrorAssets(from: string, to: string, note: (file: string, stamp: string) => void): void {
  const linked = lstatSync(to, { throwIfNoEntry: false });
  if (linked?.isSymbolicLink()) unlinkSync(to);
  const kept = new Set<string>();
  const present = existsSync(from) && statSync(from).isDirectory();
  for (const file of present ? files(from) : []) {
    const rel = relative(from, file);
    const source = statSync(file);
    kept.add(rel);
    note(file, `${rel}\0${source.size}\0${source.mtimeMs}\0`);
    const target = join(to, rel);
    const mirrored = statSync(target, { throwIfNoEntry: false });
    // The same file (a hard link), or a copy made since the asset last changed.
    if (mirrored && ((mirrored.ino === source.ino && mirrored.dev === source.dev) || (mirrored.size === source.size && mirrored.mtimeMs >= source.mtimeMs && mirrored.nlink === 1))) continue;
    rmSync(target, { force: true });
    mkdirSync(dirname(target), { recursive: true });
    try {
      linkSync(file, target);
    } catch {
      copyFileSync(file, target);
    }
  }
  if (!existsSync(to)) return;
  for (const file of files(to)) if (!kept.has(relative(to, file))) rmSync(file, { force: true });
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
  const library = libraryOf(appDir);
  const sources: string[] = [];
  const hash = createHash('sha256');
  const kept = new Set<string>();
  walk(appDir, (file) => {
    // The cache may be inside the app (its own node_modules is skipped, a parent's is not reached).
    if (file.startsWith(shadow + sep)) return;
    const rel = relative(appDir, file);
    const content = readFileSync(file);
    sources.push(file);
    hash.update(rel).update('\0').update(content).update('\0');
    if (library) return;
    kept.add(rel);
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

  if (library) {
    const installed = join(shadow, 'node_modules', library.name);
    if (!lstatSync(installed, { throwIfNoEntry: false })) {
      mkdirSync(dirname(installed), { recursive: true });
      symlinkSync(appDir, installed, 'dir');
    }
  } else {
    mirrorAssets(join(appDir, 'assets'), join(shadow, 'assets'), (file, stamp) => {
      sources.push(file);
      hash.update(stamp);
    });
  }
  return { sources: sources.sort(), revision: hash.digest('hex').slice(0, 16) };
}

/** A path inside the shadow as the author knows it, for a compiler message. */
export function unshadow(text: string, appDir: string, shadow: string): string {
  const library = libraryOf(appDir);
  const direct = library ? text.split(join(shadow, 'node_modules', library.name)).join(appDir) : text;
  return direct.split(shadow + sep).join(appDir + sep).split(shadow).join(appDir);
}

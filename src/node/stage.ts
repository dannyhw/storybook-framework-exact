// The staged runtime: what Exact's web build puts beside an app's generated files, kept so that the next
// component needs only the compiler.
//
// Exact's build (host/web-js/build.mjs) runs the compiler, which writes the app's own modules (`app.js`,
// `names.js`, `app.css`, its plan), then stages about 130 runtime modules and a boot module around them.
// What it stages depends on the app only through what the compiler reports: the `*.flag` files it writes
// and the sources the app asks. So two components that report the same get the same staging, byte for byte,
// but for the plan's digest in the boot module. The first component of each kind pays for Exact's build;
// the others run the compiler alone and reuse its staging.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** What the compiler writes for every app: the app's own, which never decide the staging. */
const OWN = new Set(['app.js', 'app.css', 'names.js', 'app.plan', 'app.bind.plan', 'app.plan.map.json', 'app.contract.d.ts', 'pages.json', 'paint.js', 'symbol-roles.js']);

/** Modules of the staging written for each component, so never shared: the boot module, and what derives from the app's names. */
const PER_COMPONENT = new Set(['main.js', 'agent-names.js', 'storybook-entry.js']);

/** Files Exact's build leaves in its module directory that no module imports. */
const UNUSED = new Set(['server.js', 'modules.json', 'page-style.json']);

const digest = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');

/** The sources an app asks, as Exact's build reads them from the compiler's `app.js`. */
export function sourcesOf(app: string): string[] {
  const text = /export const sources=(\{.*?\});export const wait=/.exec(app)?.[1];
  return text ? Object.keys(JSON.parse(text)) : [];
}

/**
 * What decides the staging of a compiled app, as text: equal for two apps that Exact's build would stage
 * alike. It follows build.mjs: each flag the compiler wrote (and any other file that is not the app's own,
 * taken to matter), whether the app reads the time, and whether it asks a source of its own.
 */
export function stagingKey(compiled: string): string {
  const files = readdirSync(compiled).sort();
  const extras = files.filter((file) => !OWN.has(file)).map((file) => `${file}:${digest(readFileSync(join(compiled, file))).slice(0, 16)}`);
  const sources = sourcesOf(readFileSync(join(compiled, 'app.js'), 'utf8'));
  let moduleSources: string[] = [];
  try {
    moduleSources = (JSON.parse(readFileSync(join(compiled, 'modules.flag'), 'utf8')) as { sources?: string[] }).sources ?? [];
  } catch {
    // no native module
  }
  const time = sources.includes('exactTime');
  const asks = sources.some((name) => !/^exact[A-Z]/.test(name) && !moduleSources.includes(name));
  return JSON.stringify({ extras, time, asks });
}

export interface Stage {
  /** The staged modules, without the app's own and the per-component ones. */
  modules: string;
  /** The boot module of the component the stage was made from. */
  main: string;
  /** The web host's base stylesheet, which an app's follows. */
  base: string;
  id: string;
}

const stageAt = (directory: string, id: string): Stage => ({
  modules: join(directory, 'modules'),
  main: readFileSync(join(directory, 'main.js'), 'utf8'),
  base: readFileSync(join(directory, 'base.css'), 'utf8'),
  id,
});

/** The stage kept for `key`, or null. */
export function findStage(stages: string, key: string): Stage | null {
  const id = digest(key).slice(0, 16);
  const directory = join(stages, id);
  return existsSync(join(directory, 'ready')) ? stageAt(directory, id) : null;
}

/**
 * Keep the staging of one whole build (`out`, as Exact's build wrote it for the app compiled in `compiled`)
 * for every component with the same key.
 */
export function keepStage(stages: string, key: string, out: string, compiled: string): Stage {
  const id = digest(key).slice(0, 16);
  const directory = join(stages, id);
  const partial = `${directory}.partial-${process.pid}`;
  rmSync(partial, { recursive: true, force: true });
  mkdirSync(join(partial, 'modules'), { recursive: true });
  const gen = join(out, '.gen');
  const own = new Set(readdirSync(compiled));
  for (const entry of readdirSync(gen, { withFileTypes: true })) {
    if (!entry.isFile() || own.has(entry.name) || OWN.has(entry.name) || PER_COMPONENT.has(entry.name) || UNUSED.has(entry.name)) continue;
    copyFileSync(join(gen, entry.name), join(partial, 'modules', entry.name));
  }
  copyFileSync(join(gen, 'main.js'), join(partial, 'main.js'));
  const style = readFileSync(join(out, 'style.css'), 'utf8');
  const app = readFileSync(join(gen, 'app.css'), 'utf8');
  if (!style.endsWith(app)) throw new Error("Exact's build no longer writes style.css as its base sheet followed by the app's. This Exact revision is newer than storybook-framework-exact supports.");
  writeFileSync(join(partial, 'base.css'), style.slice(0, style.length - app.length));
  writeFileSync(join(partial, 'key.json'), key);
  writeFileSync(join(partial, 'ready'), '');
  rmSync(directory, { recursive: true, force: true });
  renameSync(partial, directory);
  return stageAt(directory, id);
}

/** The boot module for another plan: Exact's build writes the plan's digest into it, for its performance tools. */
export function bootModule(main: string, plan: Buffer): string {
  return main.replace(/(globalThis\.exact\.plan = )"[0-9a-f]+"/, `$1"${digest(plan)}"`);
}

/**
 * The module directory of a component: the stage's modules (as links, where the file system has them) with
 * the compiler's output for the component among them, as Exact's build would have left it.
 */
export function assemble(stage: Stage, compiled: string, gen: string): void {
  const marker = join(gen, '.stage.json');
  let last: { stage: string; own: string[] } | null = null;
  try {
    last = JSON.parse(readFileSync(marker, 'utf8'));
  } catch {
    // first time, or another stage's
  }
  if (last?.stage !== stage.id) {
    rmSync(gen, { recursive: true, force: true });
    mkdirSync(gen, { recursive: true });
    for (const name of readdirSync(stage.modules)) {
      try {
        linkSync(join(stage.modules, name), join(gen, name));
      } catch {
        copyFileSync(join(stage.modules, name), join(gen, name));
      }
    }
  } else {
    // Never written in place: a linked file is the stage's too.
    for (const name of [...last.own, ...PER_COMPONENT]) rmSync(join(gen, name), { force: true });
  }
  const own = readdirSync(compiled);
  for (const name of own) {
    rmSync(join(gen, name), { force: true });
    copyFileSync(join(compiled, name), join(gen, name));
  }
  writeFileSync(join(gen, 'main.js'), bootModule(stage.main, readFileSync(join(compiled, 'app.plan'))));
  copyFileSync(join(compiled, 'names.js'), join(gen, 'agent-names.js'));
  writeFileSync(marker, JSON.stringify({ stage: stage.id, own }));
}

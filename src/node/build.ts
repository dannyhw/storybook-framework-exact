// A component's build: the wrapper compiled by Exact's web compiler, set among the runtime modules Exact's
// own web build stages, then bundled with an entry this framework owns so the preview can start the app in a
// canvas and answer its data seam.
//
// A story is built when it is first shown and again after each edit, so a build is what the author waits
// for. Three things keep it to a few tens of milliseconds: Exact's whole build runs once for each kind of
// component and its staging is reused (stage.ts); what the compiler said about a component's action props is
// remembered; and a build is kept on disk, so a server that starts again builds only what changed.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { ComponentInfo, ExactComponent, Manifest, WireType } from '../types.ts';
import { type Diagnostic, type Signatures, defaultFor, isAction, needsBox, parseComponents, refineSignatures, wrapperSource } from './contract.ts';
import { withLock } from './lock.ts';
import { WRAPPER_PREFIX, appDirectory, libraryOf, projectCache, syncShadow, unshadow } from './shadow.ts';
import { assemble, findStage, keepStage, stagingKey } from './stage.ts';
import type { Log, Toolchain } from './toolchain.ts';

const exec = promisify(execFile);

/** The URL prefix builds are served and emitted under, relative to the page. */
export const ASSETS = 'exact-assets';

/** How many builds of a component stay on disk, the current one included. */
const KEPT_VERSIONS = 4;

const digest = (text: string | Buffer, length = 12) => createHash('sha256').update(text).digest('hex').slice(0, length);
const posix = (path: string) => path.split(sep).join('/');

export interface Built {
  manifest: Manifest;
  /** The files the manifest names, on disk. */
  bundle: string;
  css: string;
}

interface Registered {
  component: ComponentInfo;
  file: string;
  appDir: string;
  /** Whether it is its file's first component, which only matters for a root. */
  first: boolean;
}

/** How a component's generated root was written when it last compiled. */
interface Wrapper {
  signatures: Signatures;
  boxed: boolean;
}

/** What is kept of a component between servers: its last build, and how its generated root was written. */
interface Kept {
  stamp: string;
  revision?: string;
  manifest?: Manifest;
  wrapper?: Wrapper;
}

/**
 * What a kept build was made by: this framework's code and the compiler. A build made by another of either
 * is made again.
 */
export function stampOf(toolchain: Toolchain, wholeBuilds = false): string {
  const of = (path: string) => {
    const stat = statSync(path, { throwIfNoEntry: false });
    return `${path}:${stat?.size}:${stat?.mtimeMs}`;
  };
  // Every module beside this one has a hand in a build: the wrapper's text, the shadow, the staging.
  const here = dirname(fileURLToPath(import.meta.url));
  const own = readdirSync(here)
    .sort()
    .map((name) => of(join(here, name)));
  return digest([...own, of(toolchain.compiler), of(join(toolchain.root, 'host/web-js/build.mjs')), wholeBuilds].join('\n'));
}

export interface BuilderOptions {
  /**
   * Run Exact's whole web build for every component instead of reusing its staging: slower, and the check
   * on that reuse. Also `STORYBOOK_EXACT_WHOLE_BUILDS=1`.
   */
  wholeBuilds?: boolean;
}

const BUFFER = 64 * 1024 * 1024;

/**
 * A compiler's output without its warnings. A failed build prints its warnings beside the error that
 * stopped it, and a warning is long (a paragraph of advice, then its code frame), so the error would be off
 * the screen.
 */
export function withoutWarnings(output: string): string {
  const kept: string[] = [];
  let inWarning = false;
  for (const line of output.split('\n')) {
    if (/:\d+:\d+ warning \[/.test(line)) inWarning = true;
    // A warning runs until the next line that is neither its code frame (` 11 | …`, `    | ^^^`) nor blank.
    else if (inWarning && !/^\s*\d*\s*\|/.test(line) && line.trim()) inWarning = false;
    if (!inWarning) kept.push(line);
  }
  const text = kept.join('\n').trim();
  return text || output.trim();
}

/** A failed command's message: Exact's scripts explain themselves on stderr. */
function failure(error: unknown): string {
  const e = error as { stderr?: string; stdout?: string; message?: string };
  return withoutWarnings(e.stderr?.trim() || e.stdout?.trim() || e.message || String(error));
}

/**
 * The entry the preview imports: Exact's generated `main.js`, which boots as it is imported, with the boot
 * handed to the preview instead. Keeping the rest of `main.js` keeps what Exact wires up there for a plan
 * (its fonts' wait, time and locale, dialogs, the development tools).
 */
export function storybookEntry(main: string): string {
  const boot = main.lastIndexOf('go(start);');
  if (boot < 0) {
    throw new Error("Exact's generated main.js no longer ends by booting with `go(start);`. This Exact revision is newer than storybook-framework-exact supports.");
  }
  return [
    main.slice(0, boot),
    main.slice(boot + 'go(start);'.length),
    "import { data as __sbData, commit as __sbCommit, R as __sbRefresh, Resources as __sbResources, journal as __sbJournal } from './rt.js';",
    'export function storybookStart(bridge) {',
    '  __sbData.answer = (source, args) => bridge.answer(source, args);',
    '  return Promise.resolve(go(start)).then(() => ({',
    '    journal: __sbJournal,',
    "    refresh(source) { return __sbCommit(() => { for (const r of __sbResources) if (r.source === source) __sbRefresh(r); }, 'storybook args'); },",
    '  }));',
    '}',
    '',
  ].join('\n');
}

/** `names.js` holds the plan's sources and their types as a JSON literal, in a module of plain exports. */
export function readSourceTypes(names: string): Record<string, [WireType[], WireType]> {
  const start = names.indexOf('export const sourceTypes=');
  if (start < 0) return {};
  const from = start + 'export const sourceTypes='.length;
  const end = names.indexOf(';export const', from);
  return JSON.parse(end < 0 ? names.slice(from).replace(/;\s*$/, '') : names.slice(from, end));
}

export class Builder {
  private readonly registered = new Map<string, Registered>();
  private readonly built = new Map<string, { revision: string; result: Promise<Built>; published?: string }>();
  /** The shadow and the build directory are shared, so this process's builds run one at a time. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Each app's revision when its components were last described. */
  private readonly revisions = new Map<string, string>();
  /** The components asked for, the latest last. */
  private recent: string[] = [];

  private readonly wholeBuilds: boolean;

  constructor(
    private readonly toolchain: () => Promise<Toolchain>,
    private readonly log: Log = () => {},
    options: BuilderOptions = {}
  ) {
    this.wholeBuilds = options.wholeBuilds ?? process.env.STORYBOOK_EXACT_WHOLE_BUILDS === '1';
  }

  /**
   * The components of a Contract file, as the modules that import it see them. With `warm`, an edit to the
   * app starts the builds of the components already shown, the one last asked for first: its story is on
   * screen, and its build is under way before the page asks for it.
   */
  describe(file: string, components: ComponentInfo[], warm = false): { descriptors: ExactComponent[]; sources: string[] } {
    const appDir = appDirectory(file);
    const { sources, revision } = syncShadow(appDir, join(projectCache(appDir), 'shadow'));
    const before = this.revisions.get(appDir);
    this.revisions.set(appDir, revision);
    if (warm && before && before !== revision) {
      // After this file's components are registered as they now are.
      queueMicrotask(() => {
        for (const id of [...this.recent].reverse()) {
          if (this.registered.get(id)?.appDir === appDir) this.build(id, true).catch(() => {});
        }
      });
    }
    const descriptors = components.map((component, index) => {
      const id = `${component.name}-${digest(file, 8)}`;
      this.registered.set(id, { component, file, appDir, first: index === 0 });
      const defaults: Record<string, unknown> = {};
      for (const field of [...component.props.filter((p) => !isAction(p)), ...component.inject]) defaults[field.name] = defaultFor(field.type);
      return { __exact: true as const, ...component, id, file: posix(relative(appDir, file)), defaults, manifest: `${ASSETS}/${id}/manifest.json`, revision };
    });
    return { descriptors, sources };
  }

  /** Where a served or emitted file of a build is on disk, or null when the path is not one. */
  resolveAsset(id: string, rest: string): string | null {
    const known = this.registered.get(id);
    if (!known) return null;
    const base = join(projectCache(known.appDir), 'serve', id);
    const path = join(base, rest);
    return path.startsWith(base + sep) && existsSync(path) ? path : null;
  }

  has(id: string): boolean {
    return this.registered.has(id);
  }

  /** The directories of the apps whose components are registered. */
  private apps(): string[] {
    return [...new Set([...this.registered.values()].map((known) => known.appDir))];
  }

  /** The file an app serves as `assets/<rest>`, or null. Of two apps with the same asset, the first registered wins. */
  asset(rest: string): string | null {
    for (const appDir of this.apps()) {
      const base = join(appDir, 'assets');
      const path = join(base, rest);
      if (path.startsWith(base + sep) && statSync(path, { throwIfNoEntry: false })?.isFile()) return path;
    }
    return null;
  }

  /** Every asset of the registered apps, by the path a page asks for it. */
  assets(): { name: string; file: string }[] {
    const found = new Map<string, string>();
    const collect = (base: string, dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) collect(base, path);
        else if (!found.has(posix(relative(base, path)))) found.set(posix(relative(base, path)), path);
      }
    };
    for (const appDir of this.apps()) {
      const base = join(appDir, 'assets');
      if (statSync(base, { throwIfNoEntry: false })?.isDirectory()) collect(base, base);
    }
    return [...found].map(([name, file]) => ({ name: `assets/${name}`, file }));
  }

  /**
   * A registered component as its file now has it. A build started ahead of the page (`describe`) may come
   * before the module of an edited file is loaded again.
   */
  private current(id: string): Registered | null {
    const known = this.registered.get(id);
    if (!known) return null;
    try {
      const components = parseComponents(readFileSync(known.file, 'utf8'));
      const at = components.findIndex((component) => component.name === known.component.name);
      if (at < 0) return null;
      const now = { ...known, component: components[at]!, first: at === 0 };
      this.registered.set(id, now);
      return now;
    } catch {
      return null;
    }
  }

  /** The build of a registered component, made when its sources changed since the last one. */
  build(id: string, ahead = false): Promise<Built> {
    const known = this.current(id);
    if (!known) return Promise.reject(new Error(`No Contract component is registered as ${id}.`));
    if (!ahead) this.recent = [...this.recent.filter((other) => other !== id), id].slice(-64);
    const cache = projectCache(known.appDir);
    const shadow = join(cache, 'shadow');
    const { revision } = syncShadow(known.appDir, shadow);
    const last = this.built.get(id);
    // A later build of the component may have pruned what this one published.
    if (last?.revision === revision && (!last.published || existsSync(last.published))) return last.result;
    const make = async () => {
      const toolchain = await this.toolchain();
      const stamp = stampOf(toolchain, this.wholeBuilds);
      return keptBuild(cache, id, stamp, revision) ?? withLock(cache, () => this.make(id, known, cache, shadow, toolchain, stamp, revision));
    };
    const result = this.queue.then(make, make);
    this.queue = result.catch(() => {});
    const entry: { revision: string; result: Promise<Built>; published?: string } = { revision, result };
    this.built.set(id, entry);
    result.then(
      (built) => {
        entry.published = built.bundle;
      },
      () => {
        if (this.built.get(id) === entry) this.built.delete(id);
      }
    );
    return result;
  }

  private async make(id: string, known: Registered, cache: string, shadow: string, toolchain: Toolchain, stamp: string, revision: string): Promise<Built> {
    const started = performance.now();
    const { component, file, appDir } = known;
    // An error may be in the generated root, a file the author does not have.
    const generated = join(appDir, `${WRAPPER_PREFIX}${id}.contract`);
    const explain = (error: unknown) => new Error(unshadow(failure(error), appDir, shadow).split(generated).join(`[the story generated for ${component.name}]`));
    const mirrored = join(shadow, relative(appDir, file));
    const options = { cwd: toolchain.root, env: toolchain.env, maxBuffer: BUFFER };

    const work = join(cache, 'build', id);
    const compiled = join(work, 'app');
    let entry = mirrored;
    /** The app's own modules, from the compiler alone. */
    const compile = async () => {
      rmSync(compiled, { recursive: true, force: true });
      mkdirSync(compiled, { recursive: true });
      await exec(toolchain.compiler, ['js', entry, '-o', compiled, '--app', shadow, '--sites'], options);
    };

    const library = libraryOf(appDir);
    let wrapper: Wrapper | undefined;
    if (component.root) {
      if (!known.first) throw new Error(`${component.name} owns data or routes (a resource, mutation, task or \`routes\`), which only a file's first component may: it cannot be built as a story.`);
      if (library) throw new Error(`${component.name} owns data or routes, which only an app's root may, and ${library.name} is a library: it cannot be built as a story.`);
      await compile().catch((error) => {
        throw explain(error);
      });
    } else {
      entry = join(shadow, `${WRAPPER_PREFIX}${id}.contract`);
      // A library's component is used as the library's users use it: by the package's name, which is what gives it the package's tokens.
      const specifier = library ? library.name : `./${posix(relative(shadow, mirrored))}`;
      // As it last compiled, which it still does unless the edit was to what its action props are given.
      wrapper = readKept(cache, id)?.wrapper;
      let done = false;
      // Without its box first: a component that no longer needs one would compile in it all the same.
      for (const boxed of wrapper ? (wrapper.boxed ? [false, true] : [false]) : []) {
        writeFileSync(entry, wrapperSource(component, specifier, wrapper!.signatures, boxed));
        done = await compile().then(
          () => true,
          () => false
        );
        if (done) {
          wrapper = { signatures: wrapper!.signatures, boxed };
          break;
        }
      }
      if (!done) {
        wrapper = await this.inferSignatures(toolchain, component, specifier, entry).catch((error) => {
          throw explain(error);
        });
        await compile().catch((error) => {
          throw explain(error);
        });
      }
    }

    // The runtime modules around the app's: Exact's whole build for the first component of its kind, kept for the rest.
    const wholeBuild = async (out: string) => {
      await exec(toolchain.bun, [join(toolchain.root, 'host/web-js/build.mjs'), shadow, '--contract', entry, '--out', out, '--render', 'none'], options).catch((error) => {
        throw explain(error);
      });
    };
    let gen = join(work, 'gen');
    let sheet: string;
    if (this.wholeBuilds) {
      const out = join(work, 'whole');
      await wholeBuild(out);
      gen = join(out, '.gen');
      sheet = readFileSync(join(out, 'style.css'), 'utf8');
    } else {
      const stages = join(cache, 'stage', stamp);
      const key = JSON.stringify([stagingKey(compiled), digest(readFileSync(join(shadow, 'app.json')))]);
      let stage = findStage(stages, key);
      if (!stage) {
        // Stages of another compiler or another version of this framework are no one's now.
        mkdirSync(stages, { recursive: true });
        for (const other of readdirSync(join(cache, 'stage')).filter((name) => name !== stamp)) rmSync(join(cache, 'stage', other), { recursive: true, force: true });
        const out = join(work, 'whole');
        await wholeBuild(out);
        stage = keepStage(stages, key, out, compiled);
        rmSync(out, { recursive: true, force: true });
      }
      assemble(stage, compiled, gen);
      sheet = stage.base + readFileSync(join(compiled, 'app.css'), 'utf8');
    }

    writeFileSync(join(gen, 'storybook-entry.js'), storybookEntry(readFileSync(join(gen, 'main.js'), 'utf8')));
    const bundled = join(work, 'storybook-bundle.js');
    await exec(toolchain.bun, ['build', join(gen, 'storybook-entry.js'), '--outfile', bundled, '--format', 'esm', '--target', 'browser', '--define', 'process.env.NODE_ENV="production"'], {
      ...options,
      cwd: gen,
    }).catch((error) => {
      throw explain(error);
    });

    const code = readFileSync(bundled);
    // A stylesheet names a font relative to itself and a view names an image relative to the page. The
    // app's assets are served once, beside the page, so the stylesheet's are pointed there.
    const style = Buffer.from(sheet.replace(/url\((["']?)assets\//g, `url($1${'../'.repeat(3)}assets/`));
    const version = digest(Buffer.concat([code, style]));
    const serve = join(cache, 'serve', id);
    // A page may still be loading a version before this one (this server's, or another's on the same
    // app), so the newest few stay; older ones are no one's.
    if (existsSync(serve)) {
      const older = readdirSync(serve)
        .filter((v) => v !== version)
        .map((v) => ({ v, at: statSync(join(serve, v)).mtimeMs }))
        .sort((a, b) => b.at - a.at);
      for (const stale of older.slice(KEPT_VERSIONS - 1)) rmSync(join(serve, stale.v), { recursive: true, force: true });
    }
    const published = join(serve, version);
    mkdirSync(published, { recursive: true });
    cpSync(bundled, join(published, 'bundle.js'));
    writeFileSync(join(published, 'style.css'), style);

    const manifest: Manifest = {
      version,
      bundle: `${ASSETS}/${id}/${version}/bundle.js`,
      css: `${ASSETS}/${id}/${version}/style.css`,
      sourceTypes: readSourceTypes(readFileSync(join(gen, 'names.js'), 'utf8')),
      buildMs: Math.round(performance.now() - started),
    };
    writeKept(cache, id, { stamp, revision, manifest, wrapper });
    this.log(`Built ${component.name} (${posix(relative(appDir, file))}) in ${manifest.buildMs} ms`);
    return { manifest, bundle: join(published, 'bundle.js'), css: join(published, 'style.css') };
  }

  /**
   * Write the wrapper, asking the compiler what it needs until it compiles: what each action prop is given,
   * and whether the component has to sit in a box.
   */
  private async inferSignatures(toolchain: Toolchain, component: ComponentInfo, specifier: string, entry: string): Promise<Wrapper> {
    const signatures: Signatures = {};
    let boxed = false;
    // One compile for each handler's count, one for each parameter of the longest, and the one that passes.
    for (let attempt = 0; attempt < 16; attempt++) {
      writeFileSync(entry, wrapperSource(component, specifier, signatures, boxed));
      // Its errors alone: the warnings are the build's to print, and take the compiler longer to find.
      const outcome = await exec(toolchain.contract, ['build', '--json', '--errors-only', entry], { env: toolchain.env, maxBuffer: BUFFER }).then(
        (ok) => ({ failed: false, stdout: ok.stdout, stderr: ok.stderr }),
        (error: { stdout?: string; stderr?: string }) => ({ failed: true, stdout: error.stdout ?? '', stderr: error.stderr ?? '' })
      );
      if (!outcome.failed) return { signatures, boxed };
      let diagnostics: Diagnostic[] = [];
      try {
        diagnostics = JSON.parse(outcome.stdout);
      } catch {
        throw new Error(outcome.stderr || outcome.stdout);
      }
      const errors = diagnostics.filter((d) => d.severity === 'error');
      const refined = refineSignatures(component, signatures, errors);
      const box = !boxed && needsBox(errors);
      if (box) boxed = true;
      // Anything the wrapper did not cause is the component's own error: the build reports it in full.
      if (!refined && !box) return { signatures, boxed };
    }
    throw new Error(`Could not work out what ${component.name}'s action props are given.`);
  }
}

const keptPath = (cache: string, id: string) => join(cache, 'kept', `${id}.json`);

function readKept(cache: string, id: string): Kept | null {
  try {
    return JSON.parse(readFileSync(keptPath(cache, id), 'utf8')) as Kept;
  } catch {
    return null;
  }
}

function writeKept(cache: string, id: string, kept: Kept): void {
  mkdirSync(join(cache, 'kept'), { recursive: true });
  writeFileSync(keptPath(cache, id), JSON.stringify(kept));
}

/** The build an earlier server left for this revision, when what made it is what would make it now. */
function keptBuild(cache: string, id: string, stamp: string, revision: string): Built | null {
  const kept = readKept(cache, id);
  if (!kept?.manifest || kept.stamp !== stamp || kept.revision !== revision) return null;
  const published = join(cache, 'serve', id, kept.manifest.version);
  const built = { manifest: { ...kept.manifest, buildMs: 0 }, bundle: join(published, 'bundle.js'), css: join(published, 'style.css') };
  return existsSync(built.bundle) && existsSync(built.css) ? built : null;
}

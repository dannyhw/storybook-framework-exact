// A component's build: the wrapper compiled by Exact's own web build, then bundled with an entry this
// framework owns so the preview can start the app in a canvas and answer its data seam.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { promisify } from 'node:util';

import type { ComponentInfo, ExactComponent, Manifest, WireType } from '../types.ts';
import { type Diagnostic, type Signatures, defaultFor, isAction, refineSignatures, wrapperSource } from './contract.ts';
import { withLock } from './lock.ts';
import { WRAPPER_PREFIX, appDirectory, projectCache, syncShadow, unshadow } from './shadow.ts';
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

  constructor(
    private readonly toolchain: () => Promise<Toolchain>,
    private readonly log: Log = () => {}
  ) {}

  /** The components of a Contract file, as the modules that import it see them. */
  describe(file: string, components: ComponentInfo[]): { descriptors: ExactComponent[]; sources: string[] } {
    const appDir = appDirectory(file);
    const { sources, revision } = syncShadow(appDir, join(projectCache(appDir), 'shadow'));
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

  /** The build of a registered component, made when its sources changed since the last one. */
  build(id: string): Promise<Built> {
    const known = this.registered.get(id);
    if (!known) return Promise.reject(new Error(`No Contract component is registered as ${id}.`));
    const cache = projectCache(known.appDir);
    const shadow = join(cache, 'shadow');
    const { revision } = syncShadow(known.appDir, shadow);
    const last = this.built.get(id);
    // A later build of the component may have pruned what this one published.
    if (last?.revision === revision && (!last.published || existsSync(last.published))) return last.result;
    const make = () => withLock(cache, () => this.make(id, known, cache, shadow));
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

  private async make(id: string, known: Registered, cache: string, shadow: string): Promise<Built> {
    const started = Date.now();
    const { component, file, appDir } = known;
    const toolchain = await this.toolchain();
    const explain = (error: unknown) => new Error(unshadow(failure(error), appDir, shadow));
    const mirrored = join(shadow, relative(appDir, file));

    let entry = mirrored;
    if (component.root) {
      if (!known.first) throw new Error(`${component.name} owns data (a resource, mutation or task), which only a file's first component may: it cannot be built as a story.`);
    } else {
      entry = join(shadow, `${WRAPPER_PREFIX}${id}.contract`);
      await this.inferSignatures(toolchain, component, `./${posix(relative(shadow, mirrored))}`, entry).catch((error) => {
        throw explain(error);
      });
    }

    const out = join(cache, 'build', id);
    await exec(toolchain.bun, [join(toolchain.root, 'host/web-js/build.mjs'), shadow, '--contract', entry, '--out', out], {
      cwd: toolchain.root,
      env: toolchain.env,
      maxBuffer: 64 * 1024 * 1024,
    }).catch((error) => {
      throw explain(error);
    });

    const gen = join(out, '.gen');
    writeFileSync(join(gen, 'storybook-entry.js'), storybookEntry(readFileSync(join(gen, 'main.js'), 'utf8')));
    const bundled = join(out, 'storybook-bundle.js');
    await exec(toolchain.bun, ['build', join(gen, 'storybook-entry.js'), '--outfile', bundled, '--format', 'esm', '--target', 'browser', '--define', 'process.env.NODE_ENV="production"'], {
      cwd: gen,
      env: toolchain.env,
      maxBuffer: 64 * 1024 * 1024,
    }).catch((error) => {
      throw explain(error);
    });

    const code = readFileSync(bundled);
    const style = readFileSync(join(out, 'style.css'));
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
    cpSync(join(out, 'style.css'), join(published, 'style.css'));

    const manifest: Manifest = {
      version,
      bundle: `${ASSETS}/${id}/${version}/bundle.js`,
      css: `${ASSETS}/${id}/${version}/style.css`,
      sourceTypes: readSourceTypes(readFileSync(join(gen, 'names.js'), 'utf8')),
      buildMs: Date.now() - started,
    };
    this.log(`Built ${component.name} (${posix(relative(appDir, file))}) in ${manifest.buildMs} ms`);
    return { manifest, bundle: join(published, 'bundle.js'), css: join(published, 'style.css') };
  }

  /** Write the wrapper, asking the compiler what each action prop is given until it compiles. */
  private async inferSignatures(toolchain: Toolchain, component: ComponentInfo, specifier: string, entry: string): Promise<void> {
    const signatures: Signatures = {};
    // One compile for each handler's count, one for each parameter of the longest, and the one that passes.
    for (let attempt = 0; attempt < 12; attempt++) {
      writeFileSync(entry, wrapperSource(component, specifier, signatures));
      if (!component.props.some(isAction)) return;
      const outcome = await exec(toolchain.contract, ['build', '--json', entry], { env: toolchain.env, maxBuffer: 64 * 1024 * 1024 }).then(
        (ok) => ({ failed: false, stdout: ok.stdout, stderr: ok.stderr }),
        (error: { stdout?: string; stderr?: string }) => ({ failed: true, stdout: error.stdout ?? '', stderr: error.stderr ?? '' })
      );
      if (!outcome.failed) return;
      let diagnostics: Diagnostic[] = [];
      try {
        diagnostics = JSON.parse(outcome.stdout);
      } catch {
        throw new Error(outcome.stderr || outcome.stdout);
      }
      const errors = diagnostics.filter((d) => d.severity === 'error');
      // Anything the handlers did not cause is the component's own error: the build reports it in full.
      if (!refineSignatures(component, signatures, errors)) return;
    }
    throw new Error(`Could not work out what ${component.name}'s action props are given.`);
  }
}

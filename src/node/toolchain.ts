// Where Exact comes from. Exact has no published package: an app uses a source checkout, with a Rust
// compiler built from it and a pinned Bun. Until that changes, this module fetches the commit this framework
// was tested against from GitHub, builds its compiler once, and keeps both in a machine-wide cache.
import { execFile, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export const EXACT_REPOSITORY = 'https://github.com/expo/exact.git';

/** The Exact commit this version of the framework was written and tested against. */
export const EXACT_COMMIT = '5434f4325d31fbd138e17a8021faa5e781aef1dd';

export interface ToolchainOptions {
  /** An Exact checkout to use as it is, instead of the managed one. Also `EXACT_ROOT`. */
  exactRoot?: string;
  /** Another commit of `expo/exact` for the managed checkout. Also `EXACT_COMMIT`. */
  exactCommit?: string;
}

export interface Toolchain {
  /** The Exact checkout. */
  root: string;
  /** Whether this framework cloned and owns the checkout. */
  managed: boolean;
  /** The Bun that Exact's build scripts run on. */
  bun: string;
  /** The Contract compiler's CLI (`contract build --json`), which says what is wrong with a file. */
  contract: string;
  /** The web compiler (`exact-web-js js`), which writes an app's modules. */
  compiler: string;
  /** The environment Exact's scripts run in. */
  env: NodeJS.ProcessEnv;
}

export type Log = (message: string) => void;

/** The machine-wide cache: the managed checkout, its build, and the pinned Bun. */
export function cacheHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.STORYBOOK_EXACT_CACHE) return resolve(env.STORYBOOK_EXACT_CACHE);
  return join(env.XDG_CACHE_HOME ? resolve(env.XDG_CACHE_HOME) : join(homedir(), '.cache'), 'storybook-framework-exact');
}

/** Where the checkout is, without touching the disk. */
export function locate(options: ToolchainOptions = {}, env: NodeJS.ProcessEnv = process.env): { root: string; managed: boolean; commit: string } {
  const given = options.exactRoot ?? env.EXACT_ROOT;
  const commit = options.exactCommit ?? env.EXACT_COMMIT ?? EXACT_COMMIT;
  if (given) return { root: resolve(given), managed: false, commit };
  return { root: join(cacheHome(env), `exact-${commit.slice(0, 12)}`), managed: true, commit };
}

/** Run a long step with its output on the terminal. */
function run(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', (error: NodeJS.ErrnoException) =>
      fail(error.code === 'ENOENT' ? new Error(`storybook-framework-exact needs \`${command}\` on your PATH, and it was not found.`) : error)
    );
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`\`${command} ${args.join(' ')}\` failed with exit code ${code}`))));
  });
}

async function clone(root: string, commit: string, log: Log): Promise<void> {
  const partial = `${root}.partial`;
  rmSync(partial, { recursive: true, force: true });
  mkdirSync(partial, { recursive: true });
  log(`Fetching Exact ${commit.slice(0, 12)} from ${EXACT_REPOSITORY} (once per machine)`);
  // One commit, without history: a clone by branch would move as Exact does, daily.
  await run('git', ['init', '--quiet'], { cwd: partial });
  await run('git', ['remote', 'add', 'origin', EXACT_REPOSITORY], { cwd: partial });
  await run('git', ['fetch', '--quiet', '--depth', '1', 'origin', commit], { cwd: partial });
  await run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], { cwd: partial });
  rmSync(root, { recursive: true, force: true });
  renameSync(partial, root);
}

/** `a >= b` for dotted versions. */
export function atLeast(a: string, b: string): boolean {
  const [x, y] = [a, b].map((v) => v.trim().split('.').map((n) => parseInt(n, 10) || 0)) as [number[], number[]];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return true;
}

async function bunVersion(bun: string): Promise<string | null> {
  try {
    return (await exec(bun, ['--version'])).stdout.trim();
  } catch {
    return null;
  }
}

/** The release asset for this machine, as Bun names them. */
export function bunAsset(platform: NodeJS.Platform = process.platform, arch: string = process.arch): string {
  const os = platform === 'darwin' ? 'darwin' : platform === 'win32' ? 'windows' : 'linux';
  return `bun-${os}-${arch === 'arm64' ? 'aarch64' : 'x64'}`;
}

/** A Bun at least as new as the one Exact pins: `BUN`, the one on the PATH, or a download kept in the cache. */
async function ensureBun(root: string, env: NodeJS.ProcessEnv, log: Log): Promise<string> {
  const pinned = /bun@([\d.]+)/.exec(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).packageManager ?? '')?.[1];
  if (!pinned) throw new Error(`${root}/package.json names no Bun version; is this an Exact checkout?`);
  const binary = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const cached = join(cacheHome(env), `bun-${pinned}`, bunAsset(), binary);
  for (const candidate of [env.BUN, 'bun', cached]) {
    if (!candidate) continue;
    const version = await bunVersion(candidate);
    if (version && atLeast(version, pinned)) return candidate === 'bun' ? (await exec(candidate, ['-e', 'console.log(process.execPath)'])).stdout.trim() : candidate;
  }
  const directory = dirname(dirname(cached));
  mkdirSync(directory, { recursive: true });
  const archive = join(directory, 'bun.zip');
  const url = `https://github.com/oven-sh/bun/releases/download/bun-v${pinned}/${bunAsset()}.zip`;
  log(`Downloading Bun ${pinned}, the version Exact pins, into ${directory}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}. Install Bun ${pinned} yourself and set BUN to it.`);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  // `tar` reads zip archives on macOS and Windows; `unzip` is the one Linux images have.
  await run(process.platform === 'linux' ? 'unzip' : 'tar', process.platform === 'linux' ? ['-q', '-o', archive, '-d', directory] : ['-xf', archive, '-C', directory], { cwd: directory });
  rmSync(archive, { force: true });
  if (process.platform !== 'win32') chmodSync(cached, 0o755);
  return cached;
}

const ready = new Map<string, Promise<Toolchain>>();

/**
 * The toolchain, made where it is missing: the checkout cloned at the pinned commit, a Bun new enough for it,
 * its JavaScript dependencies, and the two compilers built with Cargo. Each step is skipped once it is done,
 * so a second call costs a few `existsSync`.
 */
export function ensureToolchain(options: ToolchainOptions = {}, log: Log = () => {}): Promise<Toolchain> {
  const { root, managed, commit } = locate(options);
  let made = ready.get(root);
  if (!made) {
    made = prepare(root, managed, commit, log);
    made.catch(() => ready.delete(root));
    ready.set(root, made);
  }
  return made;
}

async function prepare(root: string, managed: boolean, commit: string, log: Log): Promise<Toolchain> {
  if (!existsSync(join(root, 'host/web-js/build.mjs'))) {
    if (!managed) throw new Error(`${root} is not an Exact checkout (no host/web-js/build.mjs). Unset exactRoot/EXACT_ROOT to let the framework fetch one.`);
    await clone(root, commit, log);
  }
  const bun = await ensureBun(root, process.env, log);
  const env = { ...process.env, BUN: bun, PATH: `${dirname(bun)}${delimiter}${process.env.PATH ?? ''}` };

  if (!existsSync(join(root, 'node_modules/rolldown'))) {
    log('Installing Exact\'s JavaScript dependencies');
    await run(bun, ['install'], { cwd: root, env });
  }

  const target = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : join(root, 'target');
  let compilers = builtCompilers(target, managed);
  if (!compilers) {
    log('Building the Contract compiler with Cargo (a few minutes, once per machine)');
    await run('cargo', ['build', '--profile', PROFILE, '-p', 'exact-web-js', '-p', 'contract'], { cwd: root, env });
    compilers = builtCompilers(target, true)!;
  }
  // Exact's own build runs the compiler it is pointed at, when that one is up to date with its sources.
  return { root, managed, bun, ...compilers, env: { ...env, EXACT_WEB_COMPILER: compilers.compiler } };
}

/**
 * Exact's profile for its own development loop: optimised, without the link-time work of a release. Its
 * compilers take a few milliseconds where a debug build's take a few hundred, and a story is built on demand.
 */
export const PROFILE = 'host-dev';

/**
 * The compilers already built under `target`. A checkout this framework owns is built with `PROFILE`; one
 * the author gave is used as it is built: the build made last, which is the one made from its sources as
 * they are, and of two made together the optimised one.
 */
export function builtCompilers(target: string, managed: boolean): { contract: string; compiler: string } | null {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  let found: { contract: string; compiler: string; at: number } | null = null;
  for (const profile of managed ? [PROFILE] : [PROFILE, 'release', 'debug']) {
    const contract = join(target, profile, `contract${suffix}`);
    const compiler = join(target, profile, `exact-web-js${suffix}`);
    const at = statSync(compiler, { throwIfNoEntry: false })?.mtimeMs;
    if (at !== undefined && existsSync(contract) && (!found || at > found.at)) found = { contract, compiler, at };
  }
  return found && { contract: found.contract, compiler: found.compiler };
}

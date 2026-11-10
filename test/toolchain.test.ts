import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EXACT_COMMIT, atLeast, bunAsset, cacheHome, locate } from '../src/node/toolchain.ts';

describe('atLeast', () => {
  it('compares dotted versions numerically', () => {
    expect(atLeast('1.2.10', '1.2.9')).toBe(true);
    expect(atLeast('1.2.9', '1.2.10')).toBe(false);
    expect(atLeast('1.3.0', '1.2.99')).toBe(true);
    expect(atLeast('2.0.0', '10.0.0')).toBe(false);
  });

  it('holds for equal versions, and treats missing parts as zero', () => {
    expect(atLeast('1.2.3', '1.2.3')).toBe(true);
    expect(atLeast('1.2', '1.2.0')).toBe(true);
    expect(atLeast('1.2', '1.2.1')).toBe(false);
  });

  it('reads `bun --version` output, with its newline and a pre-release suffix', () => {
    expect(atLeast('1.2.19\n', '1.2.19')).toBe(true);
    expect(atLeast('1.3.0-canary.12', '1.2.19')).toBe(true);
  });
});

describe('bunAsset', () => {
  it('names the release asset for each platform Bun publishes', () => {
    expect(bunAsset('darwin', 'arm64')).toBe('bun-darwin-aarch64');
    expect(bunAsset('darwin', 'x64')).toBe('bun-darwin-x64');
    expect(bunAsset('linux', 'x64')).toBe('bun-linux-x64');
    expect(bunAsset('linux', 'arm64')).toBe('bun-linux-aarch64');
    expect(bunAsset('win32', 'x64')).toBe('bun-windows-x64');
  });
});

describe('cacheHome', () => {
  it('is STORYBOOK_EXACT_CACHE when it is set, made absolute', () => {
    expect(cacheHome({ STORYBOOK_EXACT_CACHE: 'rel/cache', XDG_CACHE_HOME: '/xdg' })).toBe(resolve('rel/cache'));
  });

  it('is under XDG_CACHE_HOME, else under ~/.cache', () => {
    expect(cacheHome({ XDG_CACHE_HOME: '/xdg' })).toBe(join('/xdg', 'storybook-framework-exact'));
    // .github/workflows/ci.yml caches this directory: keep the two together.
    expect(cacheHome({})).toBe(join(homedir(), '.cache', 'storybook-framework-exact'));
  });
});

describe('locate', () => {
  it('uses a given checkout as it is', () => {
    expect(locate({ exactRoot: 'here' }, {})).toEqual({ root: resolve('here'), managed: false, commit: EXACT_COMMIT });
    expect(locate({}, { EXACT_ROOT: '/exact' })).toEqual({ root: resolve('/exact'), managed: false, commit: EXACT_COMMIT });
  });

  it('prefers the option to the environment', () => {
    expect(locate({ exactRoot: '/mine', exactCommit: 'abc' }, { EXACT_ROOT: '/env', EXACT_COMMIT: 'def' })).toEqual({ root: resolve('/mine'), managed: false, commit: 'abc' });
  });

  it('keeps a managed checkout in the cache, by the first 12 characters of its commit', () => {
    const env = { STORYBOOK_EXACT_CACHE: '/cache' };
    expect(locate({}, env)).toEqual({ root: join('/cache', `exact-${EXACT_COMMIT.slice(0, 12)}`), managed: true, commit: EXACT_COMMIT });
    expect(locate({}, { ...env, EXACT_COMMIT: '0123456789abcdef' }).root).toBe(join('/cache', 'exact-0123456789ab'));
    expect(locate({ exactCommit: 'fedcba9876543210' }, env).root).toBe(join('/cache', 'exact-fedcba987654'));
  });

  it('pins a full commit', () => {
    expect(EXACT_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  });
});

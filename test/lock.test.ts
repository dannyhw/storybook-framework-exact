import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { withoutWarnings } from '../src/node/build.ts';
import { withLock } from '../src/node/lock.ts';

describe('withLock', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'exact-lock-'));
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('runs one piece of work at a time', async () => {
    const events: string[] = [];
    const work = (name: string) => async () => {
      events.push(`${name} in`);
      await new Promise((resume) => setTimeout(resume, 60));
      events.push(`${name} out`);
      return name;
    };
    const results = await Promise.all([withLock(directory, work('a')), withLock(directory, work('b'))]);
    expect(results).toEqual(['a', 'b']);
    expect(events).toEqual(['a in', 'a out', 'b in', 'b out']);
    expect(existsSync(join(directory, 'build.lock'))).toBe(false);
  });

  it('releases the lock when the work fails', async () => {
    await expect(withLock(directory, () => Promise.reject(new Error('no')))).rejects.toThrow('no');
    await expect(withLock(directory, async () => 'next')).resolves.toBe('next');
  });

  it('takes over a lock whose holder is gone', async () => {
    const lock = join(directory, 'build.lock');
    mkdirSync(lock);
    // No process has this id: it is above what any system hands out.
    writeFileSync(join(lock, 'pid'), '2147483646');
    await expect(withLock(directory, async () => 'mine')).resolves.toBe('mine');
  });
});

describe('withoutWarnings', () => {
  // As Exact's compiler prints one: its advice is on the first line, then the code frame.
  const warning = [
    'app/button.contract:11:7 warning [lower-colour-one-scheme] `#1ea7fd` on `background-color` stays the same in dark mode: name a role or leave it unsaid',
    ' 11 |       background-color="#1ea7fd"',
    '    |       ^^^^^^^^^^^^^^^^',
  ];

  it('leaves the error that stopped a build', () => {
    const error = ['app/button.contract:14:12 [type-unknown-name] unknown name `oops`', ' 14 |       text oops', '    |            ^^^^'];
    expect(withoutWarnings([...warning, ...error, ...warning].join('\n'))).toBe(error.join('\n'));
  });

  it('keeps output that is only warnings', () => {
    const output = warning.join('\n');
    expect(withoutWarnings(output)).toBe(output.trim());
  });

  it('keeps output without warnings as it is', () => {
    expect(withoutWarnings('error: No such file or directory (os error 2)\n')).toBe('error: No such file or directory (os error 2)');
  });
});

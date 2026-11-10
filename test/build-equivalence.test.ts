// The builds this framework makes by reusing Exact's staging, against the ones Exact's whole build makes.
// They must be the same bytes: that is what lets a component be built by the compiler alone. Run where an
// Exact checkout is built (EXACT_ROOT), as CI does after `storybook-exact setup`.
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { Builder } from '../src/node/build.ts';
import { parseComponents } from '../src/node/contract.ts';
import { appDirectory, projectCache } from '../src/node/shadow.ts';
import { ensureToolchain } from '../src/node/toolchain.ts';

const example = fileURLToPath(new URL('../examples/basic', import.meta.url));
const exactRoot = process.env.EXACT_ROOT;

const contracts = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? contracts(path) : entry.name.endsWith('.contract') ? [path] : [];
  });

describe.skipIf(!exactRoot)('a build that reuses the staging', () => {
  it(
    "is byte for byte Exact's whole build, for every component of the example",
    async () => {
      const toolchain = () => ensureToolchain({ exactRoot });
      const versions = async (builder: Builder) => {
        const found: Record<string, string> = {};
        // Nothing an earlier run kept: both builders make every build, the staging included.
        for (const file of contracts(example)) {
          for (const kept of ['kept', 'stage']) rmSync(join(projectCache(appDirectory(file)), kept), { recursive: true, force: true });
        }
        for (const file of contracts(example).sort()) {
          for (const descriptor of builder.describe(file, parseComponents(readFileSync(file, 'utf8'))).descriptors) {
            // The index of a library places nothing; a root that is not its file's first cannot be built.
            found[descriptor.id] = await builder.build(descriptor.id).then(
              (built) => built.manifest.version,
              (error: Error) => `error: ${error.message.split('\n')[0]}`
            );
          }
        }
        return found;
      };
      const whole = await versions(new Builder(toolchain, () => {}, { wholeBuilds: true }));
      const staged = await versions(new Builder(toolchain, () => {}, { wholeBuilds: false }));
      expect(Object.keys(staged).length).toBeGreaterThan(4);
      expect(Object.values(staged).filter((version) => version.startsWith('error')).length).toBe(0);
      expect(staged).toEqual(whole);
    },
    240_000
  );
});

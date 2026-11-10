#!/usr/bin/env node
// `storybook-exact setup`: fetch and build Exact ahead of the first `storybook dev`, in CI or after an upgrade.
import { EXACT_COMMIT, EXACT_REPOSITORY, cacheHome, ensureToolchain, locate } from './toolchain.ts';

const [command = 'help', ...rest] = process.argv.slice(2);
const option = (name: string) => {
  const at = rest.indexOf(name);
  return at < 0 ? undefined : rest[at + 1];
};
const options = { exactRoot: option('--exact-root'), exactCommit: option('--exact-commit') };

const usage = `storybook-exact <command>

  setup    Fetch Exact at the pinned commit and build its compiler (skips what is already there)
  where    Print where the checkout and the cache are

Options:
  --exact-root <dir>      Use this Exact checkout as it is (also EXACT_ROOT)
  --exact-commit <sha>    Fetch another commit of ${EXACT_REPOSITORY} (also EXACT_COMMIT; pinned: ${EXACT_COMMIT.slice(0, 12)})`;

if (command === 'setup') {
  const started = Date.now();
  const toolchain = await ensureToolchain(options, (message) => console.log(`exact: ${message}`));
  console.log(`exact: ready in ${Math.round((Date.now() - started) / 1000)} s\n  checkout  ${toolchain.root}${toolchain.managed ? '' : ' (yours)'}\n  bun       ${toolchain.bun}\n  compiler  ${toolchain.contract}`);
} else if (command === 'where') {
  const { root, managed, commit } = locate(options);
  console.log(`checkout  ${root}${managed ? ` (managed, ${commit.slice(0, 12)})` : ' (yours)'}\ncache     ${cacheHome()}`);
} else {
  console.log(usage);
  process.exit(command === 'help' || command === '--help' || command === '-h' ? 0 : 2);
}

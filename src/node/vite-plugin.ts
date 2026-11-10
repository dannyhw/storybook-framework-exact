// The Vite plugin: `import { Button } from './button.contract'`.
//
// Importing a Contract file is cheap: the module holds each component's description, read from the source.
// The build is made when a story first needs it. In development the preview asks the dev server for the
// component's manifest and the server builds then; in a static build every imported component is built and
// emitted with the bundle.
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';

import type { Plugin } from 'vite';

import type { ManifestError } from '../types.ts';
import { ASSETS, Builder } from './build.ts';
import { parseComponents } from './contract.ts';
import { type Log, type ToolchainOptions, ensureToolchain } from './toolchain.ts';
import { declarationFor, declarationPath, parseShapes } from './typegen.ts';

const CONTENT_TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

export interface ExactPluginOptions extends ToolchainOptions {
  log?: Log;
  /** Write `<name>.d.contract.ts` beside each imported Contract file. Default true. */
  typegen?: boolean;
}

/** Write a Contract file's declarations, when they changed. */
export function writeDeclarations(file: string, source = readFileSync(file, 'utf8')): void {
  const text = declarationFor(file, parseComponents(source), parseShapes(source));
  const path = declarationPath(file);
  try {
    if (readFileSync(path, 'utf8') === text) return;
  } catch {
    // not written yet
  }
  writeFileSync(path, text);
}

export function exact(options: ExactPluginOptions = {}): Plugin {
  const log = options.log ?? (() => {});
  const builder = new Builder(() => ensureToolchain(options, log), log);
  let building = false;

  return {
    name: 'storybook-framework-exact',
    enforce: 'pre',

    configResolved(config) {
      building = config.command === 'build';
    },

    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = decodeURIComponent((request.url ?? '').split('?')[0] ?? '');
        const match = new RegExp(`/${ASSETS}/([^/]+)/(.+)$`).exec(path);
        if (!match || !builder.has(match[1]!)) return next();
        const [, id, rest] = match as unknown as [string, string, string];
        response.setHeader('Cache-Control', 'no-store');
        if (rest === 'manifest.json') {
          builder.build(id).then(
            (built) => {
              response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify(built.manifest));
            },
            (error: Error) => {
              // A component that does not compile is its story's error, shown in the canvas, not the server's.
              response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify({ error: error.message } satisfies ManifestError));
            }
          );
          return;
        }
        const file = builder.resolveAsset(id, rest);
        if (!file) return next();
        response.setHeader('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(response);
      });
    },

    async load(id) {
      const file = id.split('?')[0]!;
      if (!file.endsWith('.contract')) return null;
      const source = readFileSync(file, 'utf8');
      const { descriptors, sources } = builder.describe(file, parseComponents(source));
      if (options.typegen !== false) writeDeclarations(file, source);
      // Any Contract source of the app may be one this file uses: a change to it gives the module a new revision.
      for (const source of sources) this.addWatchFile(source);

      if (building) {
        for (const descriptor of descriptors) {
          const built = await builder.build(descriptor.id);
          this.emitFile({ type: 'asset', fileName: descriptor.manifest, source: JSON.stringify(built.manifest) });
          this.emitFile({ type: 'asset', fileName: built.manifest.bundle, source: readFileSync(built.bundle) });
          this.emitFile({ type: 'asset', fileName: built.manifest.css, source: readFileSync(built.css) });
        }
      }

      const names = descriptors.map((d) => d.name);
      return [
        ...descriptors.map((d) => `export const ${d.name} = ${JSON.stringify(d)};`),
        `export default { ${names.join(', ')} };`,
        '',
      ].join('\n');
    },
  };
}

export default exact;

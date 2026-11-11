// The Vite plugin: `import { Button } from './button.contract'`.
//
// Importing a Contract file is cheap: the module holds each component's description, read from the source.
// The build is made when a story first needs it. In development the preview asks the dev server for the
// component's manifest and the server builds then; in a static build every imported component is built and
// emitted with the bundle. One that cannot be built fails the static build if a story imports it; one that
// no story imports (a row made for a list, a second component of a file with routes) is left out.
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';

import type { Plugin } from 'vite';

import type { ManifestError } from '../types.ts';
import { ASSETS, Builder } from './build.ts';
import { parseComponents } from './contract.ts';
import { type Log, type ToolchainOptions, ensureToolchain } from './toolchain.ts';
import { declarationFor, declarationPath, parseShapes } from './typegen.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
};

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

/** A component of a static build that could not be built. */
export interface Unbuilt {
  /** The module that describes it: the Contract file's id. */
  module: string;
  name: string;
  error: string;
}

/** The part of a bundle that says which of a module's exports the build kept. */
export type Chunks = Record<string, { type: string; modules?: Record<string, { renderedExports?: string[] }> }>;

/**
 * The unbuilt components the bundle still uses: the build dropped the export of one no story imports. A
 * bundler that does not say which exports it kept is taken to have kept them all.
 */
export function stillUsed(unbuilt: Unbuilt[], bundle: Chunks): Unbuilt[] {
  return unbuilt.filter(({ module, name }) =>
    Object.values(bundle).some((chunk) => {
      const kept = chunk.type === 'chunk' ? chunk.modules?.[module] : undefined;
      if (!kept) return false;
      return !kept.renderedExports || kept.renderedExports.includes(name) || kept.renderedExports.includes('default');
    })
  );
}

export function exact(options: ExactPluginOptions = {}): Plugin {
  const log = options.log ?? (() => {});
  const builder = new Builder(() => ensureToolchain(options, log), log);
  let building = false;
  const emitted = new Set<string>();
  const unbuilt: Unbuilt[] = [];

  return {
    name: 'storybook-framework-exact',
    enforce: 'pre',

    configResolved(config) {
      building = config.command === 'build';
    },

    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = decodeURIComponent((request.url ?? '').split('?')[0] ?? '');
        // An app's images and fonts, which a build names as `assets/…` beside the page.
        const asset = /^\/assets\/(.+)$/.exec(path);
        const served = asset && builder.asset(asset[1]!);
        if (served) {
          response.setHeader('Content-Type', CONTENT_TYPES[extname(served).toLowerCase()] ?? 'application/octet-stream');
          createReadStream(served).pipe(response);
          return;
        }
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
      const { descriptors, sources } = builder.describe(file, parseComponents(source), !building);
      // An installed package's directory is not the author's to write in.
      if (options.typegen !== false && !file.split(/[\\/]/).includes('node_modules')) writeDeclarations(file, source);
      // Any Contract source of the app may be one this file uses: a change to it gives the module a new revision.
      for (const source of sources) this.addWatchFile(source);

      if (building) {
        for (const descriptor of descriptors) {
          const built = await builder.build(descriptor.id).catch((error: Error) => error);
          if (built instanceof Error) {
            // Whether that fails the build is known once the bundle says which components it uses.
            unbuilt.push({ module: id, name: descriptor.name, error: built.message });
            this.emitFile({ type: 'asset', fileName: descriptor.manifest, source: JSON.stringify({ error: built.message } satisfies ManifestError) });
            continue;
          }
          this.emitFile({ type: 'asset', fileName: descriptor.manifest, source: JSON.stringify(built.manifest) });
          this.emitFile({ type: 'asset', fileName: built.manifest.bundle, source: readFileSync(built.bundle) });
          this.emitFile({ type: 'asset', fileName: built.manifest.css, source: readFileSync(built.css) });
        }
        for (const asset of builder.assets()) {
          if (emitted.has(asset.name)) continue;
          emitted.add(asset.name);
          this.emitFile({ type: 'asset', fileName: asset.name, source: readFileSync(asset.file) });
        }
      }

      const names = descriptors.map((d) => d.name);
      return [
        ...descriptors.map((d) => `export const ${d.name} = ${JSON.stringify(d)};`),
        `export default { ${names.join(', ')} };`,
        '',
      ].join('\n');
    },

    generateBundle(_options, bundle) {
      const used = stillUsed(unbuilt, bundle as Chunks);
      for (const component of unbuilt) {
        if (!used.includes(component)) log(`Left out ${component.name} (${component.module.split(/[\\/]/).pop()}), which no story imports and which cannot be built on its own: ${component.error.split('\n')[0]}`);
      }
      if (used.length) this.error(used.map((component) => `${component.name} could not be built:\n${component.error}`).join('\n\n'));
    },
  };
}

export default exact;

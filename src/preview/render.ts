// The renderer: one Exact app in the canvas, started from its build and answered at its data seam.
//
// Exact's web runtime is one app per document: it mounts into `#exact-root`, keeps its state in its module
// and has no unmount. So each mount imports a fresh instance of the build's module, and a document holds one
// story at a time (a docs page shows each story in its own iframe, which this framework makes the default).
import type { ArgsStoryFn, RenderToCanvas } from 'storybook/internal/types';

import type { ExactComponent, ExactStoryResult, Manifest, ManifestError } from '../types.ts';
import type { ExactRenderer } from '../public-types.ts';
import { isExactComponent } from './arg-types.ts';
import { fromWire, toWire } from './wire.ts';

const ARGS_SOURCE = 'storyArgs';
const ACTION_PREFIX = 'storyAction_';

interface Handle {
  refresh(source: string): unknown;
  journal: string[];
}

interface Mount {
  key: string;
  canvas: Element;
  root: HTMLElement;
  story: ExactStoryResult;
  manifest: Manifest;
  handle: Handle | null;
}

/** The one app this document holds. */
let live: Mount | null = null;
let instances = 0;
const manifests = new Map<string, Promise<Manifest>>();

export const render: ArgsStoryFn<ExactRenderer> = (args, context) => {
  const { component, parameters } = context;
  if (!isExactComponent(component)) {
    throw new Error(`Story "${context.title}/${context.name}" has no Exact component. Import one from a .contract file and set it as \`component\`.`);
  }
  return { component, args, sources: parameters.exact?.sources ?? {} };
};

const pageUrl = (path: string) => new URL(path, document.baseURI).href;

function manifestOf(component: ExactComponent): Promise<Manifest> {
  const key = `${component.id}@${component.revision}`;
  let pending = manifests.get(key);
  if (!pending) {
    pending = fetch(pageUrl(`${component.manifest}?r=${component.revision}`)).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load ${component.name}'s build (${component.manifest}): HTTP ${response.status}`);
      const manifest = (await response.json()) as Manifest | ManifestError;
      if ('error' in manifest) throw new Error(manifest.error);
      return manifest;
    });
    pending.catch(() => manifests.delete(key));
    manifests.set(key, pending);
  }
  return pending;
}

/** The build's stylesheet, loaded before the app starts: its classes are the app's own, and its fonts are read at boot. */
function stylesheet(href: string): Promise<void> {
  const current = document.querySelector<HTMLLinkElement>('link[data-exact-style]');
  if (current?.dataset.exactStyle === href) return Promise.resolve();
  return new Promise((done) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.exactStyle = href;
    link.onload = link.onerror = () => {
      current?.remove();
      done();
    };
    link.href = href;
    document.head.append(link);
  });
}

function bridge(mount: Mount) {
  const { component } = mount.story;
  const types = mount.manifest.sourceTypes;
  return {
    answer(source: string, sent: unknown[] = []) {
      const [parameters, result] = types[source] ?? [[], undefined];
      if (source === ARGS_SOURCE) {
        const { args } = mount.story;
        const values: Record<string, unknown> = {};
        for (const field of [...component.props, ...component.inject]) {
          if (field.type !== 'action') values[field.name] = args[field.name] ?? component.defaults[field.name];
        }
        return { v: toWire(values, result, 'args') };
      }
      if (source.startsWith(ACTION_PREFIX)) {
        const handler = mount.story.args[source.slice(ACTION_PREFIX.length)];
        if (typeof handler === 'function') handler(...sent.map((value, index) => fromWire(value, parameters[index])));
        return { v: [true] };
      }
      const mock = mount.story.sources[source];
      if (!mock) {
        throw new Error(`${component.name} asks the source \`${source}\`, and the story does not answer it. Add parameters.exact.sources.${source}.`);
      }
      const answered = mock(...sent.map((value, index) => fromWire(value, parameters[index])));
      if (answered && typeof (answered as PromiseLike<unknown>).then === 'function') {
        return { promise: Promise.resolve(answered).then((value) => toWire(value, result, source)) };
      }
      return { v: toWire(answered, result, source) };
    },
  };
}

export const renderToCanvas: RenderToCanvas<ExactRenderer> = async ({ storyFn, storyContext, showMain, showError, forceRemount }, canvasElement) => {
  const story = storyFn();
  const manifest = await manifestOf(story.component);
  const key = `${storyContext.id}@${manifest.version}`;

  // The same story on the same build: the running app asks for its args again. Its own state stays.
  if (live && live.canvas === canvasElement && live.key === key && !forceRemount && live.root.isConnected && live.handle) {
    live.story = story;
    live.handle.refresh(ARGS_SOURCE);
    showMain();
    return;
  }

  if (live && live.canvas !== canvasElement && live.root.isConnected) {
    showError({
      title: 'One Exact story per document',
      description: "Exact's web runtime mounts one app per page. Show each story in its own iframe: parameters.docs.story.inline = false (this framework's default).",
    });
    return;
  }

  const root = document.createElement('div');
  root.id = 'exact-root';
  const mount: Mount = { key, canvas: canvasElement, root, story, manifest, handle: null };
  live = mount;
  const superseded = () => live !== mount;

  await stylesheet(pageUrl(manifest.css));
  if (superseded()) return;
  canvasElement.replaceChildren(root);
  showMain();

  // A fresh instance of the runtime: the last one's state is its module's, and cannot be reset.
  const module = (await import(/* @vite-ignore */ `${pageUrl(manifest.bundle)}?instance=${instances++}`)) as { storybookStart(bridge: unknown): Promise<Handle> };
  if (superseded() || !root.isConnected) return;
  // What the last instance published for its own glue is not this one's.
  delete (globalThis as { exact?: unknown }).exact;
  mount.handle = await module.storybookStart(bridge(mount));

  return () => {
    if (live === mount) live = null;
    root.remove();
  };
};

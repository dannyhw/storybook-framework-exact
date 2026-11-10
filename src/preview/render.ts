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
/** Each component's manifest at its latest revision: an older revision's build may be gone from the server. */
const manifests = new Map<string, { revision: string; manifest: Promise<Manifest> }>();

export const render: ArgsStoryFn<ExactRenderer> = (args, context) => {
  const { component, parameters } = context;
  if (!isExactComponent(component)) {
    throw new Error(`Story "${context.title}/${context.name}" has no Exact component. Import one from a .contract file and set it as \`component\`.`);
  }
  return { component, args, sources: parameters.exact?.sources ?? {} };
};

const pageUrl = (path: string) => new URL(path, document.baseURI).href;

function manifestOf(component: ExactComponent): Promise<Manifest> {
  const known = manifests.get(component.id);
  if (known?.revision === component.revision) return known.manifest;
  const manifest = fetch(pageUrl(`${component.manifest}?r=${component.revision}`)).then(async (response) => {
    if (!response.ok) throw new Error(`Could not load ${component.name}'s build (${component.manifest}): HTTP ${response.status}`);
    const body = (await response.json()) as Manifest | ManifestError;
    if ('error' in body) throw new Error(body.error);
    return body;
  });
  const entry = { revision: component.revision, manifest };
  manifests.set(component.id, entry);
  manifest.catch(() => {
    if (manifests.get(component.id) === entry) manifests.delete(component.id);
  });
  return manifest;
}

/**
 * `work`, or nothing once the story is torn down. Storybook reloads the whole preview when a story it has
 * left is still rendering a few ticks later, and a first build takes a second or two: the render lets go at
 * once, and what it was waiting for finishes unseen.
 */
function unlessAborted<T>(signal: AbortSignal | undefined, work: Promise<T>): Promise<T | typeof ABORTED> {
  if (!signal) return work;
  if (signal.aborted) return Promise.resolve(ABORTED);
  return Promise.race([work, new Promise<typeof ABORTED>((resolve) => signal.addEventListener('abort', () => resolve(ABORTED), { once: true }))]);
}
const ABORTED = Symbol('aborted');

/** The build's stylesheet, loaded before the app starts: its classes are the app's own, and its fonts are read at boot. */
function stylesheet(href: string): Promise<void> {
  const newest = [...document.querySelectorAll<HTMLLinkElement>('link[data-exact-style]')].at(-1);
  if (newest?.dataset.exactStyle === href) return loaded.get(newest) ?? Promise.resolve();
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.exactStyle = href;
  const done = new Promise<void>((resolve) => {
    link.onload = link.onerror = () => {
      // Every stylesheet before this one is an earlier story's, one still loading included.
      for (const other of document.querySelectorAll('link[data-exact-style]')) {
        if (other === link) break;
        other.remove();
      }
      resolve();
    };
  });
  loaded.set(link, done);
  link.href = href;
  document.head.append(link);
  return done;
}
const loaded = new WeakMap<HTMLLinkElement, Promise<void>>();

const CANVAS = 'exact-canvas';

/**
 * Exact's page gives its root the height of the window, and an app's root may take all of it (`height="100%"`,
 * as a screen with routes does). The canvas gives the root the same, or such an app would have no height.
 * Not where the story is centred: there the canvas is as large as the story.
 */
function fillCanvas(canvas: Element): void {
  if (!document.querySelector('style[data-exact-canvas]')) {
    const style = document.createElement('style');
    style.dataset.exactCanvas = '';
    style.textContent = `body:not(.sb-main-centered) .${CANVAS}{display:grid;min-height:100%}`;
    document.head.append(style);
  }
  canvas.classList.add(CANVAS);
}

/** The story's args as the app's args resource is answered. It throws, naming the arg, when one does not fit its prop. */
function argsAnswer(story: ExactStoryResult, manifest: Manifest): unknown {
  const { component, args } = story;
  const values: Record<string, unknown> = {};
  for (const field of [...component.props, ...component.inject]) {
    if (field.type !== 'action') values[field.name] = args[field.name] ?? component.defaults[field.name];
  }
  return toWire(values, manifest.sourceTypes[ARGS_SOURCE]?.[1], 'args');
}

function bridge(mount: Mount) {
  const { component } = mount.story;
  const types = mount.manifest.sourceTypes;
  return {
    answer(source: string, sent: unknown[] = []) {
      const [parameters, result] = types[source] ?? [[], undefined];
      if (source === ARGS_SOURCE) return { v: argsAnswer(mount.story, mount.manifest) };
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

/** How long a step of a mount took, for the browser's performance tools (`exact:` measures). */
function timed<T>(step: string, work: Promise<T>): Promise<T> {
  const from = performance.now();
  const done = () => performance.measure(`exact:${step}`, { start: from, end: performance.now() });
  work.then(done, done);
  return work;
}

export const renderToCanvas: RenderToCanvas<ExactRenderer> = async ({ storyFn, storyContext, showMain, showError, forceRemount }, canvasElement) => {
  const story = storyFn();
  if (!isExactComponent(story?.component)) {
    throw new Error(
      `Story "${storyContext.title}/${storyContext.name}" did not render a Contract component. A decorator returns what the story function gives it (it may change args: \`Story({ args })\`); it cannot return markup. To wrap a component, wrap it in Contract.`
    );
  }
  const signal = storyContext.abortSignal;
  const manifest = await unlessAborted(signal, timed('manifest', manifestOf(story.component)));
  if (manifest === ABORTED) return;
  const key = `${storyContext.id}@${manifest.version}`;

  // The running app would refuse args that do not fit and keep its last ones, without a word.
  if (manifest.sourceTypes[ARGS_SOURCE]) {
    try {
      argsAnswer(story, manifest);
    } catch (error) {
      showError({ title: `${story.component.name}'s args do not fit its props`, description: (error as Error).message });
      return;
    }
  }

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

  const release = () => {
    if (live === mount) {
      live = null;
      canvasElement.classList.remove(CANVAS);
    }
    root.remove();
  };

  if ((await unlessAborted(signal, timed('stylesheet', stylesheet(pageUrl(manifest.css))))) === ABORTED || superseded()) return release();
  fillCanvas(canvasElement);
  canvasElement.replaceChildren(root);
  showMain();

  // A fresh instance of the runtime: the last one's state is its module's, and cannot be reset.
  const loading = import(/* @vite-ignore */ `${pageUrl(manifest.bundle)}?instance=${instances++}`) as Promise<{ storybookStart(bridge: unknown): Promise<Handle> }>;
  const module = await unlessAborted(signal, timed('import', loading));
  if (module === ABORTED || superseded() || !root.isConnected) return release();
  // What the last instance published for its own glue is not this one's.
  delete (globalThis as { exact?: unknown }).exact;
  mount.handle = await timed('boot', module.storybookStart(bridge(mount)));

  return release;
};

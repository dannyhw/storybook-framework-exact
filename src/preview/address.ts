// The canvas's address, kept Storybook's own while an Exact app with routes runs in it.
//
// Exact's router is the page's: it launches at the document's address, and writes each visit's address to
// the browser's history. In the canvas that address is Storybook's (`iframe.html?id=…`), which is no route
// of the app, and one the app must not replace: Storybook builds its own next address from it, and a reload
// of `/checkout` is not a story. So the app launches at the location its story names, and its visits stay
// entries of the browser's history (Back and Forward step through them) without their addresses.

/** The parts of `window` this needs, so that a test can stand in for them. */
export interface Page {
  history: Pick<History, 'state' | 'pushState' | 'replaceState'>;
  location: Pick<Location, 'origin' | 'pathname' | 'search' | 'hash'>;
}

interface Kept {
  /** The canvas's own path, read before any app ran. */
  path: string;
  write(state: unknown, url?: string): void;
}

const kept = new WeakMap<Page['history'], Kept>();

/** Exact stamps the entries it writes; Storybook writes an empty state over the entry it is on. */
const isExact = (state: unknown) => typeof state === 'object' && state !== null && 'exact' in state;

function keep(page: Page): Kept {
  const known = kept.get(page.history);
  if (known) return known;
  const { history, location } = page;
  const path = location.pathname;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  const own = (url: string | URL | null | undefined) => url == null || new URL(url, location.origin + path).pathname === path;
  history.pushState = (state, unused, url) => (own(url) ? push(state, unused, url) : push(state, unused));
  history.replaceState = (state, unused, url) => {
    if (!own(url)) replace(state, unused);
    // Storybook's own address, written over a visit of the app: the visit stays the app's.
    else replace(isExact(history.state) && !isExact(state) ? history.state : state, unused, url);
  };
  const made: Kept = { path, write: (state, url) => replace(state, '', url) };
  kept.set(history, made);
  return made;
}

/** Why `target` cannot be where an app starts, or nothing. */
export function refusedLocation(target: unknown): string | undefined {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) {
    return `parameters.exact.location is the path the app starts at, as its routes write it ("/" or "/item/42"), and is ${JSON.stringify(target)}.`;
  }
  return undefined;
}

/**
 * Run `start`, which launches an Exact app, with the page at `target`: the app's router reads the page's
 * address as it starts. The canvas's own address is back when this returns.
 */
export function launchAt<T>(target: string, start: () => T, page: Page = globalThis as unknown as Page): T {
  const { write } = keep(page);
  const { history, location } = page;
  const own = location.pathname + location.search + location.hash;
  write(history.state, target);
  try {
    return start();
  } finally {
    write(history.state, own);
  }
}

/** Keep the canvas's address from now on. Called as the preview loads, while the address is still Storybook's. */
export function keepAddress(page: Page = globalThis as unknown as Page): void {
  if (page.history && page.location) keep(page);
}

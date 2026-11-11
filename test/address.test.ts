import { describe, expect, it } from 'vitest';

import { type Page, keepAddress, launchAt, refusedLocation } from '../src/preview/address.ts';

/** A page with a history as a browser keeps one: entries of a state and an address, and a cursor. */
function page(address = '/iframe.html?id=nav--home&viewMode=story') {
  const entries: { state: unknown; url: string }[] = [{ state: null, url: address }];
  const at = () => entries.at(-1)!;
  const resolve = (url?: string | URL | null) => (url == null ? at().url : ((u) => u.pathname + u.search + u.hash)(new URL(url, `http://localhost${at().url}`)));
  const made: Page & { entries: typeof entries } = {
    entries,
    history: {
      get state() {
        return at().state;
      },
      pushState: (state: unknown, _unused: string, url?: string | URL | null) => void entries.push({ state, url: resolve(url) }),
      replaceState: (state: unknown, _unused: string, url?: string | URL | null) => void (entries[entries.length - 1] = { state, url: resolve(url) }),
    },
    location: {
      origin: 'http://localhost',
      get pathname() {
        return new URL(at().url, 'http://localhost').pathname;
      },
      get search() {
        return new URL(at().url, 'http://localhost').search;
      },
      get hash() {
        return new URL(at().url, 'http://localhost').hash;
      },
    },
  };
  return made;
}

describe('launchAt', () => {
  it('starts the app with the page at the location, and gives the canvas its address back', () => {
    const canvas = page();
    const seen = launchAt('/item/42?tab=notes#top', () => canvas.location.pathname + canvas.location.search + canvas.location.hash, canvas);
    expect(seen).toBe('/item/42?tab=notes#top');
    expect(canvas.entries).toEqual([{ state: null, url: '/iframe.html?id=nav--home&viewMode=story' }]);
  });

  it('gives the address back when the start throws', () => {
    const canvas = page();
    expect(() =>
      launchAt(
        '/',
        () => {
          throw new Error('no start');
        },
        canvas
      )
    ).toThrow('no start');
    expect(canvas.location.pathname).toBe('/iframe.html');
  });

  it("keeps the state the app's first visit wrote as it started", () => {
    const canvas = page();
    launchAt('/', () => canvas.history.replaceState({ exact: 0, url: '/' }, '', 'http://localhost/'), canvas);
    expect(canvas.entries).toEqual([{ state: { exact: 0, url: '/' }, url: '/iframe.html?id=nav--home&viewMode=story' }]);
  });
});

describe('keepAddress', () => {
  it("makes an app's visit an entry of the history without its address", () => {
    const canvas = page();
    keepAddress(canvas);
    canvas.history.pushState({ exact: 1, url: '/item/42' }, '', 'http://localhost/item/42');
    canvas.history.replaceState({ exact: 1, url: '/item/43' }, '', 'http://localhost/item/43');
    expect(canvas.entries).toEqual([
      { state: null, url: '/iframe.html?id=nav--home&viewMode=story' },
      { state: { exact: 1, url: '/item/43' }, url: '/iframe.html?id=nav--home&viewMode=story' },
    ]);
  });

  it("lets Storybook write its own address, and leaves a visit of the app the app's", () => {
    const canvas = page();
    keepAddress(canvas);
    canvas.history.replaceState({}, '', '/iframe.html?id=nav--item&viewMode=story');
    expect(canvas.entries).toEqual([{ state: {}, url: '/iframe.html?id=nav--item&viewMode=story' }]);
    canvas.history.pushState({ exact: 1, url: '/item/42' }, '', '/item/42');
    canvas.history.replaceState({}, '', '/iframe.html?id=nav--item&viewMode=story&args=a:1');
    expect(canvas.entries.at(-1)).toEqual({ state: { exact: 1, url: '/item/42' }, url: '/iframe.html?id=nav--item&viewMode=story&args=a:1' });
  });

  it('keeps one address however often it is asked', () => {
    const canvas = page();
    keepAddress(canvas);
    launchAt('/item/42', () => keepAddress(canvas), canvas);
    canvas.history.pushState({ exact: 1 }, '', '/item/43');
    expect(canvas.location.pathname).toBe('/iframe.html');
  });

  it('passes a write with no address through', () => {
    const canvas = page();
    keepAddress(canvas);
    canvas.history.pushState({ exact: 1 }, '');
    expect(canvas.entries).toHaveLength(2);
    expect(canvas.location.pathname).toBe('/iframe.html');
  });
});

describe('refusedLocation', () => {
  it('takes a path', () => {
    expect(refusedLocation('/')).toBeUndefined();
    expect(refusedLocation('/item/42?tab=notes#top')).toBeUndefined();
  });

  it('refuses what is not a path of this page', () => {
    for (const target of ['item/42', 'https://example.com/', '//example.com/', '', 42, null]) {
      expect(refusedLocation(target)).toMatch(/parameters\.exact\.location is the path the app starts at/);
    }
  });
});

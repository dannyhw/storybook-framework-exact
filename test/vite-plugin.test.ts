import { describe, expect, it } from 'vitest';

import { type Chunks, type Unbuilt, stillUsed } from '../src/node/vite-plugin.ts';

const row: Unbuilt = { module: '/app/list.contract', name: 'Row', error: 'no parent' };
const list: Unbuilt = { module: '/app/list.contract', name: 'List', error: 'no such prop' };
const chunk = (modules: Record<string, { renderedExports?: string[] }>): Chunks => ({ 'stories.js': { type: 'chunk', modules }, 'style.css': { type: 'asset' } });

describe('stillUsed', () => {
  it('leaves out a component whose export the build dropped', () => {
    expect(stillUsed([row, list], chunk({ '/app/list.contract': { renderedExports: ['List'] } }))).toEqual([list]);
  });

  it('leaves out the components of a module the bundle does not hold', () => {
    expect(stillUsed([row], chunk({ '/app/other.contract': { renderedExports: ['Row'] } }))).toEqual([]);
  });

  it('keeps every component of a module imported whole', () => {
    expect(stillUsed([row, list], chunk({ '/app/list.contract': { renderedExports: ['default'] } }))).toEqual([row, list]);
  });

  it('keeps every component when the bundler does not say what it kept', () => {
    expect(stillUsed([row], chunk({ '/app/list.contract': {} }))).toEqual([row]);
  });

  it('looks in every chunk', () => {
    const bundle: Chunks = {
      'a.js': { type: 'chunk', modules: { '/app/list.contract': { renderedExports: [] } } },
      'b.js': { type: 'chunk', modules: { '/app/list.contract': { renderedExports: ['Row'] } } },
    };
    expect(stillUsed([row, list], bundle)).toEqual([row]);
  });
});

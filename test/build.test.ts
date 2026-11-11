import { describe, expect, it } from 'vitest';

import { readSourceTypes, storybookEntry } from '../src/node/build.ts';

// The end of a `main.js` as Exact generates it: boot code, then `go(start);`, sometimes followed by more.
const MAIN = `import { data, commit, R, Resources, journal } from './rt.js';
const start = () => mount(document.getElementById('exact-root'));
async function go(f) { await fonts; return f(); }
if (agentMode()) { After.push(() => {}); }
go(start);
`;

describe('storybookEntry', () => {
  it('takes the boot out of main.js and hands it to storybookStart', () => {
    const entry = storybookEntry(MAIN);
    expect(entry).not.toContain('go(start);');
    expect(entry).toContain("if (agentMode()) { After.push(() => {}); }\n\n");
    expect(entry).toContain('export function storybookStart(bridge) {');
    expect(entry).toContain('  return Promise.resolve(go(() => bridge.launch(start))).then(() => ({');
    expect(entry).toContain("from './rt.js';");
  });

  it('keeps what follows the boot', () => {
    const entry = storybookEntry(`${MAIN}window.after = 1;\n`);
    expect(entry).toContain('window.after = 1;');
    expect(entry.indexOf('window.after')).toBeLessThan(entry.indexOf('export function storybookStart'));
  });

  it('takes only the last boot, leaving one that is in a string or a comment', () => {
    const entry = storybookEntry(`// see go(start);\n${MAIN}`);
    expect(entry.startsWith('// see go(start);\n')).toBe(true);
    expect(entry.match(/go\(start\);/g)).toHaveLength(1);
  });

  it('runs: the app boots when the preview starts it, not when it is imported', async () => {
    const booted: string[] = [];
    const main = 'const start = () => booted.push("start");\nconst go = (f) => f();\ngo(start);\n';
    // The entry's import of rt.js stands for Exact's runtime; give the body the names it uses instead.
    const body = storybookEntry(main)
      .replace(/^import .*$/m, '')
      .replace('export function storybookStart', 'return function storybookStart');
    const rt = { data: {} as { answer?: (source: string, args: unknown[]) => unknown }, journal: ['j'], resources: [{ source: 'storyArgs' }, { source: 'other' }] };
    const refreshed: unknown[] = [];
    const start = new Function(
      'booted',
      '__sbData',
      '__sbCommit',
      '__sbRefresh',
      '__sbResources',
      '__sbJournal',
      body
    )(booted, rt.data, (f: () => void) => f(), (r: unknown) => refreshed.push(r), rt.resources, rt.journal);
    expect(booted).toEqual([]);
    const handle = await start({
      answer: (source: string) => `answer to ${source}`,
      launch: (boot: () => unknown) => (booted.push('launch'), boot()),
    });
    expect(booted).toEqual(['launch', 'start']);
    expect(rt.data.answer!('storyArgs', [])).toBe('answer to storyArgs');
    expect(handle.journal).toBe(rt.journal);
    handle.refresh('storyArgs');
    expect(refreshed).toEqual([{ source: 'storyArgs' }]);
  });

  it('refuses a main.js that does not boot with go(start)', () => {
    expect(() => storybookEntry('boot();\n')).toThrow(/no longer ends by booting with `go\(start\);`/);
  });
});

describe('readSourceTypes', () => {
  // The example Todos' names.js, as Exact's build writes it.
  const TODOS =
    'export default[["draft","changed"],["left"],["todos"]];export const types=[["s",["?",{"count":"n"}]],["n"],[["[",{"id":"s","title":"s","done":"b"}]]];\n' +
    'export const sourceTypes={"addTodo":[["s"],{"count":"n"}],"removeTodo":[["s"],{"count":"n"}],"setDone":[["s","b"],{"count":"n"}],"todos":[[],["[",{"id":"s","title":"s","done":"b"}]]};export const pages=[];export const viewportMedia=[];';

  it('reads each source’s argument types and answer type', () => {
    expect(readSourceTypes(TODOS)).toEqual({
      addTodo: [['s'], { count: 'n' }],
      removeTodo: [['s'], { count: 'n' }],
      setDone: [['s', 'b'], { count: 'n' }],
      todos: [[], ['[', { id: 's', title: 's', done: 'b' }]],
    });
  });

  it('reads sourceTypes as the last export', () => {
    expect(readSourceTypes('export default[];export const sourceTypes={"storyArgs":[[],{"title":"s"}]};\n')).toEqual({ storyArgs: [[], { title: 's' }] });
    expect(readSourceTypes('export const sourceTypes={}')).toEqual({});
  });

  it('is empty for a plan with no sources', () => {
    expect(readSourceTypes('export default[];export const types=[];')).toEqual({});
  });
});

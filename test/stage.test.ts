import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assemble, bootModule, findStage, keepStage, sourcesOf, stagingKey } from '../src/node/stage.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'exact-stage-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const put = (path: string, text = '') => {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
};
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const app = (sources: Record<string, unknown>) => `import{mount}from"./rt.js";export const sources=${JSON.stringify(sources)};export const wait=[];export default()=>mount();`;

/** What the compiler writes for a component. */
function compiled(name: string, sources: Record<string, unknown> = { storyArgs: [[], 's'] }, extra: Record<string, string> = {}): string {
  put(`${name}/app.js`, `/* ${name} */${app(sources)}`);
  put(`${name}/app.css`, `#exact-root#exact-root{.c1{color:${name}}}`);
  put(`${name}/names.js`, `export const sourceTypes=${JSON.stringify(sources)};`);
  put(`${name}/app.plan`, `plan of ${name}`);
  for (const [file, text] of Object.entries(extra)) put(`${name}/${file}`, text);
  return join(root, name);
}

/** What Exact's build leaves for it. */
function whole(name: string, from: string): string {
  for (const file of ['app.js', 'app.css', 'names.js', 'app.plan']) put(`${name}-out/.gen/${file}`, readFileSync(join(from, file), 'utf8'));
  put(`${name}-out/.gen/rt.js`, 'export const mount = () => {};');
  put(`${name}-out/.gen/perf.js`, "import './names.js';");
  put(`${name}-out/.gen/agent-names.js`, readFileSync(join(from, 'names.js'), 'utf8'));
  put(`${name}-out/.gen/main.js`, `import app from './app.js';\nglobalThis.exact.plan = "${'0'.repeat(64)}";\ngo(start);\n`);
  put(`${name}-out/.gen/server.js`, 'unused');
  put(`${name}-out/style.css`, `html{margin:0}${readFileSync(join(from, 'app.css'), 'utf8')}`);
  return join(root, `${name}-out`);
}

describe('sourcesOf', () => {
  it('reads the sources an app asks from its generated module', () => {
    expect(sourcesOf(app({ storyArgs: [[], { label: 's' }], exactTime: [[], {}] }))).toEqual(['storyArgs', 'exactTime']);
    expect(sourcesOf(app({}))).toEqual([]);
    expect(sourcesOf('export default 1;')).toEqual([]);
  });
});

describe('stagingKey', () => {
  it('is the same for two components that differ only in their own modules', () => {
    expect(stagingKey(compiled('a'))).toBe(stagingKey(compiled('b', { storyArgs: [[], 'n'], storyAction_press: [[], 'b'] })));
  });

  it('differs when the app asks no source of its own, or reads the time', () => {
    const asks = stagingKey(compiled('a'));
    expect(stagingKey(compiled('b', {}))).not.toBe(asks);
    expect(stagingKey(compiled('c', { exactTime: [[], {}] }))).not.toBe(stagingKey(compiled('d', {})));
    expect(stagingKey(compiled('e', { storyArgs: [[], 's'], exactTime: [[], {}] }))).not.toBe(asks);
  });

  it('differs by a flag the compiler wrote, and by what the flag says', () => {
    const plain = stagingKey(compiled('a'));
    const dialogs = stagingKey(compiled('b', undefined, { 'dialogs.flag': '' }));
    expect(dialogs).not.toBe(plain);
    expect(stagingKey(compiled('c', undefined, { 'sounds.flag': '["tap"]' }))).not.toBe(stagingKey(compiled('d', undefined, { 'sounds.flag': '["pop"]' })));
  });

  it('takes a file it does not know to matter', () => {
    expect(stagingKey(compiled('a', undefined, { 'new-thing.json': '{}' }))).not.toBe(stagingKey(compiled('b')));
  });

  it('does not count a source a native module answers as the app asking', () => {
    const native = { 'modules.flag': JSON.stringify({ extensions: [], sources: ['battery'] }) };
    expect(JSON.parse(stagingKey(compiled('a', { battery: [[], 'n'] }, native)))).toMatchObject({ asks: false });
    expect(JSON.parse(stagingKey(compiled('b', { battery: [[], 'n'], storyArgs: [[], 's'] }, native)))).toMatchObject({ asks: true });
  });
});

describe('bootModule', () => {
  it("writes the plan's digest where the build wrote another's", () => {
    const main = `x();\nglobalThis.exact.plan = "${'0'.repeat(64)}";\ngo(start);\n`;
    const booted = bootModule(main, Buffer.from('plan'));
    expect(booted).toMatch(/globalThis\.exact\.plan = "[0-9a-f]{64}";/);
    expect(booted).not.toContain('0'.repeat(64));
    expect(bootModule(main, Buffer.from('another'))).not.toBe(booted);
  });
});

describe('a stage', () => {
  const stages = () => join(root, 'stages');

  it('is found once kept, by its key', () => {
    const first = compiled('first');
    const key = stagingKey(first);
    expect(findStage(stages(), key)).toBeNull();
    const stage = keepStage(stages(), key, whole('first', first), first);
    expect(findStage(stages(), key)).toMatchObject({ id: stage.id, base: 'html{margin:0}' });
    expect(findStage(stages(), `${key} `)).toBeNull();
  });

  it("keeps the runtime's modules, and none of the component's", () => {
    const first = compiled('first');
    const stage = keepStage(stages(), stagingKey(first), whole('first', first), first);
    expect(existsSync(join(stage.modules, 'rt.js'))).toBe(true);
    expect(existsSync(join(stage.modules, 'perf.js'))).toBe(true);
    for (const file of ['app.js', 'app.css', 'names.js', 'app.plan', 'agent-names.js', 'main.js', 'server.js']) expect(existsSync(join(stage.modules, file)), file).toBe(false);
  });

  it("refuses a build whose stylesheet is not the base followed by the app's", () => {
    const first = compiled('first');
    const out = whole('first', first);
    writeFileSync(join(out, 'style.css'), 'html{margin:0}');
    expect(() => keepStage(stages(), stagingKey(first), out, first)).toThrow('newer than storybook-framework-exact supports');
  });

  it("gives another component the same modules around its own, as the build would have", () => {
    const first = compiled('first');
    const stage = keepStage(stages(), stagingKey(first), whole('first', first), first);
    const second = compiled('second', { storyArgs: [[], 'n'] });
    assemble(stage, second, join(root, 'gen'));
    expect(read('gen/app.js')).toContain('/* second */');
    expect(read('gen/names.js')).toBe(read('second/names.js'));
    expect(read('gen/agent-names.js')).toBe(read('second/names.js'));
    expect(read('gen/rt.js')).toBe('export const mount = () => {};');
    expect(read('gen/main.js')).not.toContain('0'.repeat(64));
    expect(read('gen/main.js')).toContain("import app from './app.js';");
  });

  it('leaves the stage as it was when a component is assembled again, with less than before', () => {
    const first = compiled('first');
    const stage = keepStage(stages(), stagingKey(first), whole('first', first), first);
    const gen = join(root, 'gen');
    assemble(stage, compiled('second', undefined, { 'paint.js': 'export const paint = 1;' }), gen);
    expect(existsSync(join(gen, 'paint.js'))).toBe(true);
    // The component no longer paints: the compiler writes no paint.js, and the old one must go.
    rmSync(join(root, 'second'), { recursive: true });
    assemble(stage, compiled('second'), gen);
    expect(existsSync(join(gen, 'paint.js'))).toBe(false);
    expect(read('gen/app.js')).toContain('/* second */');
    // What the stage holds is linked, not copied, and nothing wrote through a link.
    expect(readFileSync(join(stage.modules, 'rt.js'), 'utf8')).toBe('export const mount = () => {};');
    expect(statSync(join(gen, 'rt.js')).ino).toBe(statSync(join(stage.modules, 'rt.js')).ino);
    expect(stage.main).toContain('0'.repeat(64));
  });

  it('starts a module directory again for another stage', () => {
    const plain = compiled('plain');
    const dialogs = compiled('dialogs', undefined, { 'dialogs.flag': '' });
    const one = keepStage(stages(), stagingKey(plain), whole('plain', plain), plain);
    const outOfDialogs = whole('dialogs', dialogs);
    writeFileSync(join(outOfDialogs, '.gen/prompt-glue.js'), 'export {};');
    const two = keepStage(stages(), stagingKey(dialogs), outOfDialogs, dialogs);
    const gen = join(root, 'gen');
    assemble(two, dialogs, gen);
    expect(existsSync(join(gen, 'prompt-glue.js'))).toBe(true);
    assemble(one, plain, gen);
    expect(existsSync(join(gen, 'prompt-glue.js'))).toBe(false);
    expect(existsSync(join(gen, 'dialogs.flag'))).toBe(false);
  });
});

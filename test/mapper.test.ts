import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { serve, transform } from '../src/node/mapper.ts';

const row = `// A row of the list.
use Person as Owner, Button from "./people.contract"
use Chip from "@exact/chips"

shape Item
  id: string
  owner: option<Owner>

component Row
  props
    item: Item   // the row's item
    owner: Owner
    select: action
  inject
    accent: color
  view
    text item.id
`;

describe('transform', () => {
  const { text, extension, mappings } = transform('/app/row.contract', row);

  it('gives TypeScript the declarations a generated file holds, as a module', () => {
    expect(extension).toBe('.ts');
    expect(text).toContain('export interface RowArgs {\n  item: Item;\n  owner: Owner;\n  select?: (...args: any[]) => void;\n  accent: string;\n}');
    expect(text).toContain('export declare const Row: ExactComponent<RowArgs>;');
    expect(text).toContain('declare const components: { Row: typeof Row };\nexport default components;');
  });

  it("takes a shape another Contract file declares from that file's shapes, under the name this file gives it", () => {
    expect(text).toContain('import type { $Shapes as $Shapes0 } from "./people.contract";');
    expect(text).toContain('type Owner = $Shapes0 extends { Person: infer T } ? T : unknown;');
    expect(text).toContain('export interface Item {\n  id: string;\n  owner: Owner | null;\n}');
    expect(text).toContain('export interface $Shapes { Item: Item }');
  });

  it('leaves out what no type mentions, and what a package declares', () => {
    expect(text).not.toContain('Button');
    expect(text).not.toContain('Chip');
    expect(text).not.toContain('@exact/chips');
  });

  it('ties each declared name, and the file a shape is taken from, to where the source has it', () => {
    const tied = mappings.map(([at, length, from, sourceLength]) => {
      expect(sourceLength).toBe(length);
      expect(text.slice(at, at + length)).toBe(row.slice(from, from + length));
      const before = row.lastIndexOf('\n', from) + 1;
      return `${text.slice(at, at + length)} @ ${row.slice(before, from).trim() || 'line start'}`;
    });
    expect(tied).toEqual([
      '"./people.contract" @ use Person as Owner, Button from',
      'Item @ shape',
      'id @ line start',
      'owner @ line start',
      'item @ line start',
      'owner @ line start',
      'select @ line start',
      'accent @ line start',
      'Row @ component',
    ]);
  });

  it('lets a name be looked up from TypeScript, and does not let it be renamed from there', () => {
    const HOVER = 1;
    const DEFINITION = 8;
    const REFERENCES = 64;
    const RENAME = 256;
    for (const [, , , , kind, features] of mappings) {
      expect(kind).toBe(0);
      expect(features & (HOVER | DEFINITION | REFERENCES)).toBe(HOVER | DEFINITION | REFERENCES);
      expect(features & RENAME).toBe(0);
    }
  });

  it('counts a byte order mark and Windows line ends in its positions', () => {
    const source = `﻿${row.replaceAll('\n', '\r\n')}`;
    const marked = transform('/app/row.contract', source);
    expect(marked.text).toBe(text);
    for (const [at, length, from] of marked.mappings) expect(marked.text.slice(at, at + length)).toBe(source.slice(from, from + length));
  });

  it('is a module for a file with nothing to declare', () => {
    expect(transform('/app/empty.contract', '// nothing yet\n').text).toContain('export default components;');
  });
});

/** A client of the mapper, as TypeScript is one: framed JSON-RPC over two streams. */
function client() {
  const input = new PassThrough();
  const output = new PassThrough();
  serve(input, output);
  let received = Buffer.alloc(0);
  const waiting: ((message: any) => void)[] = [];
  output.on('data', (chunk: Buffer) => {
    received = Buffer.concat([received, chunk]);
    for (;;) {
      const head = received.indexOf('\r\n\r\n');
      if (head < 0) return;
      const length = Number(/Content-Length: (\d+)/.exec(received.subarray(0, head).toString())![1]);
      if (received.length < head + 4 + length) return;
      waiting.shift()?.(JSON.parse(received.subarray(head + 4, head + 4 + length).toString('utf8')));
      received = received.subarray(head + 4 + length);
    }
  });
  const frame = (message: object) => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8');
    return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
  };
  const reply = () => new Promise<any>((resolve) => waiting.push(resolve));
  return {
    input,
    frame,
    reply,
    request(id: number, method: string, params: unknown) {
      const answered = reply();
      input.write(frame({ id, method, params }));
      return answered;
    },
  };
}

describe('serve', () => {
  it('speaks the protocol TypeScript 7.1 does: initialize, a project, a file', async () => {
    const mapper = client();
    expect(await mapper.request(1, 'initialize', { positionEncodings: ['utf-8', 'utf-16'] })).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { protocolVersion: 1, positionEncoding: 'utf-16', diagnosticSource: 'storybook-exact' },
    });
    expect((await mapper.request(2, 'openProject', { projectHandle: 'p', configFileName: '/app/tsconfig.json', compilerOptions: {} })).result).toEqual({});
    const { result } = await mapper.request(3, 'transform', { projectHandle: 'p', fileName: '/app/row.contract', content: row });
    expect(result).toEqual(JSON.parse(JSON.stringify(transform('/app/row.contract', row))));
    expect((await mapper.request(4, 'closeProject', { projectHandle: 'p' })).result).toBeNull();
  });

  it('reads a message that arrives in pieces, and two that arrive together, with text outside ASCII', async () => {
    const mapper = client();
    const content = 'component Café\n  props\n    naïve: string\n  view\n    text "é"\n';
    const first = mapper.frame({ id: 1, method: 'transform', params: { fileName: '/app/a.contract', content } });
    const second = mapper.frame({ id: 2, method: 'closeProject', params: {} });
    const replies = [mapper.reply(), mapper.reply()];
    mapper.input.write(first.subarray(0, 7));
    mapper.input.write(first.subarray(7, 60));
    mapper.input.write(Buffer.concat([first.subarray(60), second]));
    const [one, two] = await Promise.all(replies);
    expect(one.id).toBe(1);
    expect(one.result.text).toContain('export interface $Shapes');
    expect(two).toEqual({ jsonrpc: '2.0', id: 2, result: null });
  });

  it('refuses a TypeScript that does not count positions as it does, and a request it does not know', async () => {
    const mapper = client();
    expect((await mapper.request(1, 'initialize', { positionEncodings: ['utf-8'] })).error.code).toBe(-32602);
    const unknown = await mapper.request(2, 'transformAll', {});
    expect(unknown.error.code).toBe(-32601);
    expect(unknown.error.message).toContain('newer than it supports');
  });

  it('answers a request only: a notification gets nothing', async () => {
    const mapper = client();
    mapper.input.write(mapper.frame({ method: 'exit' }));
    mapper.input.write(mapper.frame({ method: 'initialized', params: {} }));
    expect(await mapper.request(1, 'closeProject', {})).toEqual({ jsonrpc: '2.0', id: 1, result: null });
  });
});

// TypeScript itself, reading Contract files through the built mapper (`npm run build` first).
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const built = existsSync(join(root, 'dist/node/content-mapper.js'));

describe.skipIf(!built)('tsc --runExternalCode', () => {
  let project: string;
  const tsc = async (...flags: string[]) => {
    try {
      const { stdout } = await promisify(execFile)(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project, '--pretty', 'false', ...flags]);
      return stdout;
    } catch (error) {
      return (error as { stdout: string }).stdout;
    }
  };
  const write = (name: string, text: string) => writeFileSync(join(project, name), text);

  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), 'exact-mapper-'));
    mkdirSync(join(project, 'node_modules'));
    symlinkSync(root, join(project, 'node_modules/storybook-framework-exact'));
    symlinkSync(join(root, 'node_modules/storybook'), join(project, 'node_modules/storybook'));
    write(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: { target: 'es2022', module: 'esnext', moduleResolution: 'bundler', strict: true, noEmit: true, skipLibCheck: true, types: [] },
        contentMappers: [{ package: 'storybook-framework-exact', extensions: ['.contract'] }],
      })
    );
    write('menu.contract', 'shape Dish\n  id: number\n  name: string\n');
    write('plate.contract', 'use Dish from "./menu.contract"\n\ncomponent Plate\n  props\n    dish: Dish\n    size: enum<"small", "large">\n    eaten: action\n  view\n    text dish.name\n');
    write(
      'plate.stories.ts',
      [
        "import type { Meta, StoryObj } from 'storybook-framework-exact';",
        "import { Plate } from './plate.contract';",
        "const meta = { component: Plate, args: { size: 'small' } } satisfies Meta<typeof Plate>;",
        'export default meta;',
        "export const Fries: StoryObj<typeof Plate> = { args: { dish: { id: 7, name: 'Fries' } } };",
        '',
      ].join('\n')
    );
  });
  afterAll(() => rmSync(project, { recursive: true, force: true }));

  it('types a Contract import with nothing written beside the file', async () => {
    expect(await tsc('--runExternalCode')).toBe('');
  });

  it("checks a story's args against the props, and against a shape of another Contract file", async () => {
    write(
      'wrong.stories.ts',
      [
        "import type { StoryObj } from 'storybook-framework-exact';",
        "import { Plate } from './plate.contract';",
        'export default { component: Plate };',
        "export const Size: StoryObj<typeof Plate> = { args: { size: 'huge' } };",
        "export const Id: StoryObj<typeof Plate> = { args: { dish: { id: 'seven', name: 'Fries' } } };",
        '',
      ].join('\n')
    );
    const output = await tsc('--runExternalCode');
    rmSync(join(project, 'wrong.stories.ts'));
    expect(output).toContain(`wrong.stories.ts(4,55): error TS2322: Type '"huge"' is not assignable to type`);
    expect(output).toContain("wrong.stories.ts(5,61): error TS2322: Type 'string' is not assignable to type 'number'.");
  });

  it('says so in the Contract file when a file it takes a shape from is not there', async () => {
    write('lost.contract', 'use Dish from "./nowhere.contract"\n\ncomponent Lost\n  props\n    dish: Dish\n  view\n    text "x"\n');
    const output = await tsc('--runExternalCode');
    rmSync(join(project, 'lost.contract'));
    expect(output).toContain("lost.contract(1,15): error TS2307: Cannot find module './nowhere.contract'");
  });

  it('is not run unless TypeScript is told it may run external code', async () => {
    expect(await tsc()).toContain('error TS18068');
  });
});

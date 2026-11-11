// The framework as a TypeScript content mapper (TypeScript 7.1): how TypeScript reads a `.contract` file.
//
// A project names this package under `contentMappers` in its tsconfig.json, for the `.contract` extension.
// TypeScript then starts the process the package's `typescript.contentMapper` names (content-mapper.ts), and
// asks it over JSON-RPC, on its standard input and output, for each Contract file as TypeScript: the same
// declarations `<name>.d.contract.ts` holds for an older TypeScript, tied to the source, so that a story's
// args are checked with nothing written beside the file, and "Go to Definition" on an arg opens the prop.
//
// The protocol is version 1, as TypeScript 7.1's beta speaks it: `initialize`, `openProject`, `transform`
// for each file, `closeProject`. Messages are framed as the language server protocol frames them.
import type { Readable, Writable } from 'node:stream';

import { type Marks, parseComponents } from './contract.ts';
import { declarations, parseShapes, parseUses } from './typegen.ts';

/** `[start, length]` in the TypeScript, `[start, length]` in the source, how the two relate, what may cross. */
export type Mapping = [virtualStart: number, virtualLength: number, originalStart: number, originalLength: number, kind: number, features: number];

export interface Transformed {
  text: string;
  extension: '.ts';
  mappings: Mapping[];
}

/** The same text in both. */
const VERBATIM = 0;
/**
 * What crosses from a name in the TypeScript to the name in the source: hover, definition, type definition,
 * implementation, references and highlights. Not rename: the source uses the name in places TypeScript
 * does not see.
 */
const NAVIGATION = 1 | 8 | 16 | 32 | 64 | 128;

/** A Contract file as TypeScript. */
export function transform(fileName: string, content: string): Transformed {
  // Positions count the byte order mark; the source is read without it.
  const mark = content.charCodeAt(0) === 0xfeff ? 1 : 0;
  const source = content.slice(mark);
  const marks: Marks = new Map();
  const components = parseComponents(source, marks);
  const { text, spans } = declarations(fileName, components, parseShapes(source, marks), { marks, uses: parseUses(source) });
  return { text, extension: '.ts', mappings: spans.map(([at, length, from]) => [at, length, from + mark, length, VERBATIM, NAVIGATION]) };
}

interface Request {
  id?: number | string | null;
  method?: string;
  params?: any;
}

class Refused extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

function answer(method: string, params: any): unknown {
  switch (method) {
    case 'initialize':
      // Positions are counted as JavaScript counts a string's.
      if (!params?.positionEncodings?.includes('utf-16')) throw new Refused(-32602, 'storybook-framework-exact counts positions in UTF-16, which this TypeScript does not offer.');
      return { protocolVersion: 1, positionEncoding: 'utf-16', diagnosticSource: 'storybook-exact' };
    case 'openProject':
      return {};
    case 'closeProject':
      return null;
    case 'transform':
      return transform(params.fileName, params.content);
    default:
      throw new Refused(-32601, `storybook-framework-exact's content mapper does not know "${method}". This TypeScript is newer than it supports.`);
  }
}

/** Answer TypeScript's requests on `input`, on `output`, until `input` ends. */
export function serve(input: Readable, output: Writable): void {
  let waiting = Buffer.alloc(0);
  const send = (message: object) => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8');
    output.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]));
  };
  const handle = ({ id, method, params }: Request) => {
    // A notification asks for no answer, and this asks TypeScript nothing, so anything else is not for it.
    if (method === undefined || id === undefined) return;
    try {
      send({ id, result: answer(method, params) });
    } catch (error) {
      send({ id, error: { code: error instanceof Refused ? error.code : -32603, message: error instanceof Error ? error.message : String(error) } });
    }
  };
  input.on('data', (chunk: Buffer) => {
    waiting = Buffer.concat([waiting, chunk]);
    for (;;) {
      const head = waiting.indexOf('\r\n\r\n');
      if (head < 0) return;
      const length = Number(/^content-length:\s*(\d+)/im.exec(waiting.subarray(0, head).toString('ascii'))?.[1]);
      if (!Number.isInteger(length)) throw new Error('A message to the content mapper has no Content-Length.');
      const end = head + 4 + length;
      if (waiting.length < end) return;
      const message = JSON.parse(waiting.subarray(head + 4, end).toString('utf8')) as Request;
      waiting = waiting.subarray(end);
      handle(message);
    }
  });
}

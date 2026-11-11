// A Contract file as TypeScript sees it: its components with their args, and its shapes, so
// `import { Button } from './button.contract'` is typed and a story's args are checked against the
// component's props.
//
// TypeScript 7.1 asks for these as it reads a `.contract` file (content-mapper.ts). For an older TypeScript
// they are written beside the file as `<name>.d.contract.ts`, the name `allowArbitraryExtensions` looks for.
import { basename, dirname, join } from 'node:path';

import type { ComponentInfo, Field } from '../types.ts';
import { enumMembers, isAction, lines, type Marks, typeNames } from './contract.ts';

export interface ShapeInfo {
  name: string;
  fields: Field[];
}

/** The shapes a Contract file declares. `marks` is given where each and its fields are declared. */
export function parseShapes(source: string, marks?: Marks): ShapeInfo[] {
  const shapes: ShapeInfo[] = [];
  let current: ShapeInfo | null = null;
  for (const { line, offset } of lines(source)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      const declared = /^shape\s+([A-Za-z_]\w*)/.exec(line);
      current = declared ? { name: declared[1]!, fields: [] } : null;
      if (current) shapes.push(current);
      if (declared) marks?.set(declared[1]!, offset + declared[0].length - declared[1]!.length);
    } else if (current) {
      const field = /^([A-Za-z_]\w*)\s*:\s*(.+)$/.exec(line.trim());
      if (!field) continue;
      current.fields.push({ name: field[1]!, type: field[2]!.trim() });
      marks?.set(`${current.name}.${field[1]}`, offset + line.length - line.trimStart().length);
    }
  }
  return shapes;
}

/** A name another Contract file declares, as this one takes it: `use Dish as Plate from "./menu.contract"`. */
export interface Use {
  name: string;
  /** What this file calls it. */
  as: string;
  from: string;
  /** Where `from` is written, after its opening quote. */
  at: number;
}

/** What a Contract file takes from other Contract files by path. A package's is not followed. */
export function parseUses(source: string): Use[] {
  const uses: Use[] = [];
  for (const { line, offset } of lines(source)) {
    const use = /^use\s+(.+?)\s+from\s+"(\.[^"]*\.contract)"/.exec(line);
    if (!use) continue;
    const at = offset + use[0].length - use[2]!.length - 1;
    for (const item of use[1]!.split(',')) {
      const named = /^([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?$/.exec(item.trim());
      if (named) uses.push({ name: named[1]!, as: named[2] ?? named[1]!, from: use[2]!, at });
    }
  }
  return uses;
}

/** A Contract type in TypeScript. A shape this file does not know is `unknown`. */
export function tsType(type: string, shapes: ReadonlySet<string>): string {
  const t = type.trim();
  if (t.endsWith('[]')) return `Array<${tsType(t.slice(0, -2), shapes)}>`;
  if (t.startsWith('option<') && t.endsWith('>')) return `${tsType(t.slice('option<'.length, -1), shapes)} | null`;
  const members = enumMembers(t);
  if (members) return members.map((m) => JSON.stringify(m)).join(' | ') || 'string';
  if (t === 'string' || t === 'color') return 'string';
  if (t === 'number') return 'number';
  if (t === 'bool') return 'boolean';
  if (t === 'action') return '(...args: any[]) => void';
  return shapes.has(t) ? t : 'unknown';
}

/** Where a Contract file's declarations go. */
export const declarationPath = (file: string) => join(dirname(file), `${basename(file, '.contract')}.d.contract.ts`);

/** What every mapped Contract file exports its shapes under, by name. No Contract name has a `$`. */
const SHAPES = '$Shapes';

/** A span of the declarations that is a span of the Contract source, the same text in both. */
export type Span = [at: number, length: number, source: number];

export interface Declarations {
  text: string;
  spans: Span[];
}

/** The source the declarations are for, when TypeScript reads them in its place. */
export interface Linked {
  marks: Marks;
  uses: Use[];
}

/**
 * A Contract file's declarations. With `linked`, each declared name is tied to where the source declares it,
 * and a shape taken from another Contract file is that file's shape, not `unknown`: each mapped file exports
 * its shapes by name, and the one that uses a name takes it from there if it is a shape.
 */
export function declarations(file: string, components: ComponentInfo[], shapes: ShapeInfo[], linked?: Linked): Declarations {
  let text = '';
  const spans: Span[] = [];
  const line = (...parts: string[]) => {
    text += `${parts.join('')}\n`;
  };
  /** `name`, tied to where the source declares it. */
  const tied = (key: string, name: string) => {
    const source = linked?.marks.get(key);
    if (source !== undefined) spans.push([text.length, name.length, source]);
    text += name;
  };

  const fields = [...shapes.flatMap((s) => s.fields), ...components.flatMap((c) => [...c.props, ...c.inject])];
  const mentioned = new Set(fields.flatMap((f) => typeNames(f.type)));
  const taken = (linked?.uses ?? []).filter((use) => mentioned.has(use.as) && !shapes.some((s) => s.name === use.as));
  const known = new Set([...shapes.map((s) => s.name), ...taken.map((use) => use.as)]);

  line(`// Generated by storybook-framework-exact from ${basename(file)}. Do not edit.`);
  line("import type { ExactComponent } from 'storybook-framework-exact';");
  const files = [...new Set(taken.map((use) => use.from))];
  files.forEach((from, index) => {
    // The path with its quotes, as the source has it: what TypeScript underlines when it cannot find the file.
    text += `import type { ${SHAPES} as ${SHAPES}${index} } from `;
    spans.push([text.length, from.length + 2, taken.find((use) => use.from === from)!.at - 1]);
    line(`"${from}";`);
  });
  for (const use of taken) line(`type ${use.as} = ${SHAPES}${files.indexOf(use.from)} extends { ${use.name}: infer T } ? T : unknown;`);
  line();

  for (const shape of shapes) {
    text += 'export interface ';
    tied(shape.name, shape.name);
    line(' {');
    for (const field of shape.fields) {
      text += '  ';
      tied(`${shape.name}.${field.name}`, field.name);
      line(`: ${tsType(field.type, known)};`);
    }
    line('}');
    line();
  }
  for (const component of components) {
    const args = [...component.props, ...component.inject];
    const name = `${component.name}Args`;
    if (args.length) {
      line(`export interface ${name} {`);
      for (const field of args) {
        text += '  ';
        tied(`${component.name}.${field.name}`, field.name);
        // An action prop is optional in a story: the Actions panel takes its calls when no arg is given.
        line(`${isAction(field) ? '?' : ''}: ${tsType(field.type, known)};`);
      }
      line('}');
    } else line(`export interface ${name} {}`);
    text += 'export declare const ';
    tied(component.name, component.name);
    line(`: ExactComponent<${name}>;`);
    line();
  }
  if (linked) line(`export interface ${SHAPES} { ${shapes.map((s) => `${s.name}: ${s.name}`).join('; ')} }`);
  line(`declare const components: { ${components.map((c) => `${c.name}: typeof ${c.name}`).join('; ')} };`);
  line('export default components;');
  return { text, spans };
}

/** A Contract file's declarations, as they are written beside it. */
export const declarationFor = (file: string, components: ComponentInfo[], shapes: ShapeInfo[]) => declarations(file, components, shapes).text;

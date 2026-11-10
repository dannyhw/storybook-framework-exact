import { describe, expect, it } from 'vitest';

import { parseComponents } from '../src/node/contract.ts';
import { declarationFor, declarationPath, parseShapes, tsType } from '../src/node/typegen.ts';

const source = `
// A row of the list.
shape Item
  id: string
  tags: string[]
  owner: option<Person>

shape Person
  name: string

component Row
  props
    item: Item
    tone: enum<"plain", "loud">
    count: number
    select: action
  inject
    accent: color
  view
    text item.id

component Other
  view
    text "x"
`;

describe('parseShapes', () => {
  it('reads each shape and its fields, without comments', () => {
    expect(parseShapes(source)).toEqual([
      { name: 'Item', fields: [{ name: 'id', type: 'string' }, { name: 'tags', type: 'string[]' }, { name: 'owner', type: 'option<Person>' }] },
      { name: 'Person', fields: [{ name: 'name', type: 'string' }] },
    ]);
  });
});

describe('tsType', () => {
  const shapes = new Set(['Item']);
  it.each([
    ['string', 'string'],
    ['color', 'string'],
    ['number', 'number'],
    ['bool', 'boolean'],
    ['enum<"a", "b">', '"a" | "b"'],
    ['Item', 'Item'],
    ['Item[]', 'Array<Item>'],
    ['option<Item>', 'Item | null'],
    ['option<Item>[]', 'Array<Item | null>'],
    ['Elsewhere', 'unknown'],
  ])('%s is %s', (contract, typescript) => {
    expect(tsType(contract, shapes)).toBe(typescript);
  });
});

describe('declarationFor', () => {
  const text = declarationFor('/app/row.contract', parseComponents(source), parseShapes(source));

  it('declares each component with its args, injected values included and actions optional', () => {
    expect(text).toContain('export interface RowArgs {\n  item: Item;\n  tone: "plain" | "loud";\n  count: number;\n  select?: (...args: any[]) => void;\n  accent: string;\n}');
    expect(text).toContain('export declare const Row: ExactComponent<RowArgs>;');
    expect(text).toContain('export interface OtherArgs {}');
  });

  it('declares the shapes and a default export of every component', () => {
    expect(text).toContain('export interface Person {\n  name: string;\n}');
    expect(text).toContain('declare const components: { Row: typeof Row; Other: typeof Other };');
  });

  it('is written where allowArbitraryExtensions looks', () => {
    expect(declarationPath('/app/row.contract')).toBe('/app/row.d.contract.ts');
  });
});

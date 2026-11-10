import { describe, expect, it } from 'vitest';

import { fromWire, toWire } from '../src/preview/wire.ts';
import type { WireType } from '../src/types.ts';

// The types as a real build's `names.js` gives them (the example Todos): `[` is a list, `?` an option.
const TODO: WireType = { id: 's', title: 's', done: 'b' };
const TODOS: WireType = ['[', TODO];
const CHANGE: WireType = ['?', { count: 'n' }];

describe('toWire', () => {
  it('passes a leaf through, and carries a missing one as null', () => {
    expect(toWire('a', 's')).toBe('a');
    expect(toWire(0, 'n')).toBe(0);
    expect(toWire(false, 'b')).toBe(false);
    expect(toWire(undefined, 's')).toBeNull();
    // A source with no known type: the value as it is.
    expect(toWire({ a: 1 }, undefined)).toEqual({ a: 1 });
  });

  it('carries a record as an array in its fields’ order, not the value’s', () => {
    expect(toWire({ done: true, title: 'Walk', id: '2' }, TODO)).toEqual(['2', 'Walk', true]);
  });

  it('carries a missing field as null and drops a field the type does not have', () => {
    expect(toWire({ id: '1', extra: 'x' }, TODO)).toEqual(['1', null, null]);
  });

  it('carries a list of records', () => {
    expect(
      toWire(
        [
          { id: '1', title: 'Buy milk', done: false },
          { id: '2', title: 'Walk the dog', done: true },
        ],
        TODOS
      )
    ).toEqual([
      ['1', 'Buy milk', false],
      ['2', 'Walk the dog', true],
    ]);
  });

  it('carries an option as its value, or null for none', () => {
    expect(toWire({ count: 3 }, CHANGE)).toEqual([3]);
    expect(toWire(null, CHANGE)).toBeNull();
    expect(toWire(undefined, CHANGE)).toBeNull();
  });

  it('carries nested records, lists and options', () => {
    const type: WireType = { owner: { name: 's', tags: ['[', 's'] }, best: ['?', TODO], items: ['[', ['?', 'n']] };
    expect(toWire({ items: [1, null], best: { id: '1', title: 'A', done: true }, owner: { tags: ['x'], name: 'Ann' } }, type)).toEqual([
      ['Ann', ['x']],
      ['1', 'A', true],
      [1, null],
    ]);
  });

  it('says where a list was expected and what it got', () => {
    expect(() => toWire({ id: '1' }, TODOS, 'todos')).toThrow('todos should be a list, and is object');
    expect(() => toWire(null, TODOS, 'todos')).toThrow('todos should be a list, and is null');
  });

  it('says where a record was expected, with its fields, and what it got', () => {
    expect(() => toWire('nope', TODO, 'args')).toThrow('args should be a record with the fields id, title, done, and is string');
    expect(() => toWire(null, TODO)).toThrow('value should be a record with the fields id, title, done, and is null');
  });

  it('names the path into a nested value', () => {
    const type: WireType = { list: ['[', { item: TODO }] };
    expect(() => toWire({ list: [{ item: TODO_VALUE }, { item: 5 }] }, type, 'args')).toThrow('args.list[1].item should be a record');
  });
});

const TODO_VALUE = { id: '1', title: 'A', done: false };

describe('fromWire', () => {
  it('names a record’s fields', () => {
    expect(fromWire(['2', 'Walk', true], TODO)).toEqual({ id: '2', title: 'Walk', done: true });
  });

  it('reads a list of records, an option and none', () => {
    expect(fromWire([['1', 'A', false]], TODOS)).toEqual([TODO_VALUE]);
    expect(fromWire([3], CHANGE)).toEqual({ count: 3 });
    expect(fromWire(null, CHANGE)).toBeNull();
    expect(fromWire(undefined, 's')).toBeNull();
  });

  it('reads nested values', () => {
    const type: WireType = { owner: { name: 's', tags: ['[', 's'] }, best: ['?', TODO], items: ['[', ['?', 'n']] };
    expect(fromWire([['Ann', ['x']], null, [1, null]], type)).toEqual({ owner: { name: 'Ann', tags: ['x'] }, best: null, items: [1, null] });
  });

  it('round-trips what toWire carries', () => {
    const type: WireType = { todos: TODOS, change: CHANGE, note: ['?', 's'] };
    const value = { todos: [TODO_VALUE], change: { count: 1 }, note: null };
    expect(fromWire(toWire(value, type), type)).toEqual(value);
  });

  it('leaves a value that does not have the type’s form as it is, rather than throwing', () => {
    expect(fromWire('x', TODOS)).toBe('x');
    expect(fromWire({ id: '1' }, TODO)).toEqual({ id: '1' });
  });
});

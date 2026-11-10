import type { ArgTypes } from 'storybook/internal/types';
import { describe, expect, it } from 'vitest';

import { enhanceArgTypes, exactArgTypes, isExactComponent } from '../src/preview/arg-types.ts';
import type { ExactComponent } from '../src/types.ts';

const component = (props: ExactComponent['props'], inject: ExactComponent['inject'] = []): ExactComponent => ({
  __exact: true,
  name: 'Button',
  props,
  inject,
  slot: false,
  root: false,
  id: 'Button-1234abcd',
  file: 'button.contract',
  defaults: {},
  manifest: 'exact-assets/Button-1234abcd/manifest.json',
  revision: '0123456789abcdef',
});

const BUTTON = component([
  { name: 'label', type: 'string' },
  { name: 'tone', type: 'enum<"primary", "secondary">' },
  { name: 'disabled', type: 'bool' },
  { name: 'press', type: 'action' },
]);

type Context = Parameters<typeof enhanceArgTypes>[0];
const enhance = (component: unknown, argTypes: ArgTypes) => enhanceArgTypes({ component, argTypes } as unknown as Context);

describe('isExactComponent', () => {
  it('is a component imported from a .contract file', () => {
    expect(isExactComponent(BUTTON)).toBe(true);
    expect(isExactComponent({ name: 'Button' })).toBe(false);
    expect(isExactComponent(null)).toBe(false);
    expect(isExactComponent(() => null)).toBe(false);
  });
});

describe('exactArgTypes', () => {
  it('gives each prop the control its type calls for, and an action its action', () => {
    expect(exactArgTypes(BUTTON)).toEqual({
      label: { control: { type: 'text' }, table: { type: { summary: 'string' } } },
      tone: { control: { type: 'select' }, options: ['primary', 'secondary'], table: { type: { summary: '"primary" | "secondary"' } } },
      disabled: { control: { type: 'boolean' }, table: { type: { summary: 'bool' } } },
      press: { action: 'press', table: { type: { summary: 'action' }, category: 'actions' } },
    });
  });

  it('uses number, color and object controls', () => {
    const argTypes = exactArgTypes(
      component([
        { name: 'count', type: 'number' },
        { name: 'tint', type: 'color' },
        { name: 'items', type: 'Item[]' },
        { name: 'owner', type: 'User' },
      ])
    );
    expect(Object.values(argTypes).map((a) => a.control)).toEqual([{ type: 'number' }, { type: 'color' }, { type: 'object' }, { type: 'object' }]);
  });

  it('gives an option its value’s control, and keeps the declared type in the table', () => {
    const argTypes = exactArgTypes(
      component([
        { name: 'note', type: 'option<string>' },
        { name: 'size', type: 'option<enum<"s", "l">>' },
        { name: 'owner', type: 'option<User>' },
      ])
    );
    expect(argTypes.note).toEqual({ control: { type: 'text' }, table: { type: { summary: 'option<string>' } } });
    expect(argTypes.size).toMatchObject({ control: { type: 'select' }, options: ['s', 'l'] });
    expect(argTypes.owner!.control).toEqual({ type: 'object' });
  });

  it('puts injected values in their own table category, after the props', () => {
    const argTypes = exactArgTypes(component([{ name: 'label', type: 'string' }], [{ name: 'theme', type: 'enum<"light", "dark">' }]));
    expect(Object.keys(argTypes)).toEqual(['label', 'theme']);
    expect(argTypes.theme).toMatchObject({ control: { type: 'select' }, options: ['light', 'dark'], table: { category: 'inject' } });
  });
});

describe('enhanceArgTypes', () => {
  it('leaves a story without an Exact component as it is', () => {
    const argTypes = { label: { name: 'label', control: { type: 'text' } } } as ArgTypes;
    expect(enhance(undefined, argTypes)).toBe(argTypes);
  });

  it('adds what the component’s source says, named', () => {
    const merged = enhance(BUTTON, {});
    expect(merged.tone).toEqual({ name: 'tone', control: { type: 'select' }, options: ['primary', 'secondary'], table: { type: { summary: '"primary" | "secondary"' } } });
    expect(merged.press).toMatchObject({ name: 'press', action: 'press' });
  });

  it('lets the story’s argTypes win, field by field, and merges the table', () => {
    const merged = enhance(BUTTON, {
      tone: { name: 'tone', control: { type: 'radio' }, description: 'How loud' },
      label: { name: 'label', table: { category: 'text' } },
    } as ArgTypes);
    expect(merged.tone).toMatchObject({ control: { type: 'radio' }, options: ['primary', 'secondary'], description: 'How loud' });
    expect(merged.label!.table).toEqual({ type: { summary: 'string' }, category: 'text' });
  });

  it('keeps argTypes the story gives for args the component does not have', () => {
    const merged = enhance(BUTTON, { extra: { name: 'extra', control: { type: 'text' } } } as ArgTypes);
    expect(merged.extra).toEqual({ name: 'extra', control: { type: 'text' } });
    expect(Object.keys(merged).sort()).toEqual(['disabled', 'extra', 'label', 'press', 'tone']);
  });
});

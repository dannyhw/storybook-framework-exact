// Controls and actions from a component's `props`, so a story needs no argTypes of its own.
import type { ArgTypes, ArgTypesEnhancer, InputType } from 'storybook/internal/types';

import type { ExactComponent, Field } from '../types.ts';
import type { ExactRenderer } from '../public-types.ts';

export const isExactComponent = (value: unknown): value is ExactComponent => !!value && typeof value === 'object' && (value as ExactComponent).__exact === true;

const members = (type: string) => (type.startsWith('enum<') ? [...type.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!) : null);

function inputType(field: Field, category?: string): InputType {
  const table = { type: { summary: field.type }, ...(category ? { category } : {}) };
  if (field.type === 'action') return { action: field.name, table: { ...table, category: 'actions' } };
  // An option's control is its value's: clearing it gives `none`.
  const type = field.type.startsWith('option<') ? field.type.slice('option<'.length, -1) : field.type;
  const options = members(type);
  if (options) return { control: { type: 'select' }, options, table: { ...table, type: { summary: options.map((o) => `"${o}"`).join(' | ') } } };
  const control = type === 'bool' ? 'boolean' : type === 'number' ? 'number' : type === 'color' ? 'color' : type === 'string' ? 'text' : 'object';
  return { control: { type: control }, table };
}

export function exactArgTypes(component: ExactComponent): ArgTypes {
  const argTypes: ArgTypes = {};
  for (const prop of component.props) argTypes[prop.name] = inputType(prop);
  for (const injected of component.inject) argTypes[injected.name] = inputType(injected, 'inject');
  return argTypes;
}

/** What the story says about an arg wins over what its component's source says. */
export const enhanceArgTypes: ArgTypesEnhancer<ExactRenderer> = (context) => {
  if (!isExactComponent(context.component)) return context.argTypes;
  const inferred = exactArgTypes(context.component);
  const merged: ArgTypes = { ...context.argTypes };
  for (const [name, input] of Object.entries(inferred)) {
    const given: InputType = context.argTypes[name] ?? {};
    merged[name] = { ...input, ...given, name, table: { ...input.table, ...given.table } };
  }
  return merged as typeof context.argTypes;
};

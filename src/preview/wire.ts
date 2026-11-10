// Values at Exact's data seam. The runtime carries a record as an array in its shape's field order, a list
// as an array, and `none` as null; a story and its mocks use plain objects by field name.
import type { WireType } from '../types.ts';

const isLeaf = (type: WireType | undefined): type is string | undefined => !type || typeof type === 'string';

/** A story's value as the runtime carries it. */
export function toWire(value: unknown, type: WireType | undefined, path = 'value'): unknown {
  if (isLeaf(type)) return value ?? null;
  if (Array.isArray(type)) {
    if (type[0] === '?') return value == null ? null : toWire(value, type[1], path);
    if (!Array.isArray(value)) throw new Error(`${path} should be a list, and is ${value === null ? 'null' : typeof value}`);
    return value.map((item, index) => toWire(item, type[1], `${path}[${index}]`));
  }
  if (value === null || typeof value !== 'object') throw new Error(`${path} should be a record with the fields ${Object.keys(type).join(', ')}, and is ${value === null ? 'null' : typeof value}`);
  return Object.keys(type).map((field) => toWire((value as Record<string, unknown>)[field], type[field], `${path}.${field}`));
}

/** A runtime value as a story's mock or action handler sees it. */
export function fromWire(value: unknown, type: WireType | undefined): unknown {
  if (isLeaf(type) || value == null) return value ?? null;
  if (Array.isArray(type)) {
    if (type[0] === '?') return fromWire(value, type[1]);
    return Array.isArray(value) ? value.map((item) => fromWire(item, type[1])) : value;
  }
  if (!Array.isArray(value)) return value;
  return Object.fromEntries(Object.keys(type).map((field, index) => [field, fromWire(value[index], type[field])]));
}

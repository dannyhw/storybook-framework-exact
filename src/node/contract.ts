// What the framework reads from Contract source, and the Contract it writes.
//
// Exact has no command that describes a component's interface yet, so `parseComponents` reads the sections it
// needs (`props`, `inject`, `slot`, and whether the component owns data) from the text. It reads Contract as
// `contract fmt` writes it: sections indented under `component`, one entry a line.
import type { ComponentInfo, Field } from '../types.ts';

const DATA_SECTIONS = new Set(['resource', 'mutation', 'task']);

/** A line without its trailing comment. `//` inside a string (a URL) is not a comment. */
function uncommented(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === '`') quote = c;
    else if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

/**
 * Where each name is declared, as an offset in the source: a component by its name (`Row`), a prop or an
 * injected value by `Row.item`, a shape by its name and a shape's field by `Item.id`.
 */
export type Marks = Map<string, number>;

/** A source's lines with the offset each starts at, without their trailing comments. */
export function* lines(source: string): Generator<{ line: string; offset: number }> {
  let offset = 0;
  for (const raw of source.split('\n')) {
    yield { line: uncommented(raw.endsWith('\r') ? raw.slice(0, -1) : raw), offset };
    offset += raw.length + 1;
  }
}

/** The components a Contract file declares, in order. `marks` is given where each and its props are declared. */
export function parseComponents(source: string, marks?: Marks): ComponentInfo[] {
  const components: ComponentInfo[] = [];
  let current: ComponentInfo | null = null;
  let sectionIndent = -1;
  let section: string | null = null;
  let routes = false;
  for (const { line, offset } of lines(source)) {
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const text = line.trim();
    if (indent === 0) {
      if (/^routes\b/.test(text)) routes = true;
      const declared = /^component\s+([A-Za-z_]\w*)/.exec(text);
      const name = declared?.[1];
      current = name ? { name, props: [], inject: [], slot: false, root: false } : null;
      if (current) components.push(current);
      if (declared && name) marks?.set(name, offset + declared[0].length - name.length);
      sectionIndent = -1;
      section = null;
      continue;
    }
    if (!current) continue;
    if (sectionIndent < 0) sectionIndent = indent;
    if (indent === sectionIndent) {
      section = /^[A-Za-z_]\w*/.exec(text)?.[0] ?? null;
      if (section === 'slot') current.slot = true;
      // Only an app's root may own data, so a component that does is compiled as the app, never placed in one.
      if (section && DATA_SECTIONS.has(section)) current.root = true;
    } else if (section === 'props' || section === 'inject') {
      const field = /^([A-Za-z_]\w*)\s*:\s*(.+)$/.exec(text);
      if (field) {
        current[section].push({ name: field[1]!, type: field[2]!.trim() });
        marks?.set(`${current.name}.${field[1]}`, offset + indent);
      }
    }
  }
  // `routes` belongs to an app's root file, and its first component is that root.
  if (routes && components[0]) components[0].root = true;
  return components;
}

export const isAction = (field: Field) => field.type === 'action';

/** The enum members of `enum<"a", "b">`, or null for another type. */
export function enumMembers(type: string): string[] | null {
  return type.startsWith('enum<') ? [...type.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!) : null;
}

/** The declared names (shapes) a type mentions: `option<Item>` and `Item[]` mention `Item`. */
export function typeNames(type: string): string[] {
  const bare = type.replace(/"(?:[^"\\]|\\.)*"/g, '');
  return [...new Set([...bare.matchAll(/\b[A-Z]\w*\b/g)].map((m) => m[0]))];
}

/** What a prop shows when its story gives no arg: props have no defaults in Contract, and every one is required. */
export function defaultFor(type: string): unknown {
  const members = enumMembers(type);
  if (members) return members[0] ?? '';
  if (type === 'string' || type === 'color') return '';
  if (type === 'number') return 0;
  if (type === 'bool') return false;
  if (type.endsWith('[]')) return [];
  if (type.startsWith('option<')) return null;
  return undefined;
}

/** Each action prop's parameter types, as the compiler inferred them from what the component passes. */
export type Signatures = Record<string, string[]>;

export const argsSource = 'storyArgs';
export const actionSource = (prop: string) => `storyAction_${prop}`;
export const handlerName = (prop: string) => `on_${prop}`;

/**
 * What a handler's parameter is typed until the compiler has said what it is given: a shape of the wrapper's
 * own, which no argument is, so each refusal is about the first parameter still unknown.
 */
export const UNKNOWN = 'StoryUnknown';

/**
 * The app a story runs: a root that places the component, reads its value props (and what it injects) from
 * one resource, and sends each action prop's call to a mutation. Both cross Exact's data seam, where the
 * preview answers: an args change asks the resource again in the running app, with no rebuild.
 */
export function wrapperSource(component: ComponentInfo, specifier: string, signatures: Signatures = {}, boxed = false): string {
  const values = [...component.props.filter((p) => !isAction(p)), ...component.inject];
  const actions = component.props.filter(isAction);
  const used = new Set([component.name]);
  for (const field of values) for (const name of typeNames(field.type)) used.add(name);
  for (const types of Object.values(signatures)) for (const type of types) for (const name of typeNames(type)) used.add(name);
  const unknown = used.delete(UNKNOWN);

  const lines = ['// Generated by storybook-framework-exact; do not edit.', `use ${[...used].join(', ')} from "${specifier}"`, ''];
  if (values.length) lines.push('shape StoryArgs', ...values.map((p) => `  ${p.name}: ${p.type}`), '');
  if (actions.length) lines.push('shape StoryAck', '  ok: bool', '');
  if (unknown) lines.push(`shape ${UNKNOWN}`, '  storyUnknown: bool', '');
  lines.push('component Story');
  if (values.length) lines.push(`  resource args = ${argsSource}() as shape StoryArgs`);
  for (const a of actions) lines.push(`  mutation did_${a.name} as shape StoryAck`);
  if (component.inject.length) lines.push('  provide', ...component.inject.map((p) => `    ${p.name} = args.${p.name}`));
  for (const a of actions) {
    const types = signatures[a.name] ?? [];
    const parameters = types.map((type, i) => `a${i}: ${type}`).join(', ');
    lines.push(`  action ${handlerName(a.name)}${types.length ? `(${parameters})` : ''}`, `    send did_${a.name} = ${actionSource(a.name)}(${types.map((_, i) => `a${i}`).join(', ')})`);
  }
  const passed = component.props.map((p) => `${p.name}=${isAction(p) ? handlerName(p.name) : `args.${p.name}`}`).join(', ');
  // A component whose view starts with an `if`, `for` or `match` cannot be a view's root: it goes in a box.
  const indent = boxed ? '      ' : '    ';
  lines.push('  view', ...(boxed ? ['    column'] : []), `${indent}${component.name}(${passed})`);
  if (component.slot) lines.push(`${indent}  text "Slot content"`);
  return `${lines.join('\n')}\n`;
}

export interface Diagnostic {
  id: string;
  message: string;
  severity: string;
  file?: string;
  line?: number;
  col?: number;
}

/** The compiler's refusal of a view's root that is an `if`, `for` or `match`: the wrapper places the component in a box. */
export const needsBox = (errors: Diagnostic[]) => errors.some((error) => error.id === 'lower-root-region');

/**
 * One step of inferring the action props' signatures. An action prop is typed by what the component gives
 * it, which the source does not say, so the wrapper starts with handlers that take nothing and the compiler's
 * refusals say what each is given:
 *
 * - its count: `type-call-arity` where the component calls it (`changed(count)`), `analyze-action-arity`
 *   where it binds it to an event (`press=pick(item)`, `change=set`);
 * - then each type: `type-argument` for the first parameter a call site does not match, which is the first
 *   one still `UNKNOWN`, and `type-handler-payload` for what an event carries.
 *
 * Returns whether a refusal changed `signatures`; false means the errors are not about the handlers.
 */
export function refineSignatures(component: ComponentInfo, signatures: Signatures, errors: Diagnostic[]): boolean {
  let changed = false;
  // Each call site reports its own first mismatch, and they are all about the same parameter.
  const typed = new Set<string>();
  const actionProp = (handler: string | undefined) => {
    const prop = handler?.replace(/^on_/, '');
    return prop && component.props.some((p) => p.name === prop && isAction(p)) ? prop : null;
  };
  const sized = (prop: string, count: number) => {
    if (signatures[prop]?.length === count) return;
    signatures[prop] = Array.from({ length: count }, () => UNKNOWN);
    changed = true;
  };
  for (const error of errors) {
    if (error.id === 'type-call-arity') {
      const match = /`(\w+)` takes \d+ argument\(s\), given (\d+)/.exec(error.message);
      const prop = actionProp(match?.[1]);
      if (prop) sized(prop, Number(match![2]));
    } else if (error.id === 'analyze-action-arity') {
      // "requires 1 (or 2, the last its `MouseEvent`) action parameter(s), but this binding to `on_pick` supplies 0"
      const match = /requires (\d+)\b.*? action parameter\(s\), but this binding to `(\w+)`/.exec(error.message);
      const prop = actionProp(match?.[2]);
      if (prop) sized(prop, Number(match![1]));
    } else if (error.id === 'type-argument') {
      const match = /`(\w+)` expects `([^`]+)`, given `([^`]+)`/.exec(error.message);
      const prop = actionProp(match?.[1]);
      const at = prop && match![2] === UNKNOWN && !typed.has(prop) ? (signatures[prop]?.indexOf(UNKNOWN) ?? -1) : -1;
      if (prop && at >= 0) {
        signatures[prop]![at] = match![3]!;
        typed.add(prop);
        changed = true;
      }
    } else if (error.id === 'type-handler-payload') {
      // "declare `a0: bool` in `on_set`"
      const match = /declare `a(\d+): ([^`]+)` in `(\w+)`/.exec(error.message);
      const prop = actionProp(match?.[3]);
      const at = Number(match?.[1]);
      if (prop && signatures[prop] && at < signatures[prop].length && signatures[prop][at] !== match![2]) {
        signatures[prop][at] = match![2]!;
        changed = true;
      }
    }
  }
  return changed;
}

import { execFile } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it } from 'vitest';

import {
  type Diagnostic,
  type Signatures,
  defaultFor,
  enumMembers,
  needsBox,
  parseComponents,
  refineSignatures,
  typeNames,
  UNKNOWN,
  wrapperSource,
} from '../src/node/contract.ts';
import { builtCompilers } from '../src/node/toolchain.ts';
import type { ComponentInfo } from '../src/types.ts';

const exec = promisify(execFile);
const app = join(import.meta.dirname, '../examples/basic/app');
const example = (name: string) => readFileSync(join(app, `${name}.contract`), 'utf8');

/** A component with every kind of prop, the shape it uses, and an action called with three types. */
const PICKER = `shape Item
  id: string
  label: string

component Picker
  props
    items: Item[]
    selected: option<Item>
    size: enum<"small", "large">
    picked: action
  state open = false
  action choose(item: Item)
    open = false
    picked(item.id, open, item)
  view
    column gap=4
      for i in items key=i.id
        button press=choose(i)
          text i.label
`;

describe('parseComponents', () => {
  it('takes the first component of a file with routes for a root', () => {
    const [nav, other] = parseComponents('routes nav\n  tab home "/"\n\ncomponent Nav\n  view\n    text "nav"\n\ncomponent Other\n  view\n    text "other"\n');
    expect(nav).toMatchObject({ name: 'Nav', root: true });
    expect(other).toMatchObject({ name: 'Other', root: false });
  });

  it('reads the example Button: its props in order, its action, no slot, no data', () => {
    expect(parseComponents(example('button'))).toEqual([
      {
        name: 'Button',
        props: [
          { name: 'label', type: 'string' },
          { name: 'tone', type: 'enum<"primary", "secondary">' },
          { name: 'disabled', type: 'bool' },
          { name: 'press', type: 'action' },
        ],
        inject: [],
        slot: false,
        root: false,
      },
    ]);
  });

  it('marks a component with a slot', () => {
    const [card] = parseComponents(example('card'));
    expect(card).toMatchObject({ name: 'Card', slot: true, root: false });
    expect(card!.props.map((p) => p.name)).toEqual(['title', 'elevated']);
  });

  it('reads view lines as nothing: a `text` with a colon in its template is not a prop', () => {
    const [counter] = parseComponents(example('counter'));
    expect(counter!.props).toEqual([
      { name: 'start', type: 'number' },
      { name: 'step', type: 'number' },
      { name: 'changed', type: 'action' },
    ]);
  });

  it('marks a component that owns data as a root, and skips the shapes before it', () => {
    const components = parseComponents(example('todos'));
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ name: 'Todos', props: [], root: true });
  });

  it('treats `resource`, `mutation` and `task` each as owning data, and `state` as not', () => {
    for (const section of ['resource items = items() as shape Item[]', 'mutation saved as shape Ok', 'task tick = ticker()']) {
      expect(parseComponents(`component A\n  ${section}\n  view\n    text "a"\n`)[0]!.root).toBe(true);
    }
    expect(parseComponents('component A\n  state n = 0\n  view\n    text "a"\n')[0]!.root).toBe(false);
  });

  it('reads `inject` apart from `props`', () => {
    const source = `component Badge
  props
    label: string
  inject
    theme: enum<"light", "dark">
    user: option<User>
  view
    text label
`;
    expect(parseComponents(source)[0]).toMatchObject({
      props: [{ name: 'label', type: 'string' }],
      inject: [
        { name: 'theme', type: 'enum<"light", "dark">' },
        { name: 'user', type: 'option<User>' },
      ],
    });
  });

  it('reads every component of a file, in order, whatever the section indent', () => {
    const source = `component First
    props
        a: string
    view
        text a

component Second
  props
    b: number
  view
    text "b"
`;
    expect(parseComponents(source).map((c) => [c.name, c.props])).toEqual([
      ['First', [{ name: 'a', type: 'string' }]],
      ['Second', [{ name: 'b', type: 'number' }]],
    ]);
  });

  it('drops comments, but keeps `//` inside a string', () => {
    const source = `// A link
component Link // the component
  props
    href: string // where it goes
    // label: string
    tone: enum<"https://a//b", "plain">
  view
    text href
`;
    expect(parseComponents(source)[0]!.props).toEqual([
      { name: 'href', type: 'string' },
      { name: 'tone', type: 'enum<"https://a//b", "plain">' },
    ]);
  });

  it('reads CRLF sources', () => {
    expect(parseComponents(example('button').replace(/\n/g, '\r\n'))[0]!.props.map((p) => p.type)).toEqual([
      'string',
      'enum<"primary", "secondary">',
      'bool',
      'action',
    ]);
  });

  it('finds nothing in a file of shapes', () => {
    expect(parseComponents('shape Item\n  id: string\n')).toEqual([]);
  });
});

describe('enumMembers', () => {
  it('lists an enum’s members in order', () => {
    expect(enumMembers('enum<"primary", "secondary">')).toEqual(['primary', 'secondary']);
  });

  it('keeps escaped quotes in a member', () => {
    expect(enumMembers('enum<"say \\"hi\\"", "b">')).toEqual(['say \\"hi\\"', 'b']);
  });

  it('is null for any other type', () => {
    expect(enumMembers('string')).toBeNull();
    expect(enumMembers('option<enum<"a">>')).toBeNull();
  });
});

describe('typeNames', () => {
  it('names the shapes a type mentions, once each', () => {
    expect(typeNames('Item')).toEqual(['Item']);
    expect(typeNames('Item[]')).toEqual(['Item']);
    expect(typeNames('option<Item>')).toEqual(['Item']);
    expect(typeNames('map<Key, Item[]>')).toEqual(['Key', 'Item']);
    expect(typeNames('pair<Item, Item>')).toEqual(['Item']);
  });

  it('names nothing for builtins, or for capitalised words inside enum members', () => {
    expect(typeNames('string')).toEqual([]);
    expect(typeNames('option<number>')).toEqual([]);
    expect(typeNames('enum<"Primary", "Secondary">')).toEqual([]);
  });
});

describe('defaultFor', () => {
  it('gives each value type a stand-in', () => {
    expect(defaultFor('string')).toBe('');
    expect(defaultFor('color')).toBe('');
    expect(defaultFor('number')).toBe(0);
    expect(defaultFor('bool')).toBe(false);
    expect(defaultFor('enum<"small", "large">')).toBe('small');
    expect(defaultFor('Item[]')).toEqual([]);
    expect(defaultFor('option<Item>')).toBeNull();
    expect(defaultFor('option<string>')).toBeNull();
  });

  it('gives a list of options a list, not none', () => {
    expect(defaultFor('option<Item>[]')).toEqual([]);
  });

  it('has nothing for a record or an action: a story must give one', () => {
    expect(defaultFor('Item')).toBeUndefined();
    expect(defaultFor('action')).toBeUndefined();
  });

  it('returns a fresh list each time, so one story’s default is not another’s', () => {
    expect(defaultFor('Item[]')).not.toBe(defaultFor('Item[]'));
  });
});

describe('wrapperSource', () => {
  it('places a component with values and an action in a root that reads one resource', () => {
    const [button] = parseComponents(example('button'));
    expect(wrapperSource(button!, './button.contract')).toBe(`// Generated by storybook-framework-exact; do not edit.
use Button from "./button.contract"

shape StoryArgs
  label: string
  tone: enum<"primary", "secondary">
  disabled: bool

shape StoryAck
  ok: bool

component Story
  resource args = storyArgs() as shape StoryArgs
  mutation did_press as shape StoryAck
  action on_press
    send did_press = storyAction_press()
  view
    Button(label=args.label, tone=args.tone, disabled=args.disabled, press=on_press)
`);
  });

  it('gives a handler the inferred parameters and forwards them', () => {
    const [counter] = parseComponents(example('counter'));
    const source = wrapperSource(counter!, './counter.contract', { changed: ['number'] });
    expect(source).toContain('  action on_changed(a0: number)\n    send did_changed = storyAction_changed(a0)\n');
  });

  it('imports the shapes the props and the signatures mention', () => {
    const [picker] = parseComponents(PICKER);
    const source = wrapperSource(picker!, './picker.contract', { picked: ['string', 'bool', 'Choice'] });
    expect(source.split('\n')[1]).toBe('use Picker, Item, Choice from "./picker.contract"');
  });

  it('provides what the component injects from the args', () => {
    const source = wrapperSource(
      { name: 'Badge', props: [{ name: 'label', type: 'string' }], inject: [{ name: 'theme', type: 'enum<"light", "dark">' }], slot: false, root: false },
      './badge.contract'
    );
    expect(source).toContain('shape StoryArgs\n  label: string\n  theme: enum<"light", "dark">\n');
    expect(source).toContain('  provide\n    theme = args.theme\n');
    // An injected value is not a prop: the component is not passed it.
    expect(source).toContain('    Badge(label=args.label)\n');
  });

  it('fills a slot', () => {
    const [card] = parseComponents(example('card'));
    expect(wrapperSource(card!, './card.contract')).toMatch(/ {4}Card\(title=args\.title, elevated=args\.elevated\)\n {6}text "Slot content"\n$/);
  });

  it('places the component in a box when asked', () => {
    const [card] = parseComponents(example('card'));
    expect(wrapperSource(card!, './card.contract', {}, true)).toMatch(/ {2}view\n {4}column\n {6}Card\(title=args\.title, elevated=args\.elevated\)\n {8}text "Slot content"\n$/);
  });

  it('writes no resource, shape or mutation for a component with no props', () => {
    const source = wrapperSource({ name: 'Logo', props: [], inject: [], slot: false, root: false }, './logo.contract');
    expect(source).not.toMatch(/resource|mutation|shape/);
    expect(source).toContain('    Logo()\n');
  });
});

describe('refineSignatures', () => {
  const [counter] = parseComponents(example('counter'));
  const [picker] = parseComponents(PICKER);
  const error = (id: string, message: string): Diagnostic => ({ id, message, severity: 'error' });

  it('learns the arity, with each parameter unknown', () => {
    const signatures: Signatures = {};
    expect(refineSignatures(counter!, signatures, [error('type-call-arity', '`on_changed` takes 0 argument(s), given 1')])).toBe(true);
    expect(signatures).toEqual({ changed: [UNKNOWN] });
  });

  it('replaces an unknown parameter with the type given', () => {
    const signatures: Signatures = { changed: [UNKNOWN] };
    expect(refineSignatures(counter!, signatures, [error('type-argument', `\`on_changed\` expects \`${UNKNOWN}\`, given \`number\``)])).toBe(true);
    expect(signatures).toEqual({ changed: ['number'] });
  });

  it('refines each parameter in turn, a string before another type included', () => {
    // `picked(item.id, open, item)`
    const signatures: Signatures = {};
    refineSignatures(picker!, signatures, [error('type-call-arity', '`on_picked` takes 0 argument(s), given 3')]);
    for (const given of ['string', 'bool', 'Item']) {
      refineSignatures(picker!, signatures, [error('type-argument', `\`on_picked\` expects \`${UNKNOWN}\`, given \`${given}\``)]);
    }
    expect(signatures).toEqual({ picked: ['string', 'bool', 'Item'] });
  });

  it('takes one type a round for a prop: every call site reports the same parameter', () => {
    // `changed(draft, ok, picked)` in three actions.
    const signatures: Signatures = { picked: ['string', UNKNOWN, UNKNOWN] };
    const mismatch = error('type-argument', `\`on_picked\` expects \`${UNKNOWN}\`, given \`bool\``);
    expect(refineSignatures(picker!, signatures, [mismatch, mismatch, mismatch])).toBe(true);
    expect(signatures).toEqual({ picked: ['string', 'bool', UNKNOWN] });
  });

  it('learns the arity of a prop bound to an event, and what the event carries', () => {
    // `press=picked(i)` and `change=picked`
    const signatures: Signatures = {};
    const bound = error('analyze-action-arity', '`Picker.picked` requires 1 (or 2, the last its `InputEvent`) action parameter(s), but this binding to `on_picked` supplies 0 of its 0');
    expect(refineSignatures(picker!, signatures, [bound])).toBe(true);
    expect(signatures).toEqual({ picked: [UNKNOWN] });
    expect(refineSignatures(picker!, signatures, [error('type-handler-payload', 'declare `a0: bool` in `on_picked`: a `change` here carries a `bool`')])).toBe(true);
    expect(signatures).toEqual({ picked: ['bool'] });
    // The same refusals again change nothing: they are then the component's own.
    expect(refineSignatures(picker!, signatures, [error('type-handler-payload', 'declare `a0: bool` in `on_picked`')])).toBe(false);
  });

  it('leaves a parameter the compiler already typed', () => {
    // Two call sites that pass different types: the handler cannot satisfy both, and that is the component's error.
    const signatures: Signatures = { changed: ['number'] };
    expect(refineSignatures(counter!, signatures, [error('type-argument', '`on_changed` expects `number`, given `string`')])).toBe(false);
    expect(signatures).toEqual({ changed: ['number'] });
  });

  it('ignores errors that are not about a handler', () => {
    const signatures: Signatures = {};
    const errors = [
      error('type-argument', '`format` expects `string`, given `number`'),
      error('type-call-arity', '`on_nope` takes 0 argument(s), given 1'),
      error('parse', 'unexpected token'),
    ];
    expect(refineSignatures(counter!, signatures, errors)).toBe(false);
    expect(signatures).toEqual({});
  });

  it('ignores a type error for a handler whose arity is not known yet', () => {
    const signatures: Signatures = {};
    expect(refineSignatures(counter!, signatures, [error('type-argument', `\`on_changed\` expects \`${UNKNOWN}\`, given \`number\``)])).toBe(false);
  });

  it('ignores a prop of the same name that is not an action', () => {
    const signatures: Signatures = {};
    expect(refineSignatures(counter!, signatures, [error('type-call-arity', '`on_start` takes 0 argument(s), given 1')])).toBe(false);
  });
});

// The wrappers compiled by the real compiler, where a checkout is at hand.
const contract = process.env.EXACT_ROOT ? (builtCompilers(join(process.env.EXACT_ROOT, 'target'), false)?.contract ?? null) : null;

describe.skipIf(!contract)('wrappers compile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sb-exact-wrapper-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const build = (file: string) =>
    exec(contract!, ['build', '--json', file]).then(
      (ok) => ({ ok: true, diagnostics: JSON.parse(ok.stdout || '[]') as Diagnostic[] }),
      (failed: { stdout?: string }) => ({ ok: false, diagnostics: JSON.parse(failed.stdout || '[]') as Diagnostic[] })
    );

  /** What `Builder.inferSignatures` does, against the real compiler. */
  async function infer(component: ComponentInfo, specifier: string) {
    const signatures: Signatures = {};
    let boxed = false;
    const wrapper = join(dir, `__story_${component.name}.contract`);
    for (let attempt = 0; attempt < 16; attempt++) {
      writeFileSync(wrapper, wrapperSource(component, specifier, signatures, boxed));
      const { ok, diagnostics } = await build(wrapper);
      if (ok) return { signatures, ok, ...(boxed ? { boxed } : {}) };
      const errors = diagnostics.filter((d) => d.severity === 'error');
      const refined = refineSignatures(component, signatures, errors);
      const box = !boxed && needsBox(errors);
      if (box) boxed = true;
      if (!refined && !box) return { signatures, ok, diagnostics };
    }
    return { signatures, ok: false };
  }

  const EVENTS = `shape Item
  id: string
  done: bool

component Events
  props
    items: Item[]
    on: bool
    pick: action
    set: action
    changed: action
  state draft = ""
  action edit(v: string)
    draft = v
    changed(draft, on)
  action clear
    draft = ""
    changed(draft, on)
  view
    column
      for i in items key=i.id
        button press=pick(i)
          text i.id
      input type="checkbox" checked=on change=set aria-label="On"
      input value=draft input=edit aria-label="Draft"
      button press=clear
        text "Clear"
`;

  it('with action props bound to events, and one called from two actions', async () => {
    writeFileSync(join(dir, 'events.contract'), EVENTS);
    const [events] = parseComponents(EVENTS);
    expect(await infer(events!, './events.contract')).toEqual({ ok: true, signatures: { pick: ['Item'], set: ['bool'], changed: ['string', 'bool'] } });
  });

  it('with a view that starts with an `if`, in a box', async () => {
    const source = 'component Maybe\n  props\n    shown: bool\n  view\n    if shown\n      text "here"\n';
    writeFileSync(join(dir, 'maybe.contract'), source);
    const [maybe] = parseComponents(source);
    expect(await infer(maybe!, './maybe.contract')).toEqual({ ok: true, signatures: {}, boxed: true });
  });

  for (const name of ['button', 'card', 'counter']) {
    it(`for the example ${name}`, async () => {
      copyFileSync(join(app, `${name}.contract`), join(dir, `${name}.contract`));
      const [component] = parseComponents(example(name));
      expect(await infer(component!, `./${name}.contract`)).toMatchObject({ ok: true });
    });
  }

  it('with the action’s parameter inferred as a number', async () => {
    copyFileSync(join(app, 'counter.contract'), join(dir, 'counter.contract'));
    const [counter] = parseComponents(example('counter'));
    expect(await infer(counter!, './counter.contract')).toEqual({ ok: true, signatures: { changed: ['number'] } });
  });

  it('with a shape, an option, an enum and a three-parameter action', async () => {
    writeFileSync(join(dir, 'picker.contract'), PICKER.replace('picked(item.id, open, item)', 'picked(open, 2, item)'));
    const [picker] = parseComponents(PICKER);
    expect(await infer(picker!, './picker.contract')).toEqual({ ok: true, signatures: { picked: ['bool', 'number', 'Item'] } });
  });

  it('with a string argument before a non-string one', async () => {
    writeFileSync(join(dir, 'picker.contract'), PICKER);
    const [picker] = parseComponents(PICKER);
    expect(await infer(picker!, './picker.contract')).toEqual({ ok: true, signatures: { picked: ['string', 'bool', 'Item'] } });
  });
});

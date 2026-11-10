# storybook-framework-exact

A community [Storybook](https://storybook.js.org) framework for [Exact](https://github.com/expo/exact), Expo's cross-platform runtime. It lets you write stories for components written in Contract (`.contract` files) and see them on Exact's web target, with Controls, Actions, play functions, docs and hot reload.

[![The example Storybook: controls, actions, a play function, a component with mocked data, a docs page and hot reload](docs/demo.gif)](docs/demo.mp4)

```ts
// button.stories.ts
import type { Meta, StoryObj } from 'storybook-framework-exact';

import { Button } from './button.contract';

const meta = {
  component: Button,
  args: { label: 'Hello Exact', tone: 'primary', disabled: false },
} satisfies Meta<typeof Button>;
export default meta;

export const Primary: StoryObj<typeof Button> = {};
export const Secondary: StoryObj<typeof Button> = { args: { tone: 'secondary' } };
```

> [!WARNING]
> Experimental. Exact is pre-1.0, changes daily and has no published package, so this framework builds one pinned commit of it from source and relies on some of its internals. It is not affiliated with Expo.

## Requirements

- Node 20.19 or newer, and Storybook 10 with Vite.
- What Exact itself needs to build: [Rust](https://rustup.rs) (through rustup, which installs the toolchain Exact pins) and `git`.
- macOS or Linux. Windows is untested.

Exact also needs a specific Bun. If the `bun` on your PATH is older than the one Exact pins, the framework downloads the pinned one into its cache and leaves yours alone.

## Install

Until it is on npm, install it from GitHub:

```sh
npm install -D github:dannyhw/storybook-framework-exact storybook vite
```

```ts
// .storybook/main.ts
import type { StorybookConfig } from 'storybook-framework-exact';

const config: StorybookConfig = {
  framework: 'storybook-framework-exact',
  stories: ['../app/**/*.stories.ts'],
};

export default config;
```

For typed `.contract` imports, add this to `tsconfig.json`:

```json
{ "compilerOptions": { "allowArbitraryExtensions": true } }
```

### Getting Exact

The first `storybook dev` or `storybook build` fetches Exact from GitHub at the commit this version was tested against, installs its JavaScript dependencies and builds its Contract compiler with Cargo. That happens once per machine and took about a minute on an M-series Mac with a warm Cargo cache; a cold one takes a few minutes. Everything goes into `~/.cache/storybook-framework-exact` (about 3 GB, most of it Cargo's build output), never into your project.

To do it ahead of time, in CI for example:

```sh
npx storybook-exact setup
```

To use an Exact checkout you already have, set `exactRoot` (or the `EXACT_ROOT` environment variable). It is used as it is; a checkout far from the pinned commit may not work.

```ts
framework: { name: 'storybook-framework-exact', options: { exactRoot: '../exact' } },
```

| Option | Environment | What it does |
|---|---|---|
| `exactRoot` | `EXACT_ROOT` | Use this Exact checkout instead of the managed one |
| `exactCommit` | `EXACT_COMMIT` | Fetch another commit of `expo/exact` for the managed checkout |
| `typegen` | | Write `<name>.d.contract.ts` beside imported Contract files (default `true`) |
| | `STORYBOOK_EXACT_CACHE` | Where the managed checkout and Bun are kept |
| | `BUN` | The Bun to run Exact's build scripts with |

## Writing stories

### A component's props are its args

Import a component from its `.contract` file and set it as `component`. Its `props` become args, with a control for each: text for `string`, a number field for `number`, a toggle for `bool`, a select for `enum<"a", "b">`, a colour picker for `color`, and an object editor for shapes and lists.

```contract
component Button
  props
    label: string
    tone: enum<"primary", "secondary">
    disabled: bool
    press: action
  view
    button press=press disabled=disabled
      text label
```

Contract props have no defaults and every one is required. An arg a story leaves out gets a stand-in for its type (`""`, `0`, `false`, an enum's first member, an empty list, `none`).

Changing an arg does not rebuild or remount the component: the running app is asked for its args again, so state the component owns (a counter's count, a field's draft) survives the change.

### Action props

A prop of type `action` shows in the Actions panel when the component calls it, with the values it passed. Give it a spy to assert on it in a play function:

```ts
import { expect, fn } from 'storybook/test';

export const Pressed: StoryObj<typeof Button> = {
  args: { press: fn() },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button'));
    await expect(args.press).toHaveBeenCalledOnce();
  },
};
```

### Components that own data

In Contract only an app's root component may declare a `resource`, `mutation` or `task`; everything else takes data through props. A story for a root component answers its sources, where the app's `app.ts` or Rust module would:

```ts
import { Todos } from './todos.contract';

export const Seeded: StoryObj<typeof Todos> = {
  parameters: {
    exact: {
      sources: {
        todos: () => [{ id: '1', title: 'Buy milk', done: false }],
        addTodo: (title: string) => ({ count: 2 }),
      },
    },
  },
};
```

A source gets the arguments the component passed and returns plain values (objects for shapes, arrays for lists, `null` for `none`), or a promise of them. Its answer is checked against the shape the component declared, as Exact checks a real source's. A root component must be the first component in its file.

### Injected values and slots

A value a component takes with `inject` is an arg too; the story provides it.

A component with a `slot` is shown with a line of placeholder text as its children. To show it with real children, write a small Contract component that fills the slot and write the story for that one.

### Types

The framework writes `<name>.d.contract.ts` beside each Contract file a story imports. It declares the file's components with their args, and its shapes, so `Meta<typeof Button>` checks a story's args and a source mock can be typed with the component's own shapes. Commit these files or ignore them (`*.d.contract.ts`); to write them without starting Storybook, before `tsc` in CI for example:

```sh
npx storybook-exact types app
```

## How it works

Exact compiles a whole app, and its web runtime mounts one app per page. So a story is a small app:

1. Importing a `.contract` file gives a description of each component, read from its source.
2. When a story first renders, the component is built. A component with props gets a generated root that places it, reads its value props from one `resource` and sends each action prop's call to a `mutation`; a root component is built as it is. Exact's own web build compiles it.
3. The preview imports the build into the canvas and answers Exact's data seam: the args resource from the story's args, the action mutations to the story's handlers, and any other source from `parameters.exact.sources`.

Builds happen in a copy of your app's Contract sources kept under `node_modules/.cache`, so nothing is generated into your source tree except the optional type declarations, and your app's own `app.ts`, Rust module and native modules are not part of a story.

## Limitations

- **One story per document.** Exact's runtime cannot be unmounted, and it mounts into a fixed element. Docs pages therefore show each story in its own iframe (`docs.story.inline` is `false` by default; turning it on breaks pages with more than one story). Switching stories loads a fresh copy of the runtime, and the previous copy is not disposed until the preview reloads.
- **Decorators cannot wrap markup.** A story renders an Exact app, not DOM you return. A decorator can change args and parameters; to wrap a component, wrap it in Contract.
- **Assets.** Images and fonts in the app's `assets/` folder are available to the build; serve them to the preview with Storybook's `staticDirs`, for example `staticDirs: [{ from: '../app/assets', to: '/assets' }]`.
- **Native modules, the app's TypeScript and Rust data modules, and routes into other apps** are not part of a story.
- **Web only.** Stories show Exact's web target, not its native hosts.
- **Exact's version is pinned.** Moving to a newer Exact means a new release of this framework.

## Developing this repository

```sh
npm install
npm run build            # tsc into dist/
npm test                 # unit tests
npm run example          # the example Storybook, on port 6116
npm run e2e              # browser tests against the example
```

`examples/basic` is an npm workspace that uses the framework from the repository root.

The walkthrough at the top of this page is recorded from the running example, so it shows what the code does today. To record it again, with `npm run example` running:

```sh
npx playwright-core install ffmpeg   # once
node scripts/record-demo.mjs         # writes docs/demo.mp4 and docs/demo.gif
```

## License

MIT

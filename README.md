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

A prop of type `action` shows in the Actions panel when the component calls it, with the values it passed. That holds however the component uses it: called from one of its own actions (`changed(count)`), or bound to an event (`press=pick(item)`, `change=set`). Give it a spy to assert on it in a play function:

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

A source gets the arguments the component passed and returns plain values (objects for shapes, arrays for lists, `null` for `none`), or a promise of them. Its answer is checked against the shape the component declared, and an answer that does not fit is refused with the field's name (`loadProfile.name should be a string, and is 42`). A root component must be the first component in its file.

A file with `routes` is a root too, and its first component is shown as the app. The canvas's own address is not one of the app's routes, so it starts on its `notfound` route; navigating from there works.

A root that fills its window (`height="100%"`) fills the canvas.

### Injected values and slots

A value a component takes with `inject` is an arg too; the story provides it.

A component with a `slot` is shown with a line of placeholder text as its children. To show it with real children, write a small Contract component that fills the slot and write the story for that one.

### Libraries

A package that exports Contract (`"exports": { ".": "./index.contract" }` in its `package.json`) is a library, and a story for one of its components can sit beside it. The component is built as the library's users get it, by the package's name, which is what gives it the tokens in the package's `.tamber`. So a story can only show a component the package exports.

```ts
// packages/chips/chip.stories.ts
import { Chip } from './chip.contract';

export default { component: Chip, args: { label: 'Dark mode', selected: false } };
export const Off = {};
```

### Images and fonts

Files in the app's `assets/` folder are served to the canvas and included in a static build, so `image "assets/photo.png"` and `font "Brand" = "assets/brand.ttf"` work as they do in the app. When two apps in one Storybook have an asset of the same name, the first one loaded wins.

### Types

The framework writes `<name>.d.contract.ts` beside each Contract file a story imports. It declares the file's components with their args, and its shapes, so `Meta<typeof Button>` checks a story's args and a source mock can be typed with the component's own shapes. Commit these files or ignore them (`*.d.contract.ts`); to write them without starting Storybook, before `tsc` in CI for example:

```sh
npx storybook-exact types app
```

## How it works

Exact compiles a whole app, and its web runtime mounts one app per page. So a story is a small app:

1. Importing a `.contract` file gives a description of each component, read from its source.
2. When a story first renders, the component is built. A component with props gets a generated root that places it, reads its value props from one `resource` and sends each action prop's call to a `mutation`; a root component is built as it is. What each action prop is given is not in the source, so the generated root is compiled until Exact's compiler has said. Exact's own web build compiles the result.
3. The preview imports the build into the canvas and answers Exact's data seam: the args resource from the story's args, the action mutations to the story's handlers, and any other source from `parameters.exact.sources`.

Builds happen in a copy of your app's Contract sources and assets kept under `node_modules/.cache`, so nothing is generated into your source tree except the optional type declarations, and your app's own `app.ts`, Rust module and native modules are not part of a story. A library is not copied: the build is an empty app that depends on it.

## Limitations

- **One story per document.** Exact's runtime cannot be unmounted, and it mounts into a fixed element. Docs pages therefore show each story in its own iframe (`docs.story.inline` is `false` by default; turning it on breaks pages with more than one story). Switching stories loads a fresh copy of the runtime, and the previous copy is not disposed until the preview reloads.
- **Docs pages.** A story's iframe has Storybook's default height (100px); set `parameters.docs.story.height` for a taller component. The controls on a docs page do not reach the stories, and "Show code" is empty.
- **Decorators cannot wrap markup.** A story renders an Exact app, not DOM you return. A decorator can change args and parameters; to wrap a component, wrap it in Contract.
- **A component that needs a parent or children.** A row made for a `list`, or a card whose slot is its content, is shown on its own, with a line of placeholder text in its slot. Write a small Contract component that places it as you want it seen, and write the story for that.
- **`option<T>` in Controls.** A control cannot set an optional value back to `none`; reset the controls, or give the story `null`.
- **Dark mode.** Exact follows the browser's colour scheme. Storybook's background tool changes the canvas's background, not the scheme.
- **One component that does not compile fails a static build.** `storybook dev` shows the error in that component's stories and runs the rest.
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

`examples/basic` is an npm workspace that uses the framework from the repository root: an app (`app/`) and a small library (`lib/chips`).

The walkthrough at the top of this page is recorded from the running example, so it shows what the code does today. To record it again, with `npm run example` running:

```sh
npx playwright-core install ffmpeg   # once
node scripts/record-demo.mjs         # writes docs/demo.mp4 and docs/demo.gif
```

## License

MIT

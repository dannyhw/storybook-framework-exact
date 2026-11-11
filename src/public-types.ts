import type {
  Args,
  ComponentAnnotations,
  DecoratorFunction,
  LoaderFunction,
  ProjectAnnotations,
  StoryAnnotations,
  StoryContext as StoryContextBase,
  StorybookConfig as StorybookConfigBase,
  StrictArgs,
  WebRenderer,
} from 'storybook/internal/types';
import type { BuilderOptions, StorybookConfigVite } from '@storybook/builder-vite';

import type { ToolchainOptions } from './node/toolchain.ts';
import type { ExactComponent, ExactParameters, ExactStoryResult } from './types.ts';

export type { Args, ArgTypes, Parameters, StrictArgs } from 'storybook/internal/types';

export interface ExactRenderer extends WebRenderer {
  component: ExactComponent;
  storyResult: ExactStoryResult;
}

type ArgsOf<T> = T extends ExactComponent<infer TArgs> ? TArgs : T;
type ExactAnnotations = { parameters?: ExactParameters & Record<string, any> };

/**
 * Metadata to configure the stories for a component: `Meta<typeof Button>` checks args against the
 * component's props, `Meta<{ label: string }>` against the args you name.
 */
export type Meta<TComponentOrArgs = Args> = ComponentAnnotations<ExactRenderer, ArgsOf<TComponentOrArgs>> & ExactAnnotations;

/** A story of a Contract component: `StoryObj<typeof Button>`. Args the meta gives may be left out. */
export type StoryObj<TComponentOrArgs = Args> = StoryAnnotations<ExactRenderer, ArgsOf<TComponentOrArgs>, Partial<ArgsOf<TComponentOrArgs>>> & ExactAnnotations;

export type Decorator<TArgs = StrictArgs> = DecoratorFunction<ExactRenderer, TArgs>;
export type Loader<TArgs = StrictArgs> = LoaderFunction<ExactRenderer, TArgs>;
export type StoryContext<TArgs = StrictArgs> = StoryContextBase<ExactRenderer, TArgs>;
export type Preview = ProjectAnnotations<ExactRenderer>;

export interface FrameworkOptions extends ToolchainOptions {
  builder?: BuilderOptions;
  /**
   * Write `<name>.d.contract.ts` beside each imported Contract file, for a TypeScript older than 7.1 (with
   * `allowArbitraryExtensions` in tsconfig.json). TypeScript 7.1 needs no files: name this package under
   * `contentMappers` in tsconfig.json. Default false.
   */
  typegen?: boolean;
}

type FrameworkName = 'storybook-framework-exact';

/** The interface for Storybook configuration in `main.ts` files. */
export type StorybookConfig = Omit<StorybookConfigBase, 'framework'> &
  StorybookConfigVite & {
    framework: FrameworkName | { name: FrameworkName; options: FrameworkOptions };
  };

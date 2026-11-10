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

/** Metadata to configure the stories for a component. */
export type Meta<TArgs = Args> = ComponentAnnotations<ExactRenderer, TArgs> & { parameters?: ExactParameters & Record<string, any> };

/** A story of a Contract component. */
export type StoryObj<TArgs = Args> = StoryAnnotations<ExactRenderer, TArgs> & { parameters?: ExactParameters & Record<string, any> };

export type Decorator<TArgs = StrictArgs> = DecoratorFunction<ExactRenderer, TArgs>;
export type Loader<TArgs = StrictArgs> = LoaderFunction<ExactRenderer, TArgs>;
export type StoryContext<TArgs = StrictArgs> = StoryContextBase<ExactRenderer, TArgs>;
export type Preview = ProjectAnnotations<ExactRenderer>;

export interface FrameworkOptions extends ToolchainOptions {
  builder?: BuilderOptions;
}

type FrameworkName = 'storybook-framework-exact';

/** The interface for Storybook configuration in `main.ts` files. */
export type StorybookConfig = Omit<StorybookConfigBase, 'framework'> &
  StorybookConfigVite & {
    framework: FrameworkName | { name: FrameworkName; options: FrameworkOptions };
  };

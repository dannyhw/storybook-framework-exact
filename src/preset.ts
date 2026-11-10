import { fileURLToPath } from 'node:url';

import { logger } from 'storybook/internal/node-logger';
import type { PresetProperty } from 'storybook/internal/types';

import { exact } from './node/vite-plugin.ts';
import type { FrameworkOptions, StorybookConfig } from './public-types.ts';

export const core: PresetProperty<'core'> = {
  builder: import.meta.resolve('@storybook/builder-vite'),
};

export const previewAnnotations: PresetProperty<'previewAnnotations'> = async (input = []) => [
  ...input,
  fileURLToPath(new URL('./preview/entry-preview.js', import.meta.url)),
];

export const viteFinal: NonNullable<StorybookConfig['viteFinal']> = async (config, options) => {
  const framework = await options.presets.apply('framework');
  const frameworkOptions: FrameworkOptions = typeof framework === 'string' ? {} : ((framework.options ?? {}) as FrameworkOptions);
  return {
    ...config,
    plugins: [...(config.plugins ?? []), exact({ ...frameworkOptions, log: (message) => logger.info(`exact: ${message}`) })],
  };
};

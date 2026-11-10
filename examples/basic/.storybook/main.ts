import type { StorybookConfig } from 'storybook-framework-exact';

const config: StorybookConfig = {
  framework: 'storybook-framework-exact',
  stories: ['../app/**/*.stories.ts', '../lib/**/*.stories.ts'],
  addons: ['@storybook/addon-docs'],
  core: { disableTelemetry: true },
};

export default config;

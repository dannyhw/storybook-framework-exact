import type { ArgTypesEnhancer } from 'storybook/internal/types';

import type { ExactRenderer } from '../public-types.ts';
import { enhanceArgTypes } from './arg-types.ts';

export { render, renderToCanvas } from './render.ts';

export const parameters = {
  renderer: 'exact',
  // Exact's runtime is one app per document, so a docs page shows each story in an iframe of its own.
  docs: { story: { inline: false } },
};

export const argTypesEnhancers: ArgTypesEnhancer<ExactRenderer>[] = [enhanceArgTypes];

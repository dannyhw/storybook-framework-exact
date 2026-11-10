// Add to a project with `/// <reference types="storybook-framework-exact/contract" />`
// or `"types": ["storybook-framework-exact/contract"]` in tsconfig.json.
declare module '*.contract' {
  import type { ExactComponent } from 'storybook-framework-exact';

  /** Every component the file declares, by name. */
  const components: { readonly [name: string]: ExactComponent };
  export = components;
}

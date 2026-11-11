// The loosest typing for a `.contract` import: every component by name, its args unchecked. For a project
// that neither registers the framework as a TypeScript content mapper (TypeScript 7.1: `contentMappers` in
// tsconfig.json) nor has it write `<name>.d.contract.ts` beside each file (`typegen`), both of which type
// each component's args.
//
// Use with `"types": ["storybook-framework-exact/contract"]` in tsconfig.json.
declare module '*.contract' {
  import type { ExactComponent } from 'storybook-framework-exact';

  /** Every component the file declares, by name. */
  const components: { readonly [name: string]: ExactComponent };
  export default components;
}

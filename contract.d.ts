// The fallback typing for a `.contract` import, for a project that turns the framework's `typegen` off.
// With typegen (the default) each Contract file gets a `<name>.d.contract.ts` beside it, which types its
// named exports and their args; TypeScript reads those with `allowArbitraryExtensions`.
//
// Use with `"types": ["storybook-framework-exact/contract"]` in tsconfig.json.
declare module '*.contract' {
  import type { ExactComponent } from 'storybook-framework-exact';

  /** Every component the file declares, by name. */
  const components: { readonly [name: string]: ExactComponent };
  export default components;
}

// Shared by the Node side (which writes them) and the preview (which reads them).

/** A prop or an injected value: its name and its Contract type as written (`string`, `enum<"a", "b">`, `Item[]`, `action`). */
export interface Field {
  name: string;
  type: string;
}

/** What the framework reads of a component from its Contract source. */
export interface ComponentInfo {
  name: string;
  props: Field[];
  /** Values the component takes from an ancestor's `provide`. A story gives them as args. */
  inject: Field[];
  /** Whether it wraps caller-authored children. */
  slot: boolean;
  /** Whether it owns data (`resource`, `mutation` or `task`): it is then an app's root, and a story answers its sources. */
  root: boolean;
}

/**
 * A component imported from a `.contract` file: `import { Button } from './button.contract'`.
 * Set it as a story's `component`.
 */
export interface ExactComponent extends ComponentInfo {
  __exact: true;
  /** Unique among the project's components: the name and a digest of its file's path. */
  id: string;
  /** Its file, relative to the app directory. */
  file: string;
  /** Each value prop's stand-in when a story gives no arg, by name. */
  defaults: Record<string, unknown>;
  /** Where the preview asks for its build, relative to the page. */
  manifest: string;
  /** Changes when any Contract source of the app does. */
  revision: string;
}

/** A type as Exact's runtime describes it: a leaf's letter, `["?", T]` for an option, `[_, T]` for a list, or a record by field. */
export type WireType = string | [string, WireType] | { [field: string]: WireType };

/** A component's build, as the preview fetches it. */
export interface Manifest {
  /** A digest of the build's code and style: a story remounts only when it changes. */
  version: string;
  /** The ES module to import, and its stylesheet, relative to the page. */
  bundle: string;
  css: string;
  /** Every source the app asks, with its argument types and its answer's type. */
  sourceTypes: Record<string, [WireType[], WireType]>;
  buildMs: number;
}

/** A build that failed, as the preview shows it. */
export interface ManifestError {
  error: string;
}

/** A story's answers for the sources its component asks, where the app's `app.ts` would answer. */
export type SourceMocks = Record<string, (...args: any[]) => unknown>;

/** What `render` hands `renderToCanvas`. */
export interface ExactStoryResult {
  component: ExactComponent;
  args: Record<string, unknown>;
  sources: SourceMocks;
}

export interface ExactParameters {
  exact?: {
    /** Answers for the sources a root component declares (`resource x = source()`, `send x = source()`). */
    sources?: SourceMocks;
  };
}

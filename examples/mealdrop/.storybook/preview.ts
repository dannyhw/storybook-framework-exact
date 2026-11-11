import type { Decorator, Preview } from 'storybook-framework-exact';

/**
 * The toolbar's scheme, applied as Exact's own `setScheme` applies one: the document's `color-scheme`, which
 * every token of `app.tamber` follows. "System" leaves it to the browser. The page behind a story is the
 * design's `surface.page`.
 */
const withScheme: Decorator = (story, { globals }) => {
  const page = document.documentElement.style;
  page.colorScheme = globals.scheme === 'light' || globals.scheme === 'dark' ? globals.scheme : '';
  page.backgroundColor = 'light-dark(#ffffff, #202020)';
  return story();
};

const preview: Preview = {
  globalTypes: {
    scheme: {
      description: 'Colour scheme',
      toolbar: {
        title: 'Scheme',
        icon: 'mirror',
        items: [
          { value: 'system', title: 'System', icon: 'browser' },
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { scheme: 'system' },
  decorators: [withScheme],
};

export default preview;

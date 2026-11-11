import type { Decorator } from 'storybook-framework-exact';

/**
 * Mealdrop's pages follow the window with media queries; a Contract page takes `compact` from its parent. This
 * sets it from the canvas's width (Droppy's 768px breakpoint), so a page story shows the phone layout in a
 * phone-sized viewport. A story that sets `compact` itself keeps it.
 */
export const compactByWidth: Decorator = (story, context) =>
  story({
    ...context,
    args: { ...context.args, compact: context.args.compact === true || window.innerWidth < 768 },
  });

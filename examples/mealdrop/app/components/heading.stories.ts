import type { Meta, StoryObj } from 'storybook-framework-exact';

import { HeadingScale } from './typography-examples.contract';

// Mealdrop's story shows every level at once, so it is a story of a component that stacks them.
const meta = {
  title: 'Components/Typography/Heading',
  component: HeadingScale,
  args: { label: '' },
} satisfies Meta<typeof HeadingScale>;
export default meta;

export const Default: StoryObj<typeof HeadingScale> = {};

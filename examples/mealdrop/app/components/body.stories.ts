import type { Meta, StoryObj } from 'storybook-framework-exact';

import { BodyScale } from './typography-examples.contract';

// Mealdrop's story shows every size at once, so it is a story of a component that stacks them.
const meta = {
  title: 'Components/Typography/Body',
  component: BodyScale,
  args: { label: '' },
} satisfies Meta<typeof BodyScale>;
export default meta;

export const Default: StoryObj<typeof BodyScale> = {};

import type { Meta, StoryObj } from 'storybook-framework-exact';

import { Skeleton } from './skeleton.contract';

// Mealdrop has no story of its own for the skeleton; this one keeps it built and checked.
const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
  args: { width: '', height: '' },
} satisfies Meta<typeof Skeleton>;
export default meta;

type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {};
export const Block: Story = { args: { width: '300px', height: '200px' } };

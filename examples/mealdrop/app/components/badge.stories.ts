import type { Meta, StoryObj } from 'storybook-framework-exact';

import { Badge } from './badge.contract';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { text: 'Comfort food', variant: 'neutral' },
} satisfies Meta<typeof Badge>;
export default meta;

export const Default: StoryObj<typeof Badge> = { args: { text: 'Comfort food' } };

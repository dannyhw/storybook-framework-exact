import type { Meta, StoryObj } from 'storybook-framework-exact';
import { fn } from 'storybook/test';

import { IconButton } from './icon-button.contract';

const meta = {
  title: 'Components/IconButton',
  component: IconButton,
  args: { name: 'arrow-right', small: false, label: 'forward', press: fn() },
} satisfies Meta<typeof IconButton>;
export default meta;

type Story = StoryObj<typeof IconButton>;

export const Default: Story = {};
export const Small: Story = { args: { small: true } };

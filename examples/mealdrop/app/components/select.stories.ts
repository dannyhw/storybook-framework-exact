import type { Meta, StoryObj } from 'storybook-framework-exact';
import { fn } from 'storybook/test';

import { Select } from './select.contract';

const meta = {
  title: 'Components/Form/Select',
  component: Select,
  args: { label: '', name: 'food', value: 'Burger', options: ['Burger', 'Pizza', 'Sushi'], change: fn() },
} satisfies Meta<typeof Select>;
export default meta;

type Story = StoryObj<typeof Select>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: { label: 'Select field' },
};

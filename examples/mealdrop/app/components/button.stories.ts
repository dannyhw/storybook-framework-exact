import type { Meta, StoryObj } from 'storybook-framework-exact';
import { fn } from 'storybook/test';

import { Button } from './button.contract';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { label: 'Button', icon: 'none', clear: false, round: false, large: false, disabled: false, press: fn() },
} satisfies Meta<typeof Button>;
export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Clear: Story = { args: { clear: true } };
export const Icon: Story = { args: { label: '', icon: 'cart', clear: true, round: true } };
export const IconAndText: Story = { args: { icon: 'cart', round: true } };

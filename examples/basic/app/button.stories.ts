import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { Button } from './button.contract';

const meta = {
  title: 'Button',
  component: Button,
  tags: ['autodocs'],
  args: { label: 'Hello Exact', tone: 'primary', disabled: false, press: fn() },
} satisfies Meta<typeof Button>;
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {};
export const Secondary: Story = { args: { tone: 'secondary', label: 'Cancel' } };
export const Disabled: Story = { args: { disabled: true } };

export const Pressed: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Hello Exact' }));
    await expect(args.press).toHaveBeenCalledOnce();
  },
};

import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { Counter } from './counter.contract';

const meta = {
  title: 'Counter',
  component: Counter,
  args: { start: 1, step: 2, changed: fn() },
} satisfies Meta;
export default meta;

type Story = StoryObj;

export const Default: Story = {};

/** The component's own state: an args change keeps the count. */
export const Bumped: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button'));
    await expect(await canvas.findByText('Count: 3')).toBeVisible();
    await expect(args.changed).toHaveBeenCalledWith(3);
  },
};

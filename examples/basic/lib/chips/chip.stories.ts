import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { Chip } from './chip.contract';

// A component of a library (a package that exports Contract). It is built as the library's users get it,
// by the package's name, so it has the package's tokens (chips.tamber).
const meta = { title: 'Library/Chip', component: Chip, args: { label: 'Dark mode', selected: false, toggle: fn() } } satisfies Meta<typeof Chip>;
export default meta;

type Story = StoryObj<typeof Chip>;

export const Off: Story = {};
export const On: Story = { args: { selected: true } };

export const Toggled: Story = {
  play: async ({ canvas, args, userEvent }) => {
    // `chips.fill`, the library's token.
    await expect(getComputedStyle(await canvas.findByTestId('chip')).backgroundColor).toBe('rgb(124, 58, 237)');
    // `change=toggle`: the action is given what the event carries.
    await userEvent.click(await canvas.findByTestId('chip-toggle'));
    await expect(args.toggle).toHaveBeenCalledWith(true);
  },
};

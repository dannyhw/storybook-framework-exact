import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn, waitFor } from 'storybook/test';

import { SidebarExample } from './sidebar.contract';

const meta = {
  title: 'Components/Sidebar',
  component: SidebarExample,
  args: { compact: false, dismiss: fn() },
  parameters: { layout: 'fullscreen', docs: { story: { height: '600px' } } },
  // Closes it with its button and with Escape, opening it again after each, so the story ends with it open.
  play: async ({ canvas, args, userEvent }) => {
    const dialog = await canvas.findByRole('dialog', { name: 'Your order' });
    await expect(dialog).toHaveTextContent('Some footer here');
    await userEvent.click(canvas.getByRole('button', { name: 'close sidebar' }));
    await expect(args.dismiss).toHaveBeenCalledOnce();
    await waitFor(() => expect(canvas.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole('button', { name: 'Open sidebar' }));
    await waitFor(() => expect(canvas.getByRole('dialog', { name: 'Your order' })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await expect(args.dismiss).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(canvas.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole('button', { name: 'Open sidebar' }));
    await waitFor(() => expect(canvas.getByRole('dialog', { name: 'Your order' })).toBeVisible());
  },
} satisfies Meta<typeof SidebarExample>;
export default meta;

type Story = StoryObj<typeof SidebarExample>;

export const Desktop: Story = {};

export const Mobile: Story = {
  args: { compact: true },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

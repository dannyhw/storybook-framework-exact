import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { Banner } from './banner.contract';

const meta = {
  title: 'Pages/HomePage/Components/Banner',
  component: Banner,
  args: { compact: false, navigate: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Banner>;
export default meta;

type Story = StoryObj<typeof Banner>;

export const Desktop: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'View all restaurants' }));
    await expect(args.navigate).toHaveBeenCalledWith('/categories');
  },
};

export const Mobile: Story = {
  args: { compact: true },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

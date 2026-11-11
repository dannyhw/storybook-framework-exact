import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { LinkExample } from './link.contract';

const meta = {
  title: 'Components/Link',
  component: LinkExample,
  args: { href: '/categories', external: false, press: fn() },
} satisfies Meta<typeof LinkExample>;
export default meta;

type Story = StoryObj<typeof LinkExample>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const link = await canvas.findByRole('link', { name: 'all categories' });
    await expect(link).toHaveAttribute('href', '/categories');
  },
};

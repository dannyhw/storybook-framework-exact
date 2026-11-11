import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { categories, restaurants } from '../../data/stub';
import { compactByWidth } from '../../compact-by-width';
import { HomePage } from './home-page.contract';

const meta = {
  title: 'Pages/HomePage',
  component: HomePage,
  args: {
    restaurants,
    categories,
    status: 'success',
    cartItems: [],
    currency: 'EUR',
    compact: false,
    navigate: fn(),
    saveItem: fn(),
    removeItem: fn(),
    checkout: fn(),
    toggleScheme: fn(),
  },
  decorators: [compactByWidth],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HomePage>;
export default meta;

type Story = StoryObj<typeof HomePage>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'View all restaurants' }));
    await expect(args.navigate).toHaveBeenCalledWith('/categories');
  },
};

// The phone layout: Mealdrop shows the same page at a narrow viewport.
export const Mobile: Story = {
  args: { compact: true },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

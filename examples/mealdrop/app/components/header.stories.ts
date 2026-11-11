import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { compactByWidth } from '../compact-by-width';
import { Header } from './header.contract';

const meta = {
  title: 'Components/Header',
  component: Header,
  args: {
    cartItems: [],
    currency: 'EUR',
    logoOnly: false,
    sticky: false,
    compact: false,
    navigate: fn(),
    toggleScheme: fn(),
    openCart: fn(),
  },
  decorators: [compactByWidth],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Header>;
export default meta;

type Story = StoryObj<typeof Header>;

// The links and the toggle hand their intents to the app. A phone-sized canvas shows the phone's header,
// which has neither.
export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await expect(await canvas.findByRole('button', { name: 'food cart' })).toBeVisible();
    if (args.compact || window.innerWidth < 768) {
      await expect(canvas.queryByRole('button', { name: 'All restaurants' })).toBeNull();
      return;
    }
    await userEvent.click(await canvas.findByRole('button', { name: 'All restaurants' }));
    await expect(args.navigate).toHaveBeenCalledWith('/categories');
    await userEvent.click(canvas.getByRole('button', { name: 'toggle dark mode' }));
    await expect(args.toggleScheme).toHaveBeenCalledOnce();
  },
};

export const WithCartData: Story = {
  args: {
    cartItems: [
      { id: 2, name: 'Fries', description: 'Fried french fries', price: 2.5, quantity: 2 },
      { id: 1, name: 'Cheeseburger', description: 'Nice grilled burger with cheese', price: 8.5, quantity: 1 },
    ],
  },
  play: async ({ canvas, args, userEvent }) => {
    const cart = await canvas.findByRole('button', { name: 'food cart' });
    await expect(cart).toHaveTextContent('€13.50');
    await userEvent.click(cart);
    await expect(args.openCart).toHaveBeenCalledOnce();
  },
};

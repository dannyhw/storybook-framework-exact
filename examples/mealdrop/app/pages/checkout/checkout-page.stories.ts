import type { Meta, StoryObj } from 'storybook-framework-exact';
import { fn } from 'storybook/test';

import { compactByWidth } from '../../compact-by-width';
import { CheckoutPage } from './checkout-page.contract';

// Mealdrop keeps the cart in redux; here it is an arg.
const meta = {
  title: 'Pages/CheckoutPage',
  component: CheckoutPage,
  args: {
    cartItems: [],
    currency: 'EUR',
    compact: false,
    navigate: fn(),
    saveItem: fn(),
    removeItem: fn(),
    checkout: fn(),
    toggleScheme: fn(),
    completeOrder: fn(),
  },
  decorators: [compactByWidth],
  parameters: { layout: 'fullscreen', docs: { story: { height: '800px' } } },
} satisfies Meta<typeof CheckoutPage>;
export default meta;

type Story = StoryObj<typeof CheckoutPage>;

export const Empty: Story = {};

export const WithItems: Story = {
  args: {
    cartItems: [
      { id: 2, name: 'Fries', description: 'Fried french fries', price: 2.5, quantity: 2 },
      { id: 1, name: 'Cheeseburger', description: 'Nice grilled burger with cheese', price: 8.5, quantity: 1 },
    ],
  },
};

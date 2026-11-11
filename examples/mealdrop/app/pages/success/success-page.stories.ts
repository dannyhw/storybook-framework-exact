import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { compactByWidth } from '../../compact-by-width';
import { SuccessPage } from './success-page.contract';

// Mealdrop keeps the placed order in redux; here it is an arg.
const meta = {
  title: 'Pages/SuccessPage',
  component: SuccessPage,
  args: {
    orderItems: [],
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
  parameters: { layout: 'fullscreen', docs: { story: { height: '800px' } } },
} satisfies Meta<typeof SuccessPage>;
export default meta;

type Story = StoryObj<typeof SuccessPage>;

export const Default: Story = {
  args: {
    orderItems: [
      { id: 2, name: 'Fries', description: 'Fried french fries', price: 2.5, quantity: 2 },
      { id: 1, name: 'Cheeseburger', description: 'Nice grilled burger with cheese', price: 8.5, quantity: 1 },
    ],
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Order confirmed!' })).toBeInTheDocument();
    await expect(canvas.getByTestId('order-total')).toHaveTextContent('€13.50');
  },
};

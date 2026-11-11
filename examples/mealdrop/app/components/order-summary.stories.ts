import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect } from 'storybook/test';

import { cartItems } from '../data/stub';
import { OrderSummary } from './order-summary.contract';

const meta = {
  title: 'Components/OrderSummary',
  component: OrderSummary,
  args: { cartItems, currency: 'EUR' },
} satisfies Meta<typeof OrderSummary>;
export default meta;

type Story = StoryObj<typeof OrderSummary>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByTestId('order-total')).toHaveTextContent('€17.75');
  },
};

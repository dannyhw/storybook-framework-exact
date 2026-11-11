import type { Meta, StoryObj } from 'storybook-framework-exact';

import { cartItems } from '../data/stub';
import { ShoppingCartItem } from './shopping-cart-item.contract';

const meta = {
  title: 'Components/ShoppingCartItem',
  component: ShoppingCartItem,
  args: { item: { ...cartItems[1], quantity: 2 }, currency: 'EUR' },
} satisfies Meta<typeof ShoppingCartItem>;
export default meta;

type Story = StoryObj<typeof ShoppingCartItem>;

export const Default: Story = {};

import type { Meta, StoryObj } from 'storybook-framework-exact';
import { fn } from 'storybook/test';

import { FoodItem } from './food-item.contract';

const meta = {
  title: 'Pages/RestaurantDetailPage/Components/FoodItem',
  component: FoodItem,
  args: { name: 'Food', price: 7.5, description: 'nice stuff', quantity: 0, currency: 'EUR', press: fn() },
} satisfies Meta<typeof FoodItem>;
export default meta;

type Story = StoryObj<typeof FoodItem>;

export const Default: Story = {};

export const WithQuantity: Story = {
  args: { quantity: 5 },
};

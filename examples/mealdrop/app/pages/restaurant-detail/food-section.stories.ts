import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { cartItems, restaurants } from '../../data/stub';
import { FoodSection } from './food-section.contract';

// Mealdrop has no story of its own for this part; this one shows the grid as the page lays it out.
const meta = {
  title: 'Pages/RestaurantDetailPage/Components/FoodSection',
  component: FoodSection,
  args: {
    title: 'To eat',
    items: restaurants[0].menu.food,
    cartItems,
    currency: 'EUR',
    compact: false,
    itemPress: fn(),
  },
} satisfies Meta<typeof FoodSection>;
export default meta;

type Story = StoryObj<typeof FoodSection>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByText('Fries'));
    await expect(args.itemPress).toHaveBeenCalledWith(2);
  },
};

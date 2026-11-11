import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { restaurants } from '../../data/stub';
import { RestaurantsSection } from './restaurants-section.contract';

const meta = {
  title: 'Pages/HomePage/Components/RestaurantsSection',
  component: RestaurantsSection,
  args: { title: 'Our favorite picks', restaurants, isLoading: false, compact: false, navigate: fn() },
} satisfies Meta<typeof RestaurantsSection>;
export default meta;

type Story = StoryObj<typeof RestaurantsSection>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const cards = await canvas.findAllByTestId('restaurant-card');
    await userEvent.click(cards[0]);
    await expect(args.navigate).toHaveBeenCalledWith('/restaurants/1');
  },
};

export const Loading: Story = {
  args: { isLoading: true },
  play: async ({ canvas }) => {
    await expect(await canvas.findAllByRole('status', { name: 'Loading restaurant' })).toHaveLength(3);
  },
};

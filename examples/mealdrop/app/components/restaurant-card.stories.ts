import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { restaurants } from '../data/stub';
import { RestaurantCard } from './restaurant-card.contract';

const { id: _id, menu: _menu, ...restaurant } = restaurants[0];

const meta = {
  title: 'Components/RestaurantCard',
  component: RestaurantCard,
  args: { ...restaurant, name: 'Burger Kingdom', isLoading: false, press: fn() },
} satisfies Meta<typeof RestaurantCard>;
export default meta;

type Story = StoryObj<typeof RestaurantCard>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByTestId('restaurant-card'));
    await expect(args.press).toHaveBeenCalledOnce();
  },
};

export const New: Story = { args: { isNew: true } };

// A closed restaurant says so and does not open.
export const Closed: Story = {
  args: { isClosed: true },
  play: async ({ canvas, args, userEvent }) => {
    await expect(await canvas.findByText('This restaurant is closed.')).toBeInTheDocument();
    await userEvent.click(canvas.getByTestId('restaurant-card'));
    await expect(args.press).not.toHaveBeenCalled();
  },
};

export const Loading: Story = { args: { isLoading: true } };

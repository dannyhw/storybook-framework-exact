import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { categories, restaurants } from '../../data/stub';
import { compactByWidth } from '../../compact-by-width';
import { CategoryDetailPage } from './category-detail-page.contract';

const meta = {
  title: 'Pages/CategoryDetailPage',
  component: CategoryDetailPage,
  args: {
    categoryId: 'burgers',
    categories,
    restaurants: [restaurants[0]],
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
} satisfies Meta<typeof CategoryDetailPage>;
export default meta;

type Story = StoryObj<typeof CategoryDetailPage>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByTestId('restaurant-card'));
    await expect(args.navigate).toHaveBeenCalledWith('/restaurants/1');
  },
};

export const Loading: Story = {
  args: { status: 'loading' },
  play: async ({ canvas }) => {
    await expect(await canvas.findAllByRole('status', { name: 'Loading restaurant' })).toHaveLength(3);
  },
};

// An unknown category with no restaurants: the way back goes to every restaurant.
export const Missing: Story = {
  args: { categoryId: 'wrong', restaurants: [] },
  play: async ({ canvas, args, userEvent }) => {
    await expect(await canvas.findByRole('heading', { name: 'Oops!' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'See all restaurants' }));
    await expect(args.navigate).toHaveBeenCalledWith('/categories');
  },
};

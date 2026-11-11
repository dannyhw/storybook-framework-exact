import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn, waitFor } from 'storybook/test';

import { FoodItemModalExample } from './food-item-modal.contract';

const item = { id: 1, name: 'Dish.name', description: 'Juicy dish with extra mayonaise', price: 12 };

const meta = {
  title: 'Pages/RestaurantDetailPage/Components/FoodItemModal',
  component: FoodItemModalExample,
  args: {
    item,
    // Mealdrop's story has the dish in the cart once.
    cartItems: [{ ...item, quantity: 1 }],
    currency: 'EUR',
    compact: false,
    save: fn(),
    dismiss: fn(),
  },
  parameters: { layout: 'fullscreen', docs: { story: { height: '600px' } } },
  // Picks two and confirms, then opens it again so the story ends with it open.
  play: async ({ canvas, args, userEvent }) => {
    const dialog = await canvas.findByRole('dialog', { name: 'Dish.name' });
    await expect(dialog).toHaveTextContent('Juicy dish with extra mayonaise');
    await userEvent.click(canvas.getByRole('button', { name: 'increase quantity by one' }));
    await waitFor(() => expect(canvas.getByRole('button', { name: 'confirm' })).toHaveTextContent('add for €24.00'));
    await userEvent.click(canvas.getByRole('button', { name: 'confirm' }));
    await expect(args.save).toHaveBeenCalledWith(1, 2);
    await expect(args.dismiss).toHaveBeenCalledOnce();
    await waitFor(() => expect(canvas.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole('button', { name: 'Open modal' }));
    await waitFor(() => expect(canvas.getByRole('button', { name: 'confirm' })).toHaveTextContent('add for €12.00'));
  },
} satisfies Meta<typeof FoodItemModalExample>;
export default meta;

type Story = StoryObj<typeof FoodItemModalExample>;

export const Desktop: Story = {};

export const Mobile: Story = {
  args: { compact: true },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

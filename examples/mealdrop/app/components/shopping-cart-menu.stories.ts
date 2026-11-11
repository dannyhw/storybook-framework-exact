import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn, waitFor, within } from 'storybook/test';

import { cartItems } from '../data/stub';
import { ShoppingCartMenuExample } from './shopping-cart-menu.contract';

const meta = {
  title: 'Components/ShoppingCartMenu',
  component: ShoppingCartMenuExample,
  args: {
    cartItems,
    currency: 'EUR',
    compact: false,
    withOpener: false,
    dismiss: fn(),
    saveItem: fn(),
    removeItem: fn(),
    checkout: fn(),
  },
  parameters: { layout: 'fullscreen', docs: { story: { height: '600px' } } },
} satisfies Meta<typeof ShoppingCartMenuExample>;
export default meta;

type Story = StoryObj<typeof ShoppingCartMenuExample>;

// Nothing to check out: the button is disabled.
export const Empty: Story = {
  args: { cartItems: [] },
  play: async ({ canvas }) => {
    const sidebar = await canvas.findByTestId('sidebar');
    await expect(within(sidebar).getByRole('button', { name: 'Checkout' })).toBeDisabled();
  },
};

// A new quantity is saved, 0 takes the item out, and Checkout goes on.
export const WithItems: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const sidebar = await canvas.findByTestId('sidebar');
    await expect(within(sidebar).getByTestId('cart-total')).toHaveTextContent('€17.75');
    const [fries, burger] = within(sidebar).getAllByRole('combobox');
    await userEvent.selectOptions(fries, '3');
    await waitFor(() => expect(args.saveItem).toHaveBeenCalledWith(2, 3));
    await userEvent.selectOptions(burger, '0');
    await waitFor(() => expect(args.removeItem).toHaveBeenCalledWith(1));
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Checkout' }));
    await expect(args.checkout).toHaveBeenCalledOnce();
  },
};

export const Mobile: Story = {
  args: { compact: true },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const Playground: Story = {
  args: { withOpener: true },
  play: async ({ canvas, args, userEvent }) => {
    await canvas.findByRole('dialog', { name: 'Your order' });
    await userEvent.click(canvas.getByRole('button', { name: 'close sidebar' }));
    await expect(args.dismiss).toHaveBeenCalled();
    await waitFor(() => expect(canvas.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole('button', { name: 'Open ShoppingCartMenu' }));
    await waitFor(() => expect(canvas.getByRole('dialog', { name: 'Your order' })).toBeVisible());
  },
};

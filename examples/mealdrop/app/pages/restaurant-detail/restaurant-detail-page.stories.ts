import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn, waitFor, within } from 'storybook/test';

import { cartItems, restaurants } from '../../data/stub';
import { compactByWidth } from '../../compact-by-width';
import { RestaurantDetailPage } from './restaurant-detail-page.contract';

// Mealdrop answers the restaurant with MSW and keeps the cart in redux; here both are args.
const meta = {
  title: 'Pages/RestaurantDetailPage',
  component: RestaurantDetailPage,
  args: {
    restaurant: restaurants[0],
    status: 'success',
    cartItems: [],
    currency: 'EUR',
    compact: false,
    navigate: fn(),
    saveItem: fn(),
    removeItem: fn(),
    checkout: fn(),
    toggleScheme: fn(),
    retry: fn(),
  },
  decorators: [compactByWidth],
  parameters: { layout: 'fullscreen', docs: { story: { height: '800px' } } },
} satisfies Meta<typeof RestaurantDetailPage>;
export default meta;

type Story = StoryObj<typeof RestaurantDetailPage>;

export const Success = {
  play: async ({ canvas }) => {
    const item = await canvas.findByText(/Burger Kingdom/i);
    await expect(item).toBeInTheDocument();
  },
} satisfies Story;

// Opens the cheeseburger and puts two in the cart.
// The back button on the photo goes to the page before, as Mealdrop's `navigate(-1)`.
export const BackButton: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'go back' }));
    await expect(args.navigate).toHaveBeenCalledWith('back');
  },
};

export const WithModalOpen: Story = {
  play: async (context) => {
    await Success.play(context);
    const { canvas, args, userEvent } = context;
    await userEvent.click(await canvas.findByText(/Cheeseburger/i));
    const modal = await canvas.findByTestId('modal');
    await expect(modal).toBeInTheDocument();
    await waitFor(() => expect(modal).toHaveFocus());
    await userEvent.click(within(modal).getByRole('button', { name: 'increase quantity by one' }));
    await waitFor(() => expect(within(modal).getByRole('button', { name: 'confirm' })).toHaveTextContent('add for €17.00'));
    await userEvent.click(within(modal).getByRole('button', { name: 'confirm' }));
    await expect(args.saveItem).toHaveBeenCalledWith(1, 2);
    await waitFor(() => expect(canvas.queryByTestId('modal')).not.toBeInTheDocument());
    // Opened again so the story ends as its name says.
    await userEvent.click(await canvas.findByText(/Cheeseburger/i));
    await expect(await canvas.findByTestId('modal')).toBeInTheDocument();
  },
};

export const WithItemsInTheCart: Story = {
  args: { cartItems },
  play: async ({ canvas }) => {
    const quantities = await canvas.findAllByLabelText('food quantity');
    await expect(quantities).toHaveLength(6);
  },
};

// Mealdrop mocks `getCurrency` to answer USD; the page takes the currency as a prop.
export const WithItemsInTheCartDollarCurrency: Story = {
  args: { cartItems, currency: 'USD' },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText('$8.50')).toBeInTheDocument();
    // The currency is the app's: the header's total and the cart are in dollars too.
    await expect(within(canvas.getByTestId('header')).getByTestId('cart-total')).toHaveTextContent('$17.75');
    await userEvent.click(canvas.getByRole('button', { name: 'food cart' }));
    const sidebar = await canvas.findByTestId('sidebar');
    await expect(within(sidebar).getByTestId('cart-total')).toHaveTextContent('$17.75');
  },
};

export const Loading: Story = {
  args: { status: 'loading' },
  play: async ({ canvas }) => {
    const item = await canvas.findByRole('status');
    await expect(item).toBeInTheDocument();
  },
};

export const NotFound: Story = {
  args: { status: 'not-found' },
  play: async ({ canvas, args, userEvent }) => {
    const item = await canvas.findByText(/We can't find this page/i);
    await expect(item).toBeInTheDocument();
    // The header has a Home button too.
    await userEvent.click(within(canvas.getByTestId('error-block')).getByRole('button', { name: 'Home' }));
    await expect(args.navigate).toHaveBeenCalledWith('/');
  },
};

export const Error: Story = {
  args: { status: 'error' },
  play: async ({ canvas, args, userEvent, step }) => {
    await step('Name of step', async () => {
      const item = await canvas.findByText(/Something went wrong!/i);
      await expect(item).toBeInTheDocument();
    });
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
    await expect(args.retry).toHaveBeenCalledOnce();
  },
};

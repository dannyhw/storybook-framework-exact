import type { Loader, Meta, StoryObj } from 'storybook-framework-exact';
import { expect, waitFor, within } from 'storybook/test';

import { App } from './app.contract';
import { cartItems, restaurants } from './data/stub';
import { createStore, type StoreOptions } from './data/store';
import { demoUserEvent } from './demo-mode';

/**
 * The app's sources answered by a store of the stub data, fresh for each story (and again each time the story
 * runs), where Mealdrop mocks its API with MSW and starts its redux store empty.
 */
const withStore = (options: StoreOptions = {}, location?: string) => {
  const store = createStore(options);
  return {
    parameters: { exact: { sources: store.sources, ...(location ? { location } : {}) } },
    beforeEach: () => store.reset(),
  };
};
const store = withStore();

/** Mealdrop's demo mode: with `demoMode` on, the flow's clicks and typing are paced for people to follow. */
const demoMode: Loader = async (context) => {
  if (context.args.demoMode) context.userEvent = demoUserEvent(context.userEvent);
};

const meta = {
  title: 'UserFlows/App',
  component: App,
  args: { demoMode: false },
  argTypes: { demoMode: { control: { type: 'boolean' } } },
  loaders: [demoMode],
  beforeEach: store.beforeEach,
  parameters: { ...store.parameters, layout: 'fullscreen', docs: { story: { height: '800px' } } },
} satisfies Meta<{ demoMode: boolean }>;
export default meta;

type Story = StoryObj<{ demoMode: boolean }>;

/** One page in the document at a time: the page before is gone, its header with it. */
const onePage = async (canvasElement: HTMLElement, testId: string) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByTestId(testId)).toBeVisible();
  await expect(canvas.getAllByTestId('header')).toHaveLength(1);
};

export const Home: Story = {
  play: async ({ canvasElement }) => {
    await onePage(canvasElement, 'home-page');
  },
};

export const ToCategoryListPage = {
  play: async ({ canvasElement, step, userEvent }) => {
    const canvas = within(canvasElement);
    await step('Visit Restaurants page', async () => {
      await userEvent.click(await canvas.findByText('View all restaurants'));
    });
    await onePage(canvasElement, 'category-list-page');
  },
} satisfies Story;

export const ToCategoryDetailPage = {
  play: async (context) => {
    await ToCategoryListPage.play(context);
    const { canvasElement, step, userEvent } = context;

    const canvas = within(canvasElement);
    await step('Select "Burgers" category', async () => {
      await userEvent.click(canvas.getByTestId('Burgers'));
    });
    await onePage(canvasElement, 'category-detail-page');
  },
} satisfies Story;

export const ToRestaurantDetailPage = {
  play: async (context) => {
    await ToCategoryDetailPage.play(context);
    const { canvasElement, step, userEvent } = context;

    const canvas = within(canvasElement);

    await step('Select first restaurant from the list', async () => {
      const restaurantCards = await canvas.findAllByTestId('restaurant-card');
      await userEvent.click(restaurantCards[0]!);
    });
    await onePage(canvasElement, 'restaurant-detail');
  },
} satisfies Story;

export const ToCheckoutPage = {
  play: async (context) => {
    await ToRestaurantDetailPage.play(context);
    const { canvasElement, userEvent, step } = context;

    const canvas = within(canvasElement);

    await step('Add Cheeseburger to cart', async () => {
      const foodItem = await canvas.findByText(/Cheeseburger/i);
      await userEvent.click(foodItem);

      const modalButton = await canvas.findByLabelText('increase quantity by one');
      await userEvent.click(modalButton);
      await userEvent.click(canvas.getByLabelText('confirm'));

      const cheeseburgerItem = within(foodItem.parentElement!);

      await waitFor(() => expect(cheeseburgerItem.getByLabelText('food quantity').textContent).toEqual('2'));
    });

    await step('Sidebar should contain 2 items', async () => {
      await userEvent.click(canvas.getByLabelText('food cart'));
      const sidebar = await within(canvasElement).findByTestId('sidebar');

      const foodItemSelector: HTMLSelectElement = within(sidebar).getByRole('combobox');
      await expect(foodItemSelector.value).toEqual('2');
    });

    await step('Go to "Checkout" page', async () => {
      await userEvent.click(canvas.getByText(/checkout/i));
    });
    await onePage(canvasElement, 'checkout-page');
    await expect(canvas.getByTestId('order-total')).toHaveTextContent('€17.00');
  },
} satisfies Story;

export const ToSuccessPage = {
  play: async (context) => {
    await ToCheckoutPage.play(context);
    const { canvas, canvasElement, step, userEvent } = context;

    await step('Fill in user details', async () => {
      await userEvent.type(canvas.getByLabelText('First name'), 'Jane');
      await userEvent.type(canvas.getByLabelText('Last name'), 'Dough');
      await userEvent.type(canvas.getByLabelText('Email'), 'jane@dough.com');
      await userEvent.type(canvas.getByLabelText('Phone number'), '0612345678');
    });

    await step('Go to the next step', async () => {
      await userEvent.click(canvas.getByText(/Next/i));
    });

    await step('Fill in delivery details', async () => {
      await userEvent.type(await canvas.findByLabelText('Streetname and housenumber'), 'Somestreet 14');
      await userEvent.type(canvas.getByLabelText('Postcode'), '1043DX');
      await userEvent.type(canvas.getByLabelText('City'), 'Amsterdam');
    });

    await step('Complete order', async () => {
      await userEvent.click(canvas.getByText(/Complete/i));
    });
    // The order is placed: it is on the success page, and the cart is empty again.
    await onePage(canvasElement, 'success-page');
    await expect(canvas.getByTestId('order-total')).toHaveTextContent('€17.00');
    await expect(within(canvas.getByTestId('header')).queryByTestId('cart-total')).toBeNull();
  },
} satisfies Story;

export const DemoMode: Story = {
  ...ToSuccessPage,
  args: {
    demoMode: true,
  },
};

// Stories Mealdrop's MSW and redux setup cannot have as easily: each starts at a location, with the store as
// the story needs it.

/** A restaurant's page opened by its link. The photo's back button goes to the page under it, home. */
export const AtARestaurant: Story = {
  parameters: { exact: { location: `/restaurants/${restaurants[4]!.id}` } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findByRole('heading', { name: restaurants[4]!.name })).toBeVisible();
    await onePage(canvasElement, 'restaurant-detail');
    await userEvent.click(canvas.getByRole('button', { name: 'go back' }));
    await onePage(canvasElement, 'home-page');
    await expect(canvas.queryByTestId('restaurant-detail')).toBeNull();
  },
};

/** The checkout with a cart the store already holds. */
export const AtCheckoutWithACart: Story = {
  ...withStore({ cart: cartItems }, '/checkout'),
  play: async ({ canvas, canvasElement }) => {
    await onePage(canvasElement, 'checkout-page');
    await expect(await canvas.findByTestId('order-total')).toHaveTextContent('€17.75');
    await expect(canvas.getAllByTestId('shopping-cart-item')).toHaveLength(cartItems.length);
  },
};

/** A restaurant id the API does not know: the page says it cannot find it, and Home goes home. */
export const NoSuchRestaurant: Story = {
  parameters: { exact: { location: '/restaurants/404' } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findByText("We can't find this page")).toBeVisible();
    await userEvent.click(within(canvas.getByTestId('error-block')).getByRole('button', { name: 'Home' }));
    await onePage(canvasElement, 'home-page');
  },
};

/** A path the app has no page for. */
export const NoSuchPage: Story = {
  parameters: { exact: { location: '/nowhere' } },
  play: async ({ canvas, canvasElement }) => {
    await onePage(canvasElement, 'not-found-page');
    await expect(canvas.getByText("We can't find this page")).toBeVisible();
  },
};

/** The kitchen is slow: the restaurants arrive after a second, and the pages show that they are loading. */
export const SlowKitchen: Story = {
  ...withStore({ restaurantsDelay: 1000 }),
  play: async ({ canvas }) => {
    await expect(await canvas.findAllByRole('status', { name: 'Loading restaurant' })).not.toHaveLength(0);
    await expect(await canvas.findByRole('heading', { name: 'Burger Kingdom' }, { timeout: 3000 })).toBeVisible();
  },
};

import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn, waitFor, within } from 'storybook/test';

import { cartItems } from '../data/stub';
import { compactByWidth } from '../compact-by-width';
import { PageTemplateExample } from './page-template.contract';

const meta = {
  title: 'Templates/PageTemplate',
  component: PageTemplateExample,
  args: {
    type: 'default',
    text: 'Default template with scrollable header and navigation items',
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
  parameters: { layout: 'fullscreen', docs: { story: { height: '600px' } } },
} satisfies Meta<typeof PageTemplateExample>;
export default meta;

type Story = StoryObj<typeof PageTemplateExample>;

export const Default: Story = {};

// The cart button opens the cart, and Checkout closes it and goes on.
export const DefaultWithItemsInTheCart: Story = {
  args: { cartItems },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'food cart' }));
    const sidebar = await canvas.findByTestId('sidebar');
    await waitFor(() => expect(sidebar).toHaveFocus());
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Checkout' }));
    await expect(args.checkout).toHaveBeenCalledOnce();
    await waitFor(() => expect(canvas.queryByTestId('sidebar')).not.toBeInTheDocument());
  },
};

export const StickyHeader: Story = {
  args: {
    type: 'sticky-header',
    text: 'Template with sticky header on desktop and navigation items. Try scrolling',
  },
};

export const Basic: Story = {
  args: {
    type: 'basic',
    text: 'Simple template with scrollable header and no navigation items',
  },
};

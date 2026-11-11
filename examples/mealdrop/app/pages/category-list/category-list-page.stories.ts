import type { Meta, StoryObj } from 'storybook-framework-exact';
import { fn } from 'storybook/test';

import { categories } from '../../data/stub';
import { compactByWidth } from '../../compact-by-width';
import { CategoryListPage } from './category-list-page.contract';

const meta = {
  title: 'Pages/CategoryListPage',
  component: CategoryListPage,
  args: {
    categories,
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
} satisfies Meta<typeof CategoryListPage>;
export default meta;

type Story = StoryObj<typeof CategoryListPage>;

export const Default: Story = {};

// The phone layout, which Mealdrop shows at a narrow viewport.
export const Mobile: Story = {
  args: { compact: true },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

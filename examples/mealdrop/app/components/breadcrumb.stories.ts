import type { Meta, StoryObj } from 'storybook-framework-exact';
import { fn } from 'storybook/test';

import { Breadcrumb } from './breadcrumb.contract';

const meta = {
  title: 'Components/Breadcrumb',
  component: Breadcrumb,
  args: { navigate: fn() },
} satisfies Meta<typeof Breadcrumb>;
export default meta;

type Story = StoryObj<typeof Breadcrumb>;

export const SingleItem: Story = {
  args: { items: [{ label: 'categories', href: '' }] },
};

export const MultipleItems: Story = {
  args: {
    items: [
      { label: 'home', href: '/' },
      { label: 'categories', href: '/categories' },
      { label: 'sushi', href: '' },
    ],
  },
};

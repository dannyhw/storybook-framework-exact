import type { Meta, StoryObj } from 'storybook-framework-exact';
import { fn } from 'storybook/test';

import { ErrorBlockExample } from './error-block.contract';

// The illustration is the block's children, so the stories show a small component that fills it.
const meta = {
  title: 'Components/ErrorBlock',
  component: ErrorBlockExample,
  parameters: { layout: 'fullscreen' },
  args: { buttonClick: fn() },
} satisfies Meta<typeof ErrorBlockExample>;
export default meta;

type Story = StoryObj<typeof ErrorBlockExample>;

export const Default: Story = {
  args: {
    title: 'This is not the food you’re looking for.',
    body: 'There seems that there are no restaurants in this category yet. Try to come back later?',
    illustration: 'sushi',
    buttonText: 'See all restaurants',
  },
};

export const Error404: Story = {
  args: {
    title: "We can't find this page",
    body: 'This page doesn’t exist, keep looking.',
    illustration: 'not-found',
    buttonText: 'Home',
  },
};

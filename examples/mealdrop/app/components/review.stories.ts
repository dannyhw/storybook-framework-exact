import type { Meta, StoryObj } from 'storybook-framework-exact';

import { Review } from './review.contract';

const meta = {
  title: 'Components/Review',
  component: Review,
  args: { rating: 0 },
  argTypes: { rating: { control: { type: 'range', min: 0, max: 5, step: 0.1 } } },
} satisfies Meta<typeof Review>;
export default meta;

type Story = StoryObj<typeof Review>;

export const Default: Story = {};
export const Excellent: Story = { args: { rating: 5 } };
export const VeryGood: Story = { args: { rating: 4.3 } };
export const Adequate: Story = { args: { rating: 2.5 } };
export const Poor: Story = { args: { rating: 1.5 } };

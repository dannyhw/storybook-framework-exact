import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, waitFor } from 'storybook/test';

import { CarouselExample } from './carousel.contract';

const meta = {
  title: 'Components/Carousel',
  component: CarouselExample,
  args: { count: 8, perView: 3, compact: false },
  tags: ['autodocs'],
} satisfies Meta<typeof CarouselExample>;
export default meta;

type Story = StoryObj<typeof CarouselExample>;

// Next scrolls one item on, and then there is somewhere to go back to.
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    await userEvent.click(await canvas.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Previous' })).toBeInTheDocument());
  },
};

// Few enough items to fit at once: neither arrow is shown.
export const AllItemsVisible: Story = {
  args: { count: 2 },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  },
};

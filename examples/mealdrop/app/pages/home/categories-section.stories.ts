import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { categories } from '../../data/stub';
import { CategoriesSection } from './categories-section.contract';

const meta = {
  title: 'Pages/HomePage/Components/CategoriesSection',
  component: CategoriesSection,
  args: { categories, compact: false, navigate: fn() },
} satisfies Meta<typeof CategoriesSection>;
export default meta;

type Story = StoryObj<typeof CategoriesSection>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByTestId('Burgers'));
    await expect(args.navigate).toHaveBeenCalledWith('/categories/burgers');
  },
};

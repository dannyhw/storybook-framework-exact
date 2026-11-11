import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { categories } from '../../data/stub';
import { CategoryList } from './category-list.contract';

const meta = {
  title: 'Pages/CategoryListPage/Components/CategoryList',
  component: CategoryList,
  args: { categories, compact: false, navigate: fn() },
} satisfies Meta<typeof CategoryList>;
export default meta;

type Story = StoryObj<typeof CategoryList>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByTestId('Sushi'));
    await expect(args.navigate).toHaveBeenCalledWith('/categories/sushi');
  },
};

import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { AwardWinningSection } from './award-winning-section.contract';

const meta = {
  title: 'Pages/HomePage/Components/AwardWinningSection',
  component: AwardWinningSection,
  args: { compact: false, navigate: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AwardWinningSection>;
export default meta;

type Story = StoryObj<typeof AwardWinningSection>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Explore best restaurants' }));
    await expect(args.navigate).toHaveBeenCalledWith('/categories');
  },
};

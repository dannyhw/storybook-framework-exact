import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn } from 'storybook/test';

import { PageSectionExample } from './page-section.contract';

const meta = {
  title: 'Components/PageSection',
  component: PageSectionExample,
  args: { title: 'Asian', topButtonLabel: '', compact: false, topButtonPress: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PageSectionExample>;
export default meta;

type Story = StoryObj<typeof PageSectionExample>;

export const Default: Story = {};

export const WithButtons: Story = {
  args: { topButtonLabel: 'View all' },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'View all' }));
    await expect(args.topButtonPress).toHaveBeenCalledOnce();
  },
};

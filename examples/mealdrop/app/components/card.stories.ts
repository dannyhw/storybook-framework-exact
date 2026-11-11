import type { Meta, StoryObj } from 'storybook-framework-exact';

import { CardExample } from './card.contract';

const meta = {
  title: 'Components/Card',
  component: CardExample,
  args: { padded: true, interactive: false },
} satisfies Meta<typeof CardExample>;
export default meta;

type Story = StoryObj<typeof CardExample>;

export const Default: Story = {};
export const Interactive: Story = { args: { interactive: true } };

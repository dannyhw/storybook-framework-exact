import type { Meta, StoryObj } from 'storybook-framework-exact';
import { fn } from 'storybook/test';

import { Footer } from './footer.contract';

const meta = {
  title: 'Components/Footer',
  component: Footer,
  args: { compact: false, navigate: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Footer>;
export default meta;

type Story = StoryObj<typeof Footer>;

export const Default: Story = {};

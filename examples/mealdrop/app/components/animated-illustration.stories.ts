import type { Meta, StoryObj } from 'storybook-framework-exact';

import { AnimatedIllustration } from './animated-illustration.contract';

const meta = {
  title: 'Components/AnimatedIllustration',
  component: AnimatedIllustration,
  args: { animation: 'NotFound' },
  parameters: { layout: 'fullscreen', chromatic: { delay: 1000 } },
} satisfies Meta<typeof AnimatedIllustration>;
export default meta;

type Story = StoryObj<typeof AnimatedIllustration>;

export const NotFound: Story = { args: { animation: 'NotFound' } };
export const Error: Story = { args: { animation: 'Error' } };

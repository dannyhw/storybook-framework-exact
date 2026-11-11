import type { Meta, StoryObj } from 'storybook-framework-exact';

import { ContainerExample } from './container.contract';

const meta = {
  title: 'Components/Container',
  component: ContainerExample,
  args: { desktopOnly: false, compact: false },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ContainerExample>;
export default meta;

type Story = StoryObj<typeof ContainerExample>;

export const Default: Story = {};
export const Compact: Story = { args: { compact: true }, globals: { viewport: { value: 'mobile1' } } };

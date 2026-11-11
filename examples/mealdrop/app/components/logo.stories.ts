import type { Meta, StoryObj } from 'storybook-framework-exact';

import { Logo } from './logo.contract';

const meta = {
  title: 'Components/Logo',
  component: Logo,
  args: { large: false, logoOnly: false, animated: false, compact: false },
} satisfies Meta<typeof Logo>;
export default meta;

type Story = StoryObj<typeof Logo>;

export const WithText: Story = {};
export const LogoOnly: Story = { args: { large: true, logoOnly: true } };
export const Animated: Story = { args: { large: true, logoOnly: true, animated: true } };

import type { Meta, StoryObj } from 'storybook-framework-exact';

import { TopBanner } from './top-banner.contract';

const meta = {
  title: 'Components/TopBanner',
  component: TopBanner,
  args: { title: 'Categories', level: 1, photoUrl: '' },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TopBanner>;
export default meta;

type Story = StoryObj<typeof TopBanner>;

export const Default: Story = {};

export const WithImage: Story = {
  args: {
    photoUrl:
      'https://images.unsplash.com/photo-1426869981800-95ebf51ce900?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1350&q=20',
  },
};

import type { Meta, StoryObj } from 'storybook-framework-exact';

import { IconGallery } from './icon-examples.contract';
import { Icon } from './icon.contract';

const meta = {
  title: 'Components/Icon',
  component: Icon,
  args: { name: 'cart', size: 24 },
  argTypes: { size: { control: { type: 'range', min: 8, max: 96 } } },
} satisfies Meta<typeof Icon>;
export default meta;

type Story = StoryObj<typeof Icon>;

// The overview is a Contract component of its own: a story renders an Exact app, not markup.
export const AllIcons: Story = {
  argTypes: { name: { table: { disable: true } } },
  render: ({ size }) => ({ component: IconGallery, args: { size }, sources: {} }),
};

export const Playground: Story = {};

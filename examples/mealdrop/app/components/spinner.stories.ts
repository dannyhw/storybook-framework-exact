import type { Meta, StoryObj } from 'storybook-framework-exact';

import { Spinner } from './spinner.contract';

const meta = {
  title: 'Components/Spinner',
  component: Spinner,
  args: { label: 'Loading' },
  parameters: { layout: 'fullscreen', chromatic: { delay: 1200 } },
} satisfies Meta<typeof Spinner>;
export default meta;

export const Default: StoryObj<typeof Spinner> = {};

import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, waitFor } from 'storybook/test';

import { Avatar } from './avatar.contract';

const meta = { title: 'Avatar', component: Avatar, args: { name: 'Ada Lovelace' } } satisfies Meta<typeof Avatar>;
export default meta;

type Story = StoryObj<typeof Avatar>;

// The image is a file in the app's assets/ folder, which Storybook serves and a static build includes.
export const WithImage: Story = {
  play: async ({ canvas }) => {
    const image = await canvas.findByTestId<HTMLImageElement>('avatar-image');
    await waitFor(() => expect(image.naturalWidth).toBeGreaterThan(0));
  },
};

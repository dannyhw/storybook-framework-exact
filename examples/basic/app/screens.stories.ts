import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, waitFor } from 'storybook/test';

import { Screens } from './screens.contract';

const meta = { title: 'Screens', component: Screens, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Screens>;
export default meta;

type Story = StoryObj<typeof Screens>;

/** An app with routes starts at `/`. */
export const Home: Story = {};

/** `parameters.exact.location` starts it at another of its routes. */
export const AtAFruit: Story = {
  parameters: { exact: { location: '/fruit/pear' } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'pear' })).toBeVisible();
  },
};

/** The app navigates as it does on its own page; the canvas keeps Storybook's address. */
export const ThereAndBack: Story = {
  play: async ({ canvas, userEvent }) => {
    const address = window.location.href;
    await userEvent.click(await canvas.findByRole('button', { name: 'plum' }));
    await expect(await canvas.findByRole('heading', { name: 'plum' })).toBeVisible();
    await expect(window.location.href).toBe(address);
    await userEvent.click(canvas.getByRole('button', { name: 'Back to the fruits' }));
    await waitFor(() => expect(canvas.queryByRole('heading', { name: 'plum' })).toBeNull());
    await expect(canvas.getByRole('heading', { name: 'Fruits' })).toBeVisible();
  },
};

/** A location that is no route of the app shows its `notfound` route. */
export const NoSuchPage: Story = { parameters: { exact: { location: '/vegetables' } } };

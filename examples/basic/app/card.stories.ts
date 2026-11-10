import type { Meta, StoryObj } from 'storybook-framework-exact';

import { Card } from './card.contract';

const meta = { title: 'Card', component: Card, tags: ['autodocs'], args: { title: 'A card', elevated: true } } satisfies Meta;
export default meta;

type Story = StoryObj;

export const Elevated: Story = {};
export const Flat: Story = { args: { elevated: false } };

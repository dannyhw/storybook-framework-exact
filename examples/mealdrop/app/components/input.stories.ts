import type { Meta, StoryObj } from 'storybook-framework-exact';
import { fn } from 'storybook/test';

import { Input } from './input.contract';

const meta = {
  title: 'Components/Form/Input',
  component: Input,
  args: { label: '', name: 'input', value: '', placeholder: '', error: '', keyboard: 'text', change: fn() },
} satisfies Meta<typeof Input>;
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: { label: 'Input field' },
};

export const WithHint: Story = {
  args: { ...WithLabel.args, placeholder: 'This is a hint' },
};

export const Filled: Story = {
  args: { ...WithLabel.args, value: 'Already filled text' },
};

export const ErrorValidation: Story = {
  args: { label: 'Input field', value: 'jane@doecom', error: 'email should be valid' },
};

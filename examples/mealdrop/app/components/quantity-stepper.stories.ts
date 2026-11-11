import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn, waitFor } from 'storybook/test';

// Mealdrop shows the stepper only inside its food item modal; this story keeps it built and checked.
import { QuantityStepper } from './quantity-stepper.contract';

const meta = {
  title: 'Components/QuantityStepper',
  component: QuantityStepper,
  args: { value: 1, min: 1, max: 10, label: 'quantity', change: fn() },
} satisfies Meta<typeof QuantityStepper>;
export default meta;

type Story = StoryObj<typeof QuantityStepper>;

export const Default: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await expect(await canvas.findByRole('button', { name: 'decrease quantity by one' })).toBeDisabled();
    await userEvent.click(await canvas.findByRole('button', { name: 'increase quantity by one' }));
    await waitFor(() => expect(args.change).toHaveBeenCalledWith(2));
  },
};
export const AtMaximum: Story = { args: { value: 10 } };

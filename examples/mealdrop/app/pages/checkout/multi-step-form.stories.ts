import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect, fn, waitFor } from 'storybook/test';

import { MultiStepForm } from './multi-step-form.contract';

const meta = {
  title: 'Pages/CheckoutPage/Components/MultiStepForm',
  component: MultiStepForm,
  args: { complete: fn() },
} satisfies Meta<typeof MultiStepForm>;
export default meta;

type Story = StoryObj<typeof MultiStepForm>;

// Mealdrop's story has no play function; this one tries each step empty, then fills it through to the end.
export const Default: Story = {
  play: async ({ canvas, args, userEvent, step }) => {
    await step('Contact details', async () => {
      await userEvent.click(await canvas.findByRole('button', { name: 'Next' }));
      await waitFor(() => expect(canvas.getByTestId('input-firstName-error')).toHaveTextContent('Required'));
      await userEvent.type(canvas.getByLabelText('First name'), 'J');
      await waitFor(() =>
        expect(canvas.getByTestId('input-firstName-error')).toHaveTextContent('Must be at least 2 characters'),
      );
      await userEvent.type(canvas.getByLabelText('First name'), 'ohn');
      await userEvent.type(canvas.getByLabelText('Last name'), 'Doe');
      await userEvent.type(canvas.getByLabelText('Email'), 'john@doe');
      await waitFor(() =>
        expect(canvas.getByTestId('input-email-error')).toHaveTextContent('Please enter a valid email address'),
      );
      await userEvent.type(canvas.getByLabelText('Email'), '.com');
      await userEvent.type(canvas.getByLabelText('Phone number'), '0612345678');
      await waitFor(() => expect(canvas.getByTestId('input-phone-error')).toHaveTextContent(''));
      await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    });

    await step('Delivery details', async () => {
      await expect(await canvas.findByText('Step 2 of 2')).toBeInTheDocument();
      await userEvent.type(canvas.getByLabelText('Streetname and housenumber'), 'Damrak, 1');
      await userEvent.type(canvas.getByLabelText('Postcode'), '1012ab');
      await userEvent.type(canvas.getByLabelText('City'), 'Amsterdam');
      await userEvent.click(canvas.getByRole('button', { name: 'Complete order' }));
      await waitFor(() =>
        expect(canvas.getByTestId('input-postcode-error')).toHaveTextContent(
          'Please enter a valid postcode (e.g., 1234AB)',
        ),
      );
      await expect(args.complete).not.toHaveBeenCalled();
      await userEvent.clear(canvas.getByLabelText('Postcode'));
      await userEvent.type(canvas.getByLabelText('Postcode'), '1012AB');
      await userEvent.click(canvas.getByRole('button', { name: 'Complete order' }));
      await waitFor(() =>
        expect(args.complete).toHaveBeenCalledWith(
          'John',
          'Doe',
          'john@doe.com',
          '0612345678',
          'Damrak, 1',
          '1012AB',
          'Amsterdam',
        ),
      );
    });
  },
};

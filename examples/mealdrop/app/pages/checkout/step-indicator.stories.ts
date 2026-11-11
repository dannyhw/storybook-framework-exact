import type { Meta, StoryObj } from 'storybook-framework-exact';

import { StepIndicator } from './step-indicator.contract';

const meta = {
  title: 'Pages/CheckoutPage/Components/StepIndicator',
  component: StepIndicator,
} satisfies Meta<typeof StepIndicator>;
export default meta;

export const Default: StoryObj<typeof StepIndicator> = {
  args: { title: 'Step', amountOfSteps: 4, currentStep: 1 },
};

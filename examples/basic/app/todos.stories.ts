import type { Meta, StoryObj } from 'storybook-framework-exact';
import { expect } from 'storybook/test';

import { Todos } from './todos.contract';

type Todo = { id: string; title: string; done: boolean };

/** An in-memory stand-in for the app's `app.ts`: the sources `Todos` asks, one store per story. */
const store = (initial: Todo[]) => {
  let todos = initial;
  let next = initial.length + 1;
  return {
    todos: () => todos,
    addTodo: (title: string) => ((todos = [...todos, { id: String(next++), title, done: false }]), { count: todos.length }),
    setDone: (id: string, done: boolean) => ((todos = todos.map((t) => (t.id === id ? { ...t, done } : t))), { count: todos.length }),
    removeTodo: (id: string) => ((todos = todos.filter((t) => t.id !== id)), { count: todos.length }),
  };
};

const meta = { title: 'Todos', component: Todos } satisfies Meta<typeof Todos>;
export default meta;

type Story = StoryObj<typeof Todos>;

export const Empty: Story = { parameters: { exact: { sources: store([]) } } };

export const Seeded: Story = {
  parameters: {
    exact: {
      sources: store([
        { id: '1', title: 'Buy milk', done: false },
        { id: '2', title: 'Walk the dog', done: true },
      ]),
    },
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText('1 left')).toBeVisible();
    await userEvent.click(canvas.getByLabelText('Buy milk'));
    await expect(await canvas.findByText('0 left')).toBeVisible();
    await userEvent.click(canvas.getAllByRole('button', { name: 'Delete' })[1]!);
    await expect(canvas.queryByText('Walk the dog')).toBeNull();
  },
};

/** A source may answer later: the list waits for it. */
export const SlowAnswer: Story = {
  parameters: {
    exact: {
      sources: {
        ...store([]),
        todos: () => new Promise((done) => setTimeout(() => done([{ id: '1', title: 'Arrived after 800 ms', done: false }]), 800)),
      },
    },
  },
};

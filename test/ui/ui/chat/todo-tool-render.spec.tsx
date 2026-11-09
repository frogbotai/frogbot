import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TodoToolRender } from '../../../../packages/ui/src/exports/chat-tools';

const todos = [
  { content: 'Plan work', status: 'completed' as const },
  { content: 'Ship work', status: 'in_progress' as const },
  { content: 'Review work', status: 'pending' as const },
];

describe('TodoToolRender', () => {
  it.each([
    ['write_todos', { input: { todos }, output: undefined }],
    ['read_todos', { input: {}, output: todos }],
  ])('renders %s todo data', (toolName, values) => {
    render(
      <TodoToolRender
        part={{
          type: 'dynamic-tool',
          toolName,
          toolCallId: '1',
          state: 'output-available',
          ...values,
        }}
      />,
    );

    expect(screen.getByText('2 pending')).toBeTruthy();
    expect(screen.getByText('1 completed')).toBeTruthy();
    expect(screen.getByText('Plan work').className).toContain('completed');
    expect(screen.getByLabelText('in progress')).toBeTruthy();
  });

  it('renders the list as a tool card with the glowing spinner on the current task', () => {
    const { container } = render(
      <TodoToolRender
        part={{
          type: 'dynamic-tool',
          toolName: 'write_todos',
          toolCallId: '1',
          state: 'output-available',
          input: { todos },
          output: undefined,
        }}
      />,
    );

    expect(container.querySelector('section')?.className).toBe('fb-tool-card fb-todo-tool');
    expect(screen.getByText('Plan work').className).toBe(
      'fb-todo-tool__content fb-todo-tool__content--completed',
    );
    expect(container.querySelectorAll('.fb-glow-spinner')).toHaveLength(1);
    expect(
      screen.getByLabelText('in progress').querySelector('.fb-glow-spinner__ring'),
    ).toBeTruthy();
    expect(screen.getByLabelText('pending').childElementCount).toBe(0);
  });

  it('keeps each task row when the list reorders', () => {
    const part = (list: typeof todos) => ({
      type: 'dynamic-tool' as const,
      toolName: 'write_todos',
      toolCallId: '1',
      state: 'output-available' as const,
      input: { todos: list },
      output: undefined,
    });

    const { rerender } = render(<TodoToolRender part={part(todos)} />);
    const row = screen.getByText('Ship work').parentElement;

    rerender(<TodoToolRender part={part([todos[1], todos[0], todos[2]])} />);

    expect(screen.getByText('Ship work').parentElement).toBe(row);
  });

  it('renders duplicate task names', () => {
    const duplicate = { content: 'Ship work', status: 'pending' as const };

    render(
      <TodoToolRender
        part={{
          type: 'dynamic-tool',
          toolName: 'write_todos',
          toolCallId: '1',
          state: 'output-available',
          input: { todos: [...todos, duplicate] },
          output: undefined,
        }}
      />,
    );

    expect(screen.getAllByText('Ship work')).toHaveLength(2);
  });

  it('renders an empty task list', () => {
    render(
      <TodoToolRender
        part={{
          type: 'dynamic-tool',
          toolName: 'read_todos',
          toolCallId: '1',
          state: 'output-available',
          input: {},
          output: [],
        }}
      />,
    );

    expect(screen.getByText('0 pending')).toBeTruthy();
    expect(screen.getByText('0 completed')).toBeTruthy();
  });
});

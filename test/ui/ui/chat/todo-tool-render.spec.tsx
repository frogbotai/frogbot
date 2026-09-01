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

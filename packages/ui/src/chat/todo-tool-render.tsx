'use client';

import type { ToolRendererProps } from './tool-registry.js';

type Todo = {
  content: string;
  status: 'completed' | 'in_progress' | 'pending';
};

const isTodo = (value: unknown): value is Todo => {
  if (!value || typeof value !== 'object') return false;
  const todo = value as Record<string, unknown>;
  return (
    typeof todo.content === 'string' &&
    (todo.status === 'completed' || todo.status === 'in_progress' || todo.status === 'pending')
  );
};

export function TodoToolRender({ part }: ToolRendererProps) {
  const input = part.input as { todos?: unknown } | undefined;
  const source = Array.isArray(part.output)
    ? part.output
    : Array.isArray(input?.todos)
      ? input.todos
      : [];
  const todos = source.filter(isTodo);
  const completed = todos.filter(({ status }) => status === 'completed').length;

  return (
    <section className="fb-todo-tool">
      <header className="fb-todo-tool__header">
        <h5 className="fb-todo-tool__title">Task List</h5>
        <div className="fb-todo-tool__summary">
          <span>{todos.length - completed} pending</span>
          <span aria-hidden="true">&bull;</span>
          <span>{completed} completed</span>
        </div>
      </header>
      <div className="fb-todo-tool__items">
        {todos.map((todo, index) => (
          <div className="fb-todo-tool__item" key={index}>
            <span
              aria-label={todo.status.replace('_', ' ')}
              className={`fb-todo-tool__status fb-todo-tool__status--${todo.status}`}
            />
            <span
              className={
                todo.status === 'completed'
                  ? 'fb-todo-tool__content fb-todo-tool__content--completed'
                  : 'fb-todo-tool__content'
              }
            >
              {todo.content}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

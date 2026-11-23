import { describe, expect, it } from 'vitest';

import { syncDone } from '../../../templates/asana/src/hooks/tasks';

describe('asana template: completed and the Done status', () => {
  it.each([
    {
      name: 'completing a task moves it to Done',
      data: { completed: true },
      previous: { completed: false, status: 'in-progress' },
      expected: { completed: true, status: 'done' },
    },
    {
      name: 'uncompleting a Done task moves it back to To do',
      data: { completed: false },
      previous: { completed: true, status: 'done' },
      expected: { completed: false, status: 'todo' },
    },
    {
      name: 'uncompleting leaves a status other than Done alone',
      data: { completed: false, status: 'in-review' },
      previous: { completed: true, status: 'in-review' },
      expected: { completed: false, status: 'in-review' },
    },
    {
      name: 'moving to Done completes the task',
      data: { status: 'done' },
      previous: { completed: false, status: 'todo' },
      expected: { completed: true, status: 'done' },
    },
    {
      name: 'moving out of Done uncompletes the task',
      data: { status: 'in-progress' },
      previous: { completed: true, status: 'done' },
      expected: { completed: false, status: 'in-progress' },
    },
    {
      name: 'completed wins when both change in one save',
      data: { completed: true, status: 'todo' },
      previous: { completed: false, status: 'in-progress' },
      expected: { completed: true, status: 'done' },
    },
    {
      name: 'uncompleted wins over a move to Done in the same save',
      data: { completed: false, status: 'done' },
      previous: { completed: true, status: 'in-review' },
      expected: { completed: false, status: 'todo' },
    },
    {
      name: 'a new task created as Done is completed',
      data: { status: 'done' },
      previous: undefined,
      expected: { completed: true, status: 'done' },
    },
    {
      name: 'a new task created completed is Done',
      data: { completed: true, status: 'todo' },
      previous: undefined,
      expected: { completed: true, status: 'done' },
    },
    {
      name: 'a save that changes neither leaves both alone',
      data: { completed: true, status: 'done', title: 'Renamed' },
      previous: { completed: true, status: 'done' },
      expected: { completed: true, status: 'done', title: 'Renamed' },
    },
  ])('$name', ({ data, previous, expected }) => {
    expect(syncDone(data, previous)).toEqual(expected);
  });
});

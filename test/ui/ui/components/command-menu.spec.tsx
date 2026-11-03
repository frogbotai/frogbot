import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  CommandMenu,
  type CommandMenuGroup,
  type CommandMenuProps,
} from '../../../../packages/ui/src/index';

const groups: CommandMenuGroup[] = [
  { id: 'go', items: [{ id: 'home', label: 'Home' }] },
  {
    id: 'tasks',
    items: [
      { id: 'task-1', label: 'Write docs' },
      { id: 'task-2', label: 'Ship it' },
    ],
    label: 'Tasks',
  },
];

function Harness(props: Partial<CommandMenuProps>) {
  const [value, setValue] = useState('');

  return (
    <CommandMenu
      emptyText="No results found"
      groups={groups}
      label="Command palette"
      placeholder="Search"
      value={value}
      onSelect={vi.fn()}
      onValueChange={setValue}
      {...props}
    />
  );
}

const input = () => screen.getByRole('combobox');
const activeLabel = () =>
  document.getElementById(input().getAttribute('aria-activedescendant') ?? '')?.textContent;

describe('CommandMenu', () => {
  it('renders a combobox that controls a listbox of grouped options', () => {
    render(<Harness />);

    const listbox = screen.getByRole('listbox', { name: 'Command palette' });

    expect(input().getAttribute('aria-controls')).toBe(listbox.id);
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('group', { name: 'Tasks' }).className).toBe('fb-command-menu__group');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Home',
      'Write docs',
      'Ship it',
    ]);
    expect(activeLabel()).toBe('Home');
    expect(screen.getByRole('option', { name: 'Home' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: 'Home' }).className).toContain(
      'fb-command-menu__item--active',
    );
  });

  it('moves one active option across groups with the arrow keys and wraps', () => {
    render(<Harness />);
    input().focus();

    fireEvent.keyDown(input(), { key: 'ArrowDown' });

    expect(activeLabel()).toBe('Write docs');

    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });

    expect(activeLabel()).toBe('Home');

    fireEvent.keyDown(input(), { key: 'ArrowUp' });

    expect(activeLabel()).toBe('Ship it');
    expect(document.activeElement).toBe(input());
  });

  it('selects with Enter, passing meta for Cmd or Ctrl', () => {
    const onSelect = vi.fn();

    render(<Harness onSelect={onSelect} />);

    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.keyDown(input(), { key: 'Enter', metaKey: true });
    fireEvent.keyDown(input(), { ctrlKey: true, key: 'Enter' });

    expect(onSelect.mock.calls).toEqual([
      [{ id: 'task-1', label: 'Write docs' }, { meta: false }],
      [{ id: 'task-1', label: 'Write docs' }, { meta: true }],
      [{ id: 'task-1', label: 'Write docs' }, { meta: true }],
    ]);
  });

  it('selects on click without moving focus out of the input', () => {
    const onSelect = vi.fn();

    render(<Harness onSelect={onSelect} />);
    input().focus();

    const option = screen.getByRole('option', { name: 'Ship it' });

    fireEvent.mouseMove(option);

    expect(activeLabel()).toBe('Ship it');

    expect(fireEvent.mouseDown(option)).toBe(false);

    fireEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith({ id: 'task-2', label: 'Ship it' }, { meta: false });
    expect(document.activeElement).toBe(input());
  });

  it('keeps the active option when groups change, and resets it on typing', () => {
    const { rerender } = render(<Harness />);

    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    rerender(<Harness groups={[{ id: 'new', items: [{ id: 'x', label: 'New' }] }, ...groups]} />);

    expect(activeLabel()).toBe('Write docs');

    fireEvent.change(input(), { target: { value: 's' } });

    expect(activeLabel()).toBe('New');
  });

  it('shows the empty status only when nothing is listed or loading', () => {
    const { rerender } = render(<Harness groups={[]} />);

    expect(screen.getByRole('status').textContent).toBe('No results found');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);

    rerender(<Harness groups={[{ id: 'tasks', items: [], label: 'Tasks', loading: true }]} />);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('group', { name: 'Tasks' }).getAttribute('aria-busy')).toBe('true');
    expect(document.querySelectorAll('.fb-command-menu__skeleton')).toHaveLength(2);
  });

  it('hides empty groups and renders the footer for the active option', () => {
    render(
      <Harness
        footer={(active) => <span>Active: {active?.id}</span>}
        groups={[{ id: 'empty', items: [], label: 'Empty' }, ...groups]}
      />,
    );

    expect(screen.queryByRole('group', { name: 'Empty' })).toBeNull();
    expect(screen.getByText('Active: home')).not.toBeNull();
  });
});

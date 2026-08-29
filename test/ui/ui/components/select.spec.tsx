import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../packages/ui/src/index';

it('preserves Select classes and keyboard behavior', async () => {
  const user = userEvent.setup();
  const onValueChange = vi.fn();
  render(
    <Select onValueChange={onValueChange}>
      <SelectTrigger aria-label="Choice" className="custom-trigger">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="custom-content">
        <SelectItem value="one" className="custom-item">
          One
        </SelectItem>
        <SelectItem value="two">Two</SelectItem>
      </SelectContent>
    </Select>,
  );

  const trigger = screen.getByRole('combobox');
  expect(trigger.className).toBe('fb-select__trigger custom-trigger');
  expect(trigger.querySelector('svg')?.classList.contains('fb-select__trigger-icon')).toBe(true);

  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });

  const content = await screen.findByRole('listbox');
  expect(content.className).toContain('fb-select__content custom-content');
  expect(screen.getByRole('option', { name: 'One' }).className).toContain(
    'fb-select__item custom-item',
  );

  await user.keyboard('{ArrowDown}{Enter}');
  expect(onValueChange).toHaveBeenCalled();
});

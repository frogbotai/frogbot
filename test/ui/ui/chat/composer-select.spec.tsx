import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ComposerSelect } from '../../../../packages/ui/src/chat/composer-select';

const options = [
  { value: 'build', label: 'Build', icon: 'wrench' as const },
  { value: 'plan', label: 'Plan', icon: 'check-list' as const },
  { value: 'auto', label: 'Auto' },
];

describe('ComposerSelect', () => {
  it("shows the selected option's icon and label, and marks it in the menu", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<ComposerSelect value="plan" options={options} onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: /Plan/ });

    expect(trigger.querySelector('.lucide-check-list-icon')).toBeTruthy();

    await user.click(trigger);

    expect(
      screen.getByRole('menuitem', { name: /Plan/ }).querySelector('.fb-composer-select__check'),
    ).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: /Build/ }).querySelector('.fb-composer-select__check'),
    ).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Auto/ }).querySelector('svg')).toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: /Build/ }));

    expect(onChange).toHaveBeenCalledWith('build');
  });

  it('shows the value when no option matches, and keeps its own class', () => {
    render(
      <ComposerSelect
        value="custom"
        options={options}
        onChange={() => undefined}
        aria-label="Mode"
        className="app-mode"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Mode' });

    expect(trigger.textContent).toBe('custom');
    expect(trigger.className).toContain('fb-composer-select__trigger');
    expect(trigger.className).toContain('app-mode');
  });
});

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WorkingIndicator } from '../../../../packages/ui/src/chat/working';

describe('WorkingIndicator', () => {
  it('keeps its row when idle, hidden from screen readers and with nothing to announce', () => {
    const { container } = render(<WorkingIndicator active={false} />);

    const row = container.firstElementChild!;

    expect(row.className).toBe('fb-working');
    expect(row.getAttribute('aria-hidden')).toBe('true');
    expect(row.hasAttribute('data-active')).toBe(false);
    expect(row.querySelector('[role=status]')?.textContent).toBe('');
    expect(row.querySelector('.fb-working__logo svg')).not.toBeNull();
  });

  it('announces Working once while active, with the logo itself hidden', () => {
    const { container, rerender } = render(<WorkingIndicator active />);

    const row = container.firstElementChild!;
    const status = row.querySelector('[role=status]')!;

    expect(row.hasAttribute('aria-hidden')).toBe(false);
    expect(row.hasAttribute('data-active')).toBe(true);
    expect(status.textContent).toBe('Working');
    expect(row.querySelector('.fb-working__logo')?.getAttribute('aria-hidden')).toBe('true');

    rerender(<WorkingIndicator active />);

    expect(row.querySelector('[role=status]')).toBe(status);
  });
});

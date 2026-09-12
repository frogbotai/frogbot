import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileNavToggle } from '../../../../../packages/next/src/elements/Nav/MobileNavToggle';

describe('MobileNavToggle', () => {
  it('opens the drawer while it is closed', () => {
    const onOpen = vi.fn();
    render(<MobileNavToggle navState="mobile-nav-closed" onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it.each(['mobile-nav-open', 'desktop-nav-open', 'desktop-nav-closed'] as const)(
    'is absent in the %s state',
    (navState) => {
      render(<MobileNavToggle navState={navState} onOpen={vi.fn()} />);

      expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
    },
  );
});

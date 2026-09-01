import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileNavToggle } from '../../../../../packages/next/src/elements/Nav/MobileNavToggle';

function setMobile(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener: vi.fn(),
    matches: query === '(max-width: 767px)' && matches,
    removeEventListener: vi.fn(),
  }));
}

describe('MobileNavToggle', () => {
  it('opens the nav on mobile while it is closed', () => {
    setMobile(true);
    const onOpen = vi.fn();
    render(<MobileNavToggle navOpen={false} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('is absent while the mobile nav is open', () => {
    setMobile(true);
    render(<MobileNavToggle navOpen onOpen={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  });

  it('is absent outside the mobile breakpoint', () => {
    setMobile(false);
    render(<MobileNavToggle navOpen={false} onOpen={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  });
});

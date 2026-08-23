import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./NavSection', () => ({
  NavSection: ({ children, title }: React.PropsWithChildren<{ title: string }>) => (
    <section aria-label={title}>{children}</section>
  ),
}));

import { NavSection, RecentsSection } from '../../index';

describe('RecentsSection', () => {
  it('renders the empty state through the public export', () => {
    render(<RecentsSection />);

    expect(screen.getByRole('region', { name: 'Recents' })).not.toBeNull();
    expect(screen.getByText('No recent chats')).not.toBeNull();
  });

  it('allows a replacement to compose the public section primitive', () => {
    function CustomRecentsSection() {
      return (
        <NavSection id="custom-recents" title="Recent work">
          Custom body
        </NavSection>
      );
    }

    render(<CustomRecentsSection />);

    expect(screen.getByRole('region', { name: 'Recent work' })).not.toBeNull();
    expect(screen.getByText('Custom body')).not.toBeNull();
  });
});

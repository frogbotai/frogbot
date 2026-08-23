import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@frogbotai/next', () => ({
  NavSection: ({ children, title }: React.PropsWithChildren<{ title: string }>) => (
    <section aria-label={title}>{children}</section>
  ),
}));

import { admin } from './fixtures/consumer/config';
import { RecentsSection } from './fixtures/consumer/RecentsSection';

describe('navigation section acceptance', () => {
  it('compiles, registers, and renders a copied section using public exports', () => {
    render(<RecentsSection />);

    expect(admin.nav.sections).toEqual(['./RecentsSection#RecentsSection']);
    expect(screen.getByRole('region', { name: 'Recents' })).not.toBeNull();
    expect(screen.getByText('No recent chats')).not.toBeNull();
  });
});

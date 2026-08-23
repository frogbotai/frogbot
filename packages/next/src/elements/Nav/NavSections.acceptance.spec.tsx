import { render, screen } from '@testing-library/react';
import type { PayloadRequest, ServerProps } from 'payload';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@frogbotai/next', () => ({
  NavSection: ({ children, title }: React.PropsWithChildren<{ title: string }>) => (
    <section aria-label={title}>{children}</section>
  ),
}));

vi.mock('@frogbotai/next/client', () => ({
  RecentsSectionClient: ({ collectionPath }: { collectionPath: string }) => (
    <a href={collectionPath}>View all</a>
  ),
}));

vi.mock('frogbot', () => ({
  getCachedFrogbot: () => ({
    config: { chat: { enabled: true, chatsSlug: 'custom-chats' } },
  }),
}));

import { admin } from './fixtures/consumer/config';
import { RecentsSection } from './fixtures/consumer/RecentsSection';

describe('navigation section acceptance', () => {
  it('compiles, registers, and renders a copied section using public exports', async () => {
    const req = { user: { id: 'user-1' } } as PayloadRequest;
    const props = {
      i18n: {},
      payload: {
        config: { routes: { admin: '/control' } },
        find: vi.fn().mockResolvedValue({ docs: [] }),
      },
      req,
      user: req.user,
    } as unknown as { req: PayloadRequest } & ServerProps;
    render(await RecentsSection(props));

    expect(admin.nav.sections).toEqual(['./RecentsSection#RecentsSection']);
    expect(screen.getByRole('region', { name: 'Recents' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'View all' }).getAttribute('href')).toBe(
      '/control/collections/custom-chats',
    );
  });
});

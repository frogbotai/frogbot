import { render, screen } from '@testing-library/react';
import type { PayloadRequest, ServerProps } from 'payload';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FrogBotNav } from '../../../../../packages/next/src/elements/Nav/index';

vi.mock('@payloadcms/ui', () => ({
  Account: () => <span />,
}));

vi.mock('frogbot', () => ({
  getCachedFrogBot: () => ({ config: { chat: { enabled: false } } }),
}));

vi.mock('../../../../../packages/next/src/elements/Nav/index.client', () => ({
  FrogBotNavClient: ({ sections }: { sections?: ReactNode }) => <nav>{sections}</nav>,
}));

const sectionPath = './NavSection#VisibleEntitiesSection';

function VisibleEntitiesSection({ visibleEntities }: ServerProps) {
  return <p>{visibleEntities?.collections.join(', ')}</p>;
}

function props() {
  const req = { user: { collection: 'users', id: 'user-1' } } as PayloadRequest;
  const find = vi.fn().mockResolvedValue({ docs: [] });

  req.payload = { find } as unknown as PayloadRequest['payload'];

  return {
    i18n: { t: (key: string) => key },
    payload: {
      config: {
        admin: {
          components: { navSections: [sectionPath] },
          routes: { account: '/account', logout: '/logout' },
        },
        collections: [],
        globals: [],
        routes: { admin: '/admin' },
      },
      find,
      importMap: { [sectionPath]: VisibleEntitiesSection },
    },
    permissions: { collections: {}, globals: {} },
    req,
    user: req.user,
    visibleEntities: { collections: ['posts', 'chats'], globals: [] },
  } as unknown as { req: PayloadRequest } & ServerProps;
}

describe('FrogBotNav', () => {
  it('passes visible entities to configured navigation sections', async () => {
    render(await FrogBotNav(props()));

    expect(screen.getByText('posts, chats')).not.toBeNull();
  });
});

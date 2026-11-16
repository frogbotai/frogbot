import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  RecordComments,
  type RecordCommentsProps,
} from '../../../packages/plugins/plugin-comments/src/rsc/RecordComments.js';

function UserPhoto({ size, user }: { size?: number; user?: { name?: string } }) {
  return <img alt={user?.name} data-size={size} />;
}

const author = { id: 7, email: 'sam@example.com', name: 'Sam Lee' };

const payload = {
  collections: { users: { config: { admin: { useAsTitle: 'name' } } } },
  config: {
    admin: { avatar: { Component: '/components/UserPhoto#UserPhoto' } },
    custom: {
      'plugin-comments': {
        bodies: { deals: 'body_0' },
        commentsSlug: 'comments',
        userSlug: 'users',
      },
    },
  },
  find: () =>
    Promise.resolve({
      docs: [
        {
          id: 1,
          author,
          body: null,
          createdAt: '2026-11-15T12:00:00.000Z',
          updatedAt: '2026-11-15T12:00:00.000Z',
        },
      ],
    }),
  findByID: () => Promise.resolve({ id: 3, createdAt: '2026-11-01T00:00:00.000Z' }),
  importMap: { '/components/UserPhoto#UserPhoto': UserPhoto },
} as unknown as RecordCommentsProps['req']['payload'];

describe('RecordComments', () => {
  it("renders a custom admin.avatar component for each author and the viewer, without Payload's renderComponent", async () => {
    const node = await RecordComments({
      collection: 'deals',
      id: 3,
      req: { payload, user: { id: 9, name: 'Ana Ruiz' } },
    });

    expect(isValidElement(node)).toBe(true);

    const { avatars, gravatar } = (
      node as ReactElement<{ avatars?: Record<string, unknown>; gravatar?: boolean }>
    ).props;

    expect(gravatar).toBe(false);
    expect(Object.keys(avatars ?? {}).sort()).toEqual(['7', '9']);
    expect(renderToStaticMarkup(<>{avatars?.['7']}</>)).toBe('<img alt="Sam Lee" data-size="24"/>');
  });
});

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CreateFirstUserView } from '../../../../../packages/ui/src/admin/views/CreateFirstUser/index.js';

const payloadView = vi.hoisted(() => ({
  element: undefined as unknown,
  props: undefined as unknown,
}));

vi.mock('@payloadcms/ui/views/CreateFirstUser', async () => {
  const { createElement } = await import('react');
  payloadView.element = createElement('div', { 'data-testid': 'payload-view' }, 'Welcome');

  return {
    CreateFirstUserView: (props: unknown) => {
      payloadView.props = props;

      return Promise.resolve(payloadView.element);
    },
  };
});

vi.mock('@payloadcms/ui', () => ({
  Button: ({ el, url, children }: { el: string; url: string; children: ReactNode }) =>
    el === 'anchor' ? <a href={url}>{children}</a> : <span>{children}</span>,
}));

const props = {
  initPageResult: {
    req: {
      payload: {
        config: {
          admin: { user: 'users' },
          routes: { api: '/api', admin: '/admin' },
          collections: [
            {
              slug: 'users',
              auth: { disableLocalStrategy: false },
              custom: {
                frogbot: { signIn: [{ slug: 'google', piece: 'google', label: 'Google' }] },
              },
            },
          ],
        },
      },
    },
  },
  searchParams: { redirect: '/admin/settings' },
};

describe('create-first-user view', () => {
  it("renders Payload's view unchanged, then the divider and sign-in buttons", async () => {
    const view = await CreateFirstUserView(props as never);
    const [first] = view.props.children as unknown[];

    expect(first).toBe(payloadView.element);
    expect(payloadView.props).toBe(props);

    render(view);

    const payload = screen.getByTestId('payload-view');
    const divider = screen.getByText('or');
    const button = screen.getByRole('link', { name: 'Continue with Google' });

    expect(
      payload.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(divider.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.getAttribute('href')).toBe('/api/users/sign-in/google?returnTo=%2Fadmin');
  });
});

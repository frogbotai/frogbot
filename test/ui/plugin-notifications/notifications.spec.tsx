import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationsBellProps } from '../../../packages/plugins/plugin-notifications/src/rsc/NotificationsBell.js';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('@frogbotai/ui/admin', () => ({
  PayloadLink: ({
    children,
    ...props
  }: {
    children: ReactNode;
    className?: string;
    href: string;
  }) => <a {...props}>{children}</a>,
  SetStepNav: () => null,
  toast: { error: vi.fn() },
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  useRouter: () => router,
}));

const { NotificationsBell } =
  await import('../../../packages/plugins/plugin-notifications/src/rsc/NotificationsBell.js');

const { Inbox } =
  await import('../../../packages/plugins/plugin-notifications/src/client/Inbox.js');

const options = { notify: vi.fn(), slug: 'notifications', userSlug: 'users' };

function payload(totalDocs: number, admin = '/admin') {
  const count = vi.fn(() => Promise.resolve({ totalDocs }));

  return {
    count,
    payload: {
      config: { custom: { 'plugin-notifications': options }, routes: { admin } },
      count,
    } satisfies NonNullable<NotificationsBellProps['payload']>,
  };
}

async function bell(props: NotificationsBellProps) {
  const node = await NotificationsBell(props);

  return node ? renderToStaticMarkup(node) : '';
}

describe('NotificationsBell', () => {
  it("counts the user's unread notifications with their access and links to the inbox", async () => {
    const { count, payload: p } = payload(3);
    const html = await bell({ payload: p, req: {}, user: { collection: 'users', id: 7 } });

    expect(html).toContain('href="/admin/notifications"');
    expect(html).toContain('aria-label="Notifications, 3 unread"');
    expect(html).toContain('>3</span>');
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'notifications',
        overrideAccess: false,
        where: { and: [{ user: { equals: 7 } }, { readAt: { exists: false } }] },
      }),
    );
  });

  it('shows no badge at zero, caps it at 99+, and handles a root admin route', async () => {
    const none = await bell({
      payload: payload(0, '/').payload,
      user: { collection: 'users', id: 1 },
    });

    expect(none).toContain('href="/notifications"');
    expect(none).not.toContain('fb-bell__badge');
    expect(
      await bell({ payload: payload(250).payload, user: { collection: 'users', id: 1 } }),
    ).toContain('>99+</span>');
  });

  it('renders nothing signed out, for another auth collection, or without the plugin', async () => {
    expect(await bell({ payload: payload(1).payload, user: null })).toBe('');
    expect(
      await bell({ payload: payload(1).payload, user: { collection: 'customers', id: 1 } }),
    ).toBe('');
    expect(
      await bell({
        payload: { ...payload(1).payload, config: { routes: { admin: '/admin' } } },
        user: { collection: 'users', id: 1 },
      }),
    ).toBe('');
  });
});

describe('Inbox', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    router.push.mockReset();
    router.refresh.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const items = [
    {
      createdAt: '2026-11-15T10:00:00.000Z',
      excerpt: '@Sam can you check the logs?',
      id: 2,
      link: '/admin/collections/deals/1',
      title: 'Ana mentioned you in a comment',
    },
    {
      createdAt: '2026-11-14T10:00:00.000Z',
      id: 1,
      link: '/admin',
      readAt: '2026-11-14T11:00:00.000Z',
      title: 'Job failed',
    },
  ];

  it('marks unread items and shows the excerpt', () => {
    render(<Inbox items={items} slug="notifications" />);

    const unread = screen.getByRole('button', { name: /Ana mentioned you/ });

    expect(unread.className).toContain('fb-inbox__item--unread');
    expect(unread.textContent).toContain('@Sam can you check the logs?');
    expect(screen.getByRole('button', { name: /Job failed/ }).className).not.toContain('--unread');
  });

  it('opening an unread item marks it read, then follows its link', async () => {
    render(<Inbox items={items} slug="notifications" />);

    const unread = screen.getByRole('button', { name: /Ana mentioned you/ });

    fireEvent.click(unread);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/admin/collections/deals/1'));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/api/notifications/2');
    expect(init.method).toBe('PATCH');
    expect(Object.keys(JSON.parse(String(init.body)))).toEqual(['readAt']);
    expect(unread.className).not.toContain('--unread');
  });

  it("opening a read item doesn't write, and a failed write keeps the item unread", async () => {
    render(<Inbox items={items} slug="notifications" />);

    fireEvent.click(screen.getByRole('button', { name: /Job failed/ }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/admin'));

    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(new Response('{}', { status: 403 }));

    const unread = screen.getByRole('button', { name: /Ana mentioned you/ });

    fireEvent.click(unread);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(unread.className).toContain('--unread');
  });

  it('never navigates to a link that is not an admin path or a web URL', async () => {
    render(
      <Inbox
        items={[
          {
            createdAt: items[1].createdAt,
            id: 3,
            link: 'javascript:alert(1)',
            title: 'Odd',
            readAt: 'x',
          },
        ]}
        slug="notifications"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Odd/ }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());

    expect(router.push).not.toHaveBeenCalled();
  });

  it('says so when there are none', () => {
    render(<Inbox items={[]} slug="notifications" />);

    expect(screen.getByText('No notifications yet.')).toBeTruthy();
  });
});

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PayloadRequest, ServerProps } from 'payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const find = vi.fn();
const fetch = vi.fn();
let pathname = '/control';
const push = vi.fn();

vi.mock('next/navigation.js', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

vi.mock('@payloadcms/ui', () => ({
  Link: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  useTheme: () => ({ theme: 'light' }),
}));

vi.mock('frogbot', () => ({
  getCachedFrogbot: () => ({
    config: { chat: { enabled: true, chatsSlug: 'conversations', messagesSlug: 'turns' } },
  }),
}));

vi.mock('../../../../../packages/next/src/elements/Nav/NavSection', () => ({
  NavSection: ({ children, title }: React.PropsWithChildren<{ title: string }>) => (
    <section aria-label={title}>{children}</section>
  ),
}));

vi.mock('../../../../../packages/next/src/elements/Nav/NavItem', () => ({
  NavItem: ({ active, label, path }: { active?: boolean; label: string; path: string }) => (
    <a aria-current={active ? 'page' : undefined} href={path}>
      {label}
    </a>
  ),
}));

import { bucketRecents } from '../../../../../packages/next/src/elements/Nav/RecentsSection.client';
import { NavSection, RecentsSection } from '../../../../../packages/next/src/index';

function props(): { req: PayloadRequest } & ServerProps {
  const req = { user: { id: 'user-1' } } as PayloadRequest;
  return {
    i18n: {} as ServerProps['i18n'],
    payload: {
      config: { routes: { admin: '/control' } },
      find,
    },
    req,
    user: req.user,
  } as unknown as { req: PayloadRequest } & ServerProps;
}

describe('RecentsSection', () => {
  beforeEach(() => {
    fetch.mockReset();
    find.mockReset();
    pathname = '/control';
    push.mockReset();
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
  });

  it('queries with authenticated access and renders normalized seeds on first paint', async () => {
    find.mockResolvedValueOnce({
      docs: [
        { id: 'chat/1', title: 'Latest chat' },
        { id: 2, title: null },
      ],
    });
    const componentProps = props();
    render(await RecentsSection(componentProps));

    expect(screen.getByRole('region', { name: 'Recents' })).not.toBeNull();
    expect(find).toHaveBeenCalledWith({
      collection: 'conversations',
      depth: 0,
      limit: 30,
      overrideAccess: false,
      req: componentProps.req,
      sort: '-lastMessageAt',
    });
    expect(screen.getByRole('link', { name: 'Latest chat' }).getAttribute('href')).toBe(
      '/control/collections/conversations/chat%2F1',
    );
    expect(screen.getByRole('link', { name: 'Untitled' }).getAttribute('href')).toBe(
      '/control/collections/conversations/2',
    );
    expect(screen.getByRole('link', { name: 'View all' }).getAttribute('href')).toBe(
      '/control/collections/conversations',
    );
    expect(screen.getAllByRole('button', { name: 'Chat actions' })).toHaveLength(2);
  });

  it('renders the empty state without querying when unauthenticated', async () => {
    find.mockClear();
    const componentProps = props();
    componentProps.req.user = null;
    render(await RecentsSection(componentProps));

    expect(find).not.toHaveBeenCalled();
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

  it('keeps the server seed and refreshes immediately after a chat mutation', async () => {
    vi.stubGlobal('fetch', fetch);
    fetch.mockResolvedValueOnce(
      Response.json({
        docs: [{ id: 'new', title: 'New chat', agent: 'general' }],
        page: 1,
        totalDocs: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      }),
    );
    find.mockResolvedValueOnce({ docs: [{ id: 'seed', title: 'Seed chat', agent: 'general' }] });
    render(await RecentsSection(props()));

    expect(screen.getByRole('link', { name: 'Seed chat' })).not.toBeNull();
    await act(async () => window.dispatchEvent(new Event('frogbot:chats:mutated')));

    expect(await screen.findByRole('link', { name: 'New chat' })).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('confirms deletion and leaves an active recent document', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', fetch);
    fetch
      .mockResolvedValueOnce(
        Response.json({
          docs: [],
          page: 1,
          totalDocs: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          docs: [],
          page: 1,
          totalDocs: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    find.mockResolvedValueOnce({ docs: [{ id: 'seed', title: 'Seed chat', agent: 'general' }] });
    pathname = '/control/collections/conversations/seed';
    render(await RecentsSection(props()));

    await user.click(screen.getByRole('button', { name: 'Chat actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/control/collections/conversations'));
    vi.unstubAllGlobals();
  });

  it('revalidates on focus and the refresh interval', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetch);
    const result = {
      docs: [],
      page: 1,
      totalDocs: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    };
    fetch.mockResolvedValue(Response.json(result));
    find.mockResolvedValueOnce({ docs: [] });
    render(await RecentsSection(props()));

    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));

    expect(fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('buckets exact local-day boundaries and omits empty groups', () => {
    const now = new Date(2026, 7, 23, 12);
    const at = (days: number, offset = 0) => new Date(2026, 7, 23 - days).getTime() + offset;
    const docs = [
      { id: 'today', agent: '', lastMessageAt: new Date(at(0)).toISOString() },
      { id: 'today-before', agent: '', lastMessageAt: new Date(at(0, -1)).toISOString() },
      { id: 'yesterday', agent: '', lastMessageAt: new Date(at(1)).toISOString() },
      { id: 'yesterday-before', agent: '', lastMessageAt: new Date(at(1, -1)).toISOString() },
      { id: 'seven-after', agent: '', lastMessageAt: new Date(at(7, 1)).toISOString() },
      { id: 'seven', agent: '', lastMessageAt: new Date(at(7)).toISOString() },
      { id: 'thirty-after', agent: '', lastMessageAt: new Date(at(30, 1)).toISOString() },
      { id: 'thirty', agent: '', lastMessageAt: new Date(at(30)).toISOString() },
    ];

    expect(
      bucketRecents(docs, now).map(({ label, docs: bucketDocs }) => [
        label,
        bucketDocs.map(({ id }) => id),
      ]),
    ).toEqual([
      ['Today', ['today']],
      ['Yesterday', ['today-before', 'yesterday']],
      ['Previous 7 days', ['yesterday-before', 'seven-after']],
      ['Previous 30 days', ['seven', 'thirty-after']],
      ['Older', ['thirty']],
    ]);
    expect(bucketRecents([docs[0]!], now).map(({ label }) => label)).toEqual(['Today']);
  });

  it('renders nonempty groups in order and tracks the active admin route', async () => {
    find.mockResolvedValue({
      docs: [
        { id: 'today', title: 'Today chat', agent: '', lastMessageAt: new Date().toISOString() },
        { id: 'old', title: 'Old chat', agent: '', lastMessageAt: '2020-01-01T00:00:00.000Z' },
      ],
    });
    pathname = '/control/collections/conversations/today';
    const view = render(await RecentsSection(props()));

    expect(screen.getAllByRole('heading').map(({ textContent }) => textContent)).toEqual([
      'Today',
      'Older',
    ]);
    expect(screen.getByRole('link', { name: 'Today chat' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Old chat' }).getAttribute('aria-current')).toBeNull();

    pathname = '/control/collections/conversations/old';
    view.rerender(await RecentsSection(props()));
    expect(screen.getByRole('link', { name: 'Old chat' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryView } from '../../../../../packages/ui/src/admin/views/Memory/index.js';
import { MemoryViewClient } from '../../../../../packages/ui/src/admin/views/Memory/MemoryView.client.js';
import type { MemoryItem } from '../../../../../packages/ui/src/admin/views/Memory/types.js';

const getCachedFrogBot = vi.hoisted(() => vi.fn<() => unknown>());

vi.mock('frogbot', () => ({ getCachedFrogBot }));

const tea: MemoryItem = {
  id: 'm/1',
  key: 'drink',
  text: 'Drinks green tea',
  pinned: true,
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const trains: MemoryItem = {
  id: 'm2',
  text: 'Likes trains',
  pinned: false,
  updatedAt: '2026-11-02T00:00:00.000Z',
};

const props = {
  apiPath: '/custom-api/frogbot/memory',
  pageSize: 2,
  initialMemories: [tea, trains],
  initialHasNextPage: false,
};

const fetchMock = vi.fn();

beforeEach(() => {
  getCachedFrogBot.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function viewProps(req: Record<string, unknown>) {
  return {
    initPageResult: { req },
    payload: { config: { routes: { api: '/custom-api/' } } },
  } as never;
}

describe('MemoryView', () => {
  it('lists only the signed-in person’s me memories, with access checked', async () => {
    const list = vi.fn().mockResolvedValue({ docs: [tea], hasNextPage: true });
    const req = { user: { id: 1 }, frogbot: { config: { memory: {} }, memory: { list } } };

    const view = await MemoryView(viewProps(req));

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'me', limit: 100, overrideAccess: false }),
    );
    expect(view?.props).toMatchObject({
      apiPath: '/custom-api/frogbot/memory',
      initialMemories: [tea],
      initialHasNextPage: true,
    });
  });

  it('renders nothing without a signed-in person or memory config', async () => {
    const list = vi.fn();

    expect(
      await MemoryView(
        viewProps({ user: null, frogbot: { config: { memory: {} }, memory: { list } } }),
      ),
    ).toBeNull();
    expect(
      await MemoryView(viewProps({ user: { id: 1 }, frogbot: { config: {}, memory: { list } } })),
    ).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it('shows an error when the list fails', async () => {
    const list = vi.fn().mockRejectedValue(new Error('down'));
    const req = { user: { id: 1 }, frogbot: { config: { memory: {} }, memory: { list } } };

    const view = await MemoryView(viewProps(req));

    expect(view?.props.initialError).toBe('Could not load your memories. Please try again.');
  });
});

describe('MemoryViewClient', () => {
  it('shows each memory with its key and a pinned badge, and filters by search', () => {
    render(<MemoryViewClient {...props} />);

    expect(screen.getByText('Drinks green tea')).toBeTruthy();
    expect(screen.getByText('drink')).toBeTruthy();
    expect(screen.getByText('Pinned')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search memories'), { target: { value: 'train' } });

    expect(screen.queryByText('Drinks green tea')).toBeNull();
    expect(screen.getByText('Likes trains')).toBeTruthy();
  });

  it('forgets a memory in the me scope and removes it', async () => {
    fetchMock.mockResolvedValue(Response.json({ deleted: 1 }));
    render(<MemoryViewClient {...props} />);

    fireEvent.click(screen.getByLabelText('Forget "Drinks green tea"'));

    await waitFor(() => expect(screen.queryByText('Drinks green tea')).toBeNull());

    expect(fetchMock).toHaveBeenCalledWith('/custom-api/frogbot/memory/m%2F1?scope=me', {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  });

  it('keeps the memory and says so when forget fails', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    render(<MemoryViewClient {...props} />);

    fireEvent.click(screen.getByLabelText('Forget "Likes trains"'));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not forget this memory. Please try again.',
    );
    expect(screen.getByText('Likes trains')).toBeTruthy();
  });

  it('loads the next page', async () => {
    const more: MemoryItem = { ...trains, id: 'm3', text: 'Lives in Lisbon' };

    fetchMock.mockResolvedValue(Response.json({ docs: [more], hasNextPage: false }));
    render(<MemoryViewClient {...props} initialHasNextPage />);

    fireEvent.click(screen.getByText('Load more'));

    expect(await screen.findByText('Lives in Lisbon')).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe('/custom-api/frogbot/memory?scope=me&limit=2&page=2');
    expect(screen.queryByText('Load more')).toBeNull();
  });

  it('skips no memory when loading more after a forget', async () => {
    const third: MemoryItem = { ...trains, id: 'm3', text: 'Lives in Lisbon' };
    const fourth: MemoryItem = { ...trains, id: 'm4', text: 'Has a cat' };
    const pages: Record<string, MemoryItem[]> = { '1': [trains, third], '2': [fourth] };

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.resolve(Response.json({ deleted: 1 }));

      const page = new URL(url, 'http://x').searchParams.get('page') ?? '1';

      return Promise.resolve(Response.json({ docs: pages[page] ?? [], hasNextPage: page === '1' }));
    });

    render(<MemoryViewClient {...props} initialHasNextPage />);

    fireEvent.click(screen.getByLabelText('Forget "Drinks green tea"'));

    await waitFor(() => expect(screen.queryByText('Drinks green tea')).toBeNull());

    fireEvent.click(screen.getByText('Load more'));

    expect(await screen.findByText('Lives in Lisbon')).toBeTruthy();
    expect(screen.getAllByText('Likes trains')).toHaveLength(1);
  });

  it('says when there are no memories yet', () => {
    render(<MemoryViewClient {...props} initialMemories={[]} />);

    expect(screen.getByText('No memories yet')).toBeTruthy();
  });
});

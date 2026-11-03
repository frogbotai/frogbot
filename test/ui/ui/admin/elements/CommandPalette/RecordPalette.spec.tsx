import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaletteModel } from '../../../../../../packages/ui/src/admin/elements/CommandPalette/buildPaletteModel';
import { RecordPalette } from '../../../../../../packages/ui/src/admin/elements/CommandPalette/index.client';
import { NavAdapterProvider } from '../../../../../../packages/ui/src/nav/adapter';

const modal = vi.hoisted(() => {
  let state: Record<string, { isOpen: boolean }> = {};
  const listeners = new Set<() => void>();
  const set = (next: typeof state) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  return {
    closeModal: (slug: string) => set({ ...state, [slug]: { isOpen: false } }),
    get: () => state,
    reset: () => {
      state = {};
    },
    set,
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };
});

const closeModal = vi.hoisted(() => vi.fn());

vi.mock('@payloadcms/ui', async () => {
  const { useSyncExternalStore } = await import('react');

  return {
    commandPaletteSlug: 'command-palette',
    useConfig: () => ({ config: { routes: { admin: '/admin', api: '/api' } } }),
    useModal: () => ({
      closeModal: (slug: string) => {
        closeModal(slug);
        modal.closeModal(slug);
      },
      modalState: useSyncExternalStore(modal.subscribe, modal.get),
    }),
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const model: PaletteModel = {
  collections: [
    {
      index: 'content',
      label: 'Tasks',
      searchFields: ['title'],
      slug: 'tasks',
      titleField: 'title',
    },
    { label: 'Projects', searchFields: ['name'], slug: 'projects', titleField: 'name' },
    { label: 'People', searchFields: ['name'], slug: 'people', titleField: 'name' },
  ],
  rows: [
    { group: null, label: 'Home', path: '/admin/home' },
    {
      createPath: '/admin/collections/tasks/create',
      group: 'Collections',
      label: 'Tasks',
      path: '/admin/collections/tasks',
    },
  ],
};

type Reply = { body?: unknown; status?: number };

let replies: (url: string, init?: RequestInit) => Reply | Promise<Reply>;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const { body = {}, status = 200 } = await replies(String(input), init);

  return new Response(JSON.stringify(body), { status });
});

const navigate = vi.fn();

function defaultReplies(url: string): Reply {
  if (url.startsWith('/api/tasks/search')) {
    return { body: { hits: [{ doc: { id: 't2', title: 'Body match' } }] } };
  }

  if (url.startsWith('/api/tasks?')) {
    return { body: { docs: [{ id: 't1', title: 'Acme launch' }] } };
  }

  if (url.startsWith('/api/projects?')) return { body: { docs: [{ id: 'p1', name: '' }] } };

  return { status: 500 };
}

function renderPalette() {
  return render(
    <NavAdapterProvider navigate={navigate}>
      <RecordPalette {...model} />
    </NavAdapterProvider>,
  );
}

function openPayload() {
  act(() => modal.set({ ...modal.get(), 'command-palette': { isOpen: true } }));
}

const input = () => screen.getByRole('combobox');

function type(value: string) {
  fireEvent.change(input(), { target: { value } });
}

async function settle(ms = 200) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

const groupLabels = () =>
  screen.getAllByRole('group').map((group) => group.getAttribute('aria-label'));

const activeLabel = () =>
  document.getElementById(input().getAttribute('aria-activedescendant') ?? '')?.textContent;

describe('RecordPalette', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
    modal.reset();
    closeModal.mockClear();
    fetchMock.mockClear();
    navigate.mockClear();
    replies = defaultReplies;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('takes over Payload’s palette and toggles on each open', () => {
    renderPalette();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.fb-record-palette-marker')).not.toBeNull();

    openPayload();

    expect(closeModal).toHaveBeenCalledWith('command-palette');
    expect(modal.get()['command-palette']?.isOpen).toBe(false);
    expect(screen.getByRole('dialog').className).toContain('fb-record-palette');
    expect(document.activeElement).toBe(input());

    openPayload();

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists the sidebar rows with their groups and filters them as you type', () => {
    renderPalette();
    openPayload();

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Home',
      'Tasks',
    ]);
    expect(groupLabels()).toEqual([null, 'Collections']);

    type('tas');

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Tasks']);
    expect(document.querySelector('.fb-record-palette__match')?.textContent).toBe('Tas');
  });

  it('sends nothing for whitespace or before 200 ms', async () => {
    renderPalette();
    openPayload();

    type('   ');
    await settle(1000);

    expect(fetchMock).not.toHaveBeenCalled();

    type('acme');
    await settle(199);

    expect(fetchMock).not.toHaveBeenCalled();

    await settle(1);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true);
  });

  it('shows record groups in collection order, with title or id, and drops a failed one', async () => {
    renderPalette();
    openPayload();
    type('acme');
    await settle();

    expect(groupLabels()).toEqual(['Tasks', 'Projects']);
    expect(
      within(screen.getByRole('group', { name: 'Tasks' }))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Acme launch', 'Body match']);
    expect(
      within(screen.getByRole('group', { name: 'Projects' })).getByRole('option').textContent,
    ).toBe('p1');
    expect(screen.queryByRole('group', { name: 'People' })).toBeNull();
  });

  it('shows a loading group while a collection is still searching', async () => {
    let release: (reply: Reply) => void = () => {};

    replies = (url) =>
      url.startsWith('/api/projects?')
        ? new Promise<Reply>((resolve) => (release = resolve))
        : defaultReplies(url);

    renderPalette();
    openPayload();
    type('acme');
    await settle();

    expect(screen.getByRole('group', { name: 'Projects' }).getAttribute('aria-busy')).toBe('true');

    release({ body: { docs: [{ id: 'p1', name: 'Acme' }] } });
    await settle(0);

    expect(screen.getByRole('group', { name: 'Projects' }).hasAttribute('aria-busy')).toBe(false);
    expect(screen.getByRole('option', { name: 'Acme' })).not.toBeNull();
  });

  it('ignores a slow response that arrives after a newer search', async () => {
    const firstReplies: ((reply: Reply) => void)[] = [];

    replies = (url) =>
      url.includes('first')
        ? new Promise<Reply>((resolve) => firstReplies.push(resolve))
        : url.startsWith('/api/tasks?')
          ? { body: { docs: [{ id: 't9', title: 'Second' }] } }
          : { body: { docs: [], hits: [] } };

    renderPalette();
    openPayload();
    type('first');
    await settle();
    type('second');
    await settle();

    for (const reply of firstReplies) reply({ body: { docs: [{ id: 't1', title: 'First' }] } });

    await settle(0);

    expect(screen.getByRole('option', { name: 'Second' })).not.toBeNull();
    expect(screen.queryByRole('option', { name: 'First' })).toBeNull();
  });

  it('moves from the rows into the records and opens a record with Enter', async () => {
    renderPalette();
    openPayload();
    type('a');
    await settle();

    const labels = screen.getAllByRole('option').map((option) => option.textContent);
    const rowCount = labels.indexOf('Acme launch');

    for (let index = 0; index < rowCount; index++) fireEvent.keyDown(input(), { key: 'ArrowDown' });

    expect(activeLabel()).toBe('Acme launch');

    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(navigate).toHaveBeenCalledWith('/admin/collections/tasks/t1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a create page with Cmd+Enter only on a row that can create', () => {
    renderPalette();
    openPayload();

    fireEvent.keyDown(input(), { key: 'Enter', metaKey: true });

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByText('commandPalette:hintCreate')).toBeNull();

    fireEvent.keyDown(input(), { key: 'ArrowDown' });

    expect(screen.getByText('commandPalette:hintCreate')).not.toBeNull();

    fireEvent.keyDown(input(), { key: 'Enter', metaKey: true });

    expect(navigate).toHaveBeenCalledWith('/admin/collections/tasks/create');
  });

  it('clears the input when Esc closes it', () => {
    renderPalette();
    openPayload();
    type('acme');

    fireEvent.keyDown(input(), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();

    openPayload();

    expect((input() as HTMLInputElement).value).toBe('');
  });

  it('shows Payload’s no-results text when nothing matches', async () => {
    replies = () => ({ body: { docs: [], hits: [] } });

    renderPalette();
    openPayload();
    type('zzz');
    await settle();

    expect(screen.getByRole('status').textContent).toBe('commandPalette:noResults');
  });
});

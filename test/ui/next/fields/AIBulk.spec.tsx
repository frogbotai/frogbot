import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { collections, fetchMock, listQuery, locale, router, selection, toast } = vi.hoisted(() => ({
  collections: {} as Record<string, unknown>,
  fetchMock: vi.fn(),
  listQuery: { query: {} as Record<string, unknown> },
  locale: { code: undefined as string | undefined },
  router: { refresh: vi.fn() },
  selection: {
    selectAll: 'none',
    selectedIDs: [] as (number | string)[],
    toggleAll: vi.fn(),
  },
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('@payloadcms/ui', () => ({
  PopupList: {
    Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
      <button onClick={onClick} type="button">
        {children}
      </button>
    ),
  },
  toast,
  useConfig: () => ({
    config: { routes: { api: '/api' } },
    getEntityConfig: ({ collectionSlug }: { collectionSlug: string }) =>
      collections[collectionSlug],
  }),
  useListQuery: () => listQuery,
  useLocale: () => (locale.code ? { code: locale.code } : {}),
  useSelection: () => selection,
  useTranslation: () => ({ i18n: { language: 'en' } }),
}));

vi.mock('next/navigation.js', () => ({ useRouter: () => router }));

const { AIFieldListMenuItem } =
  await import('../../../../packages/next/src/fields/AI/ListMenuItem.client.js');
const { aiBulkLoadURL, aiBulkRequests, aiBulkScope } =
  await import('../../../../packages/next/src/fields/AI/bulk.js');

type Doc = Record<string, unknown> & { id: number | string };

type Reply = { body?: unknown; status?: number } | 'network';

const summary = { inputs: ['title', 'notes'], label: 'Summary', name: 'summary' };

const articleSummary = { inputs: ['body'], label: 'Summary', name: 'summary' };

const skippedReasons = '(no inputs, no permission, being edited, or changed)';

function tasks(count: number, start = 1): Doc[] {
  return Array.from({ length: count }, (_, index) => ({
    id: start + index,
    notes: 'Notes',
    title: '',
  }));
}

function patched(docs: Doc[]): { docs: Doc[]; errors: [] } {
  return { docs, errors: [] };
}

function reply(value: Reply) {
  if (value === 'network') return Promise.reject(new TypeError('Failed to fetch'));

  const status = value.status ?? 200;

  return Promise.resolve({
    json: () => Promise.resolve(value.body),
    ok: status < 400,
    status,
  });
}

function replyWith(...replies: Reply[]) {
  replies.forEach((value) => fetchMock.mockImplementationOnce(() => reply(value)));
}

function sent(): { body?: unknown; method: string; url: string }[] {
  return fetchMock.mock.calls.map(([url, init]: [string, RequestInit | undefined]) => ({
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
    method: init?.method ?? 'GET',
    url,
  }));
}

function scopeFor(collectionSlug = 'tasks') {
  return aiBulkScope({
    collectionConfig: collections[collectionSlug] as never,
    query: listQuery.query as never,
    selectAll: selection.selectAll,
    selectedIDs: selection.selectedIDs,
  });
}

function renderItem({ collectionSlug = 'tasks', field = summary } = {}) {
  return render(<AIFieldListMenuItem collectionSlug={collectionSlug} field={field} />);
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate Summary…' }));
}

function choose(name: string) {
  fireEvent.click(screen.getByRole('radio', { name }));
}

function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function regenerate({ choice }: { choice?: string } = {}) {
  openDialog();

  if (choice) choose(choice);

  confirm();
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  router.refresh.mockClear();
  selection.selectAll = 'none';
  selection.selectedIDs = [];
  selection.toggleAll.mockClear();
  listQuery.query = {};
  locale.code = undefined;

  Object.values(toast).forEach((mock) => mock.mockClear());
  Object.keys(collections).forEach((slug) => delete collections[slug]);
  Object.assign(collections, {
    articles: { admin: {}, fields: [], slug: 'articles', versions: { drafts: {} } },
    tasks: { admin: {}, fields: [], slug: 'tasks' },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AIFieldListMenuItem', () => {
  it('labels the entry with the field label and an ellipsis', () => {
    renderItem();

    expect(screen.getByRole('button', { name: 'Regenerate Summary…' })).toBeTruthy();
  });

  it('opens the dialog without sending a request', () => {
    renderItem();

    openDialog();

    expect(screen.getByRole('dialog', { name: 'Regenerate Summary' })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('scopes a selection to the selected IDs and reads "All selected"', async () => {
    selection.selectAll = 'some';
    selection.selectedIDs = [4, 7];
    replyWith({ body: { docs: [] } });
    renderItem();

    openDialog();

    expect(screen.getByRole('radio', { name: 'All selected' })).toBeTruthy();

    confirm();
    await flush();

    expect(sent()[0]?.url).toBe(
      aiBulkLoadURL({
        api: '/api',
        choice: 'never',
        collectionSlug: 'tasks',
        drafts: false,
        field: summary,
        where: { id: { in: [4, 7] } },
      }),
    );
  });

  it('scopes nothing selected to the List query and reads "All in view"', async () => {
    listQuery.query = { where: { title: { like: 'Alpha' } } };
    replyWith({ body: { docs: [] } });
    renderItem();

    openDialog();

    expect(screen.getByRole('radio', { name: 'All in view' })).toBeTruthy();

    confirm();
    await flush();

    expect(sent()[0]?.url).toBe(
      aiBulkLoadURL({
        api: '/api',
        choice: 'never',
        collectionSlug: 'tasks',
        drafts: false,
        field: summary,
        where: scopeFor().where,
      }),
    );
  });
});

describe('AIBulkDialog choices', () => {
  it('shows the four choices in order with "Only never generated" selected', () => {
    renderItem();

    openDialog();

    const radios = screen.getAllByRole('radio');

    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
      'true',
    ]);
    expect(
      radios
        .map((radio) => document.getElementById(String(radio.getAttribute('aria-labelledby'))))
        .map((label) => label?.textContent),
    ).toEqual(['All in view', 'Only values written by AI', 'Only failed', 'Only never generated']);
  });

  it('describes the first choice as replacing hand-edited values', () => {
    renderItem();

    openDialog();

    const all = screen.getByRole('radio', { name: 'All in view' });

    expect(document.getElementById(String(all.getAttribute('aria-describedby')))?.textContent).toBe(
      'Also replaces values edited by hand.',
    );
  });

  it('resets to "Only never generated" when reopened', () => {
    renderItem();

    openDialog();
    choose('All in view');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    openDialog();

    expect(
      screen.getByRole('radio', { name: 'Only never generated' }).getAttribute('aria-checked'),
    ).toBe('true');
  });
});

describe('AIBulkDialog confirm', () => {
  it('loads once, then sends the draft-grouped PATCHes in the List locale', async () => {
    locale.code = 'fr';

    const docs = [
      { _status: 'published', body: 'One', id: 1 },
      { _status: 'draft', body: 'Two', id: 2 },
      { _status: 'draft', body: 'Three', id: 3 },
    ];

    replyWith(
      { body: { docs } },
      { body: patched(docs.slice(1)) },
      { body: patched(docs.slice(0, 1)) },
    );
    renderItem({ collectionSlug: 'articles', field: articleSummary });

    await regenerate({ choice: 'All in view' });

    const requests = aiBulkRequests({
      api: '/api',
      choice: 'all',
      collectionSlug: 'articles',
      drafts: true,
      field: articleSummary,
      locale: 'fr',
      targets: [
        { draft: false, id: 1 },
        { draft: true, id: 2 },
        { draft: true, id: 3 },
      ],
    });

    expect(sent()).toEqual([
      {
        body: undefined,
        method: 'GET',
        url: aiBulkLoadURL({
          api: '/api',
          choice: 'all',
          collectionSlug: 'articles',
          drafts: true,
          field: articleSummary,
          locale: 'fr',
          where: scopeFor('articles').where,
        }),
      },
      ...requests.map(({ body, url }) => ({ body, method: 'PATCH', url })),
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true);
  });

  it('sends one set of requests on a double click', async () => {
    replyWith({ body: { docs: tasks(1) } }, { body: patched(tasks(1)) });
    renderItem();

    openDialog();

    const button = screen.getByRole('button', { name: 'Regenerate' });

    fireEvent.click(button);
    fireEvent.click(button);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('locks the dialog while sending', () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    renderItem();

    openDialog();
    confirm();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    const queueing = screen.getByRole('button', { name: 'Queueing…' }) as HTMLButtonElement;
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;

    expect([queueing.disabled, cancel.disabled]).toEqual([true, true]);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it.each([
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })],
  ])('%s closes the dialog without a request', async (_, dismiss) => {
    renderItem();

    openDialog();
    dismiss();
    await flush();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('AIBulkDialog responses', () => {
  it('reports every queued run', async () => {
    replyWith({ body: { docs: tasks(3) } }, { body: patched(tasks(3)) });
    renderItem();

    await regenerate();

    expect(toast.success).toHaveBeenCalledWith('Queued 3 runs');
  });

  it('counts a partial 400 chunk and still sends the next chunk', async () => {
    const docs = [
      { _status: 'draft', body: 'One', id: 1 },
      { _status: 'draft', body: 'Two', id: 2 },
      { _status: 'published', body: 'Three', id: 3 },
    ];

    replyWith(
      { body: { docs } },
      {
        body: { docs: [docs[0]], errors: [{ id: 2, message: 'Locked' }], message: 'Locked' },
        status: 400,
      },
      { body: patched([docs[2] as Doc]) },
    );
    renderItem({ collectionSlug: 'articles', field: articleSummary });

    await regenerate();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(toast.success).toHaveBeenCalledWith(
      `Queued 2 runs · 1 record skipped ${skippedReasons}`,
    );
  });

  it('skips a loaded record whose inputs are all empty', async () => {
    replyWith(
      { body: { docs: [...tasks(1), { id: 2, notes: null, title: '' }] } },
      { body: patched(tasks(1)) },
    );
    renderItem();

    await regenerate();

    expect(sent()[1]?.url).toBe(
      aiBulkRequests({
        api: '/api',
        choice: 'never',
        collectionSlug: 'tasks',
        drafts: false,
        field: summary,
        targets: [{ draft: false, id: 1 }],
      })[0]?.url,
    );
    expect(toast.success).toHaveBeenCalledWith(`Queued 1 run · 1 record skipped ${skippedReasons}`);
  });

  it('reports an empty load without sending a PATCH', async () => {
    replyWith({ body: { docs: [] } });
    renderItem();

    await regenerate();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith('Queued 0 runs · no records matched');
  });

  it('reports a failed load without sending a PATCH', async () => {
    replyWith({ body: { errors: [{ message: 'You are not allowed.' }] }, status: 403 });
    renderItem();

    await regenerate();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('You are not allowed.');
  });

  it.each<[string, Reply, string]>([
    [
      'a 403',
      { body: { errors: [{ message: 'You are not allowed.' }] }, status: 403 },
      'You are not allowed.',
    ],
    ['a network error', 'network', "Couldn't queue the runs."],
  ])(
    '%s on chunk 2 stops chunk 3 and reports the runs already queued',
    async (_, failure, text) => {
      replyWith({ body: { docs: tasks(250) } }, { body: patched(tasks(100)) }, failure);
      renderItem();

      await regenerate();

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(toast.error).toHaveBeenCalledWith(`${text} · 100 runs already queued`);
    },
  );
});

describe('AIBulkDialog afterwards', () => {
  it('closes, clears the selection and refreshes once', async () => {
    selection.selectAll = 'some';
    selection.selectedIDs = [1];
    replyWith({ body: { docs: tasks(1) } }, { body: patched(tasks(1)) });
    renderItem();

    await regenerate();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(selection.toggleAll).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('leaves an empty selection alone and refreshes once', async () => {
    replyWith({ body: { docs: tasks(1) } }, { body: patched(tasks(1)) });
    renderItem();

    await regenerate();

    expect(selection.toggleAll).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type {
  ClientField,
  DefaultCellComponentProps,
  SelectFieldClient,
  SelectFieldClientProps,
  TextFieldClientProps,
} from 'payload';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

type SelectProps = Record<string, unknown> & { onChange: (next: unknown) => void };

const { DefaultCell, ReactSelect, auth, fetchMock, setValue, toast } = vi.hoisted(() => ({
  DefaultCell: vi.fn(({ cellData }: { cellData?: unknown }) => (
    <span data-testid="default-cell">{String(cellData)}</span>
  )),
  ReactSelect: vi.fn((_props: SelectProps) => <div data-testid="react-select" />),
  auth: { update: true },
  fetchMock: vi.fn(),
  setValue: vi.fn(),
  toast: { error: vi.fn() },
}));

const collections = vi.hoisted((): Record<string, unknown> => ({}));
const documentInfo = vi.hoisted((): Record<string, unknown> => ({}));
const form = vi.hoisted((): { value: unknown } => ({ value: undefined }));
const locale = vi.hoisted((): { code: string | undefined } => ({ code: 'en' }));

vi.mock('@payloadcms/ui', () => ({
  DefaultCell,
  ReactSelect,
  FieldDescription: ({ description }: { description?: string }) => <p>{description}</p>,
  FieldError: () => null,
  FieldLabel: ({ label }: { label?: string }) => <label>{label}</label>,
  isFieldRTL: ({ fieldRTL, locale }: { fieldRTL?: boolean; locale?: { rtl?: boolean } }) =>
    fieldRTL === true || (fieldRTL !== false && locale?.rtl === true),
  RenderCustomComponent: ({
    CustomComponent,
    Fallback,
  }: {
    CustomComponent?: ReactNode;
    Fallback: ReactNode;
  }) => CustomComponent ?? Fallback,
  toast,
  useAuth: () => ({
    permissions: {
      collections: Object.fromEntries(['articles', 'tasks'].map((slug) => [slug, auth])),
    },
  }),
  useConfig: () => ({
    config: { routes: { api: '/api' } },
    getEntityConfig: ({ collectionSlug }: { collectionSlug: string }) =>
      collections[collectionSlug],
  }),
  useDocumentInfo: () => documentInfo,
  useField: ({ potentiallyStalePath }: { potentiallyStalePath: string }) => ({
    customComponents: {},
    disabled: false,
    path: potentiallyStalePath,
    setValue,
    showError: false,
    value: form.value,
  }),
  useLocale: () => (locale.code ? { code: locale.code } : {}),
  useTranslation: () => ({ i18n: { language: 'en' } }),
  withCondition: <T,>(Component: T) => Component,
}));

const { AICell, AIField } = await import('../../../../packages/next/src/fields/AI/index.client.js');
const { AI_FIELD_POLL_INTERVAL, watchAIFieldRecord } =
  await import('../../../../packages/next/src/fields/AI/poller.js');

const summaryField = {
  name: 'summary',
  type: 'text',
  label: 'Summary',
  admin: {
    custom: {
      frogbot: { kind: { type: 'ai', inputs: ['title', 'notes'], prompt: 'Summarize.' } },
    },
  },
} as ClientField & TextFieldClientProps['field'];

function selectField(
  field: Omit<SelectFieldClient, 'admin'> & {
    admin?: Partial<NonNullable<SelectFieldClient['admin']>>;
  },
): SelectFieldClient {
  return field as SelectFieldClient;
}

const typeField = selectField({
  name: 'type',
  type: 'select',
  label: 'Type',
  options: [{ label: 'Bug', value: 'bug' }, { label: 'Feature', value: 'feature' }, 'question'],
  admin: {
    custom: {
      frogbot: {
        kind: { type: 'ai', inputs: ['notes'], prompt: 'Classify.' },
        optionColors: { bug: 'red', feature: 'green' },
      },
    },
  },
});

const plainTypeField = selectField({
  ...typeField,
  admin: { custom: { frogbot: { kind: typeField.admin?.custom?.frogbot.kind } } },
});

const labelsField = selectField({ ...typeField, name: 'labels', hasMany: true });

type Row = Record<string, unknown> & { id: number | string };

function row(state: Record<string, unknown> = {}): Row {
  return {
    id: 1,
    title: 'Write the report',
    notes: '',
    summary: 'Old summary',
    _summary_status: 'done',
    _summary_error: null,
    ...state,
  };
}

function cell(rowData: Row, props: Partial<DefaultCellComponentProps> = {}) {
  return (
    <AICell
      cellData={rowData.summary}
      collectionSlug="tasks"
      field={summaryField}
      rowData={rowData}
      viewType="list"
      {...props}
    />
  );
}

function selectCell(
  field: ClientField,
  rowData: Row,
  props: Partial<DefaultCellComponentProps> = {},
) {
  const name = 'name' in field ? field.name : '';

  return (
    <AICell
      cellData={rowData[name]}
      collectionSlug="tasks"
      field={field}
      rowData={rowData}
      viewType="list"
      {...props}
    />
  );
}

function renderPills(): { className: string; text: string | null }[] {
  const { options } = (DefaultCell.mock.lastCall?.[0] as DefaultCellComponentProps).field as {
    options: { label: ReactNode }[];
  };

  const { container } = render(<>{options[0]?.label}</>);

  return Array.from(container.querySelectorAll('.option-pills > span'), (pill: Element) => ({
    className: pill.className,
    text: pill.textContent,
  }));
}

function selectProps(): SelectProps {
  return ReactSelect.mock.lastCall?.[0] as SelectProps;
}

function respond(body: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(body), ok, statusText: ok ? 'OK' : 'Bad' });
}

function requestURL(index = 0): string {
  return decodeURIComponent(String(fetchMock.mock.calls[index]?.[0]));
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function nextTick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AI_FIELD_POLL_INTERVAL);
  });
}

function renderField(props: Partial<TextFieldClientProps> = {}) {
  return render(<AIField field={summaryField} path="summary" {...props} />);
}

function statusLine(container: HTMLElement): string | null | undefined {
  return container.querySelector('.ai-field__status')?.textContent;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  DefaultCell.mockClear();
  ReactSelect.mockClear();
  setValue.mockClear();
  toast.error.mockClear();
  auth.update = true;
  locale.code = 'en';
  form.value = undefined;

  Object.keys(collections).forEach((slug) => delete collections[slug]);

  Object.assign(collections, {
    articles: { slug: 'articles', versions: { drafts: {} } },
    tasks: { slug: 'tasks' },
  });

  Object.keys(documentInfo).forEach((key) => delete documentInfo[key]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AICell in a list', () => {
  it('offers Generate for a record that never ran with an input set', () => {
    render(cell(row({ _summary_status: null, summary: null })));

    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
    expect(DefaultCell).not.toHaveBeenCalled();
  });

  it('shows nothing for a record that never ran with every input empty', () => {
    const { container } = render(cell(row({ _summary_status: null, summary: null, title: '' })));

    expect(container.childElementCount).toBe(0);
  });

  it('hides Generate without update permission', () => {
    auth.update = false;

    const { container } = render(cell(row({ _summary_status: null, summary: null })));

    expect(container.childElementCount).toBe(0);
  });

  it('dims the old value with a spinner while pending', () => {
    const { container } = render(cell(row({ _summary_status: 'pending' })));

    expect(container.querySelector('.ai-cell')?.className).toBe('ai-cell ai-cell--pending');
    expect(screen.getByTestId('default-cell').textContent).toBe('Old summary');
    expect(screen.getByRole('img', { name: 'Generating' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows only the spinner while pending with no old value', () => {
    render(cell(row({ _summary_status: 'pending', summary: null })));

    expect(screen.getByRole('img', { name: 'Generating' })).toBeTruthy();
    expect(DefaultCell).not.toHaveBeenCalled();
  });

  it.each(['done', 'manual'])('shows a %s value with a rerun button and no marker', (status) => {
    const { container } = render(cell(row({ _summary_status: status })));

    expect(container.querySelector('.ai-cell')?.className).toBe('ai-cell');
    expect(screen.getByTestId('default-cell').textContent).toBe('Old summary');
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeTruthy();
  });

  it('hides the rerun button without update permission', () => {
    auth.update = false;

    render(cell(row()));

    expect(screen.getByTestId('default-cell').textContent).toBe('Old summary');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the previous value and a Retry warning with the message on hover', () => {
    render(cell(row({ _summary_status: 'error', _summary_error: 'Model unavailable' })));

    const retry = screen.getByRole('button', { name: 'Retry' });

    fireEvent.focus(retry);

    expect(screen.getByTestId('default-cell').textContent).toBe('Old summary');
    expect(screen.getByRole('tooltip').textContent).toBe('Model unavailable');
  });

  it('shows the error warning without a button when the user cannot update', () => {
    auth.update = false;

    render(cell(row({ _summary_status: 'error', _summary_error: 'Model unavailable' })));

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: 'Model unavailable' })).toBeTruthy();
  });

  it('renders the plain value when the list select API is on', () => {
    collections.tasks = { slug: 'tasks', admin: { enableListViewSelectAPI: true } };

    const { container } = render(cell(row({ _summary_status: 'pending' })));

    expect(screen.getByTestId('default-cell').textContent).toBe('Old summary');
    expect(container.querySelector('.ai-cell')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders the plain value when the row has no status key', () => {
    const { _summary_status: _status, ...rowData } = row();

    const { container } = render(cell(rowData));

    expect(screen.getByTestId('default-cell').textContent).toBe('Old summary');
    expect(container.querySelector('.ai-cell')).toBeNull();
  });
});

describe('AICell actions', () => {
  it('queues a run with the locale without triggering the row link', async () => {
    const rowClick = vi.fn();

    document.addEventListener('click', rowClick);
    onTestFinished(() => document.removeEventListener('click', rowClick));
    fetchMock.mockReturnValue(respond({ doc: row({ _summary_status: 'pending' }) }));

    render(cell(row()));

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    await flush();

    expect(requestURL()).toBe('/api/tasks/1?depth=0&locale=en');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ _summary_status: 'pending' }),
      credentials: 'include',
      method: 'PATCH',
    });
    expect(rowClick).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Generating' })).toBeTruthy();
  });

  it('omits the locale when localization is off', async () => {
    locale.code = undefined;

    fetchMock.mockReturnValue(respond({ doc: row({ _summary_status: 'pending' }) }));

    render(cell(row({ _summary_status: null, summary: null })));

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await flush();

    expect(requestURL()).toBe('/api/tasks/1?depth=0');
  });

  it('patches only the latest draft of a draft row', async () => {
    fetchMock.mockReturnValue(respond({ docs: [row({ _summary_status: 'pending' })], errors: [] }));

    render(cell(row({ _status: 'draft' }), { collectionSlug: 'articles' }));

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    await flush();

    expect(requestURL()).toMatch(/^\/api\/articles\?depth=0&where\[and\]\[0\]\[id\]\[in\]\[0\]=1&/);
    expect(requestURL()).toContain('&where[and][2][_status][equals]=draft&locale=en&draft=true');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ _summary_status: 'pending' }),
      method: 'PATCH',
    });
    expect(screen.getByRole('img', { name: 'Generating' })).toBeTruthy();
  });

  it('patches a published row only while its latest version is published', async () => {
    fetchMock.mockReturnValue(respond({ docs: [row({ _summary_status: 'pending' })], errors: [] }));

    render(cell(row({ _status: 'published' }), { collectionSlug: 'articles' }));

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    await flush();

    expect(requestURL()).toContain(
      '&where[and][2][_status][equals]=published&locale=en&draft=true',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ _status: 'published', _summary_status: 'pending' }),
      method: 'PATCH',
    });
  });

  it('reports a record that changed since the load and keeps the state', async () => {
    fetchMock.mockReturnValue(respond({ docs: [], errors: [] }));

    render(cell(row({ _status: 'published' }), { collectionSlug: 'articles' }));

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    await flush();

    expect(toast.error).toHaveBeenCalledWith(
      'This record changed since it was loaded. Reload it and try again.',
    );
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Generating' })).toBeNull();
  });

  it('shows the server message when a draft row is being edited', async () => {
    fetchMock.mockReturnValue(
      respond({ docs: [], errors: [{ id: 1, message: 'Document is locked' }] }, false),
    );

    render(cell(row({ _status: 'draft' }), { collectionSlug: 'articles' }));

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    await flush();

    expect(toast.error).toHaveBeenCalledWith('Document is locked');
  });

  it('shows the server message and keeps the state when the request fails', async () => {
    fetchMock.mockReturnValue(respond({ errors: [{ message: 'Document is locked' }] }, false));

    render(cell(row({ _summary_status: 'error', _summary_error: 'Model unavailable' })));

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await flush();

    expect(toast.error).toHaveBeenCalledWith('Document is locked');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Generating' })).toBeNull();
  });
});

describe('AICell on cards', () => {
  it.each(['board', 'calendar'])('shows a %s card value without actions', (viewType) => {
    render(cell(row(), { viewType }));

    expect(screen.getByTestId('default-cell').textContent).toBe('Old summary');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each(['board', 'calendar'])('dims a pending %s card without a spinner', (viewType) => {
    const { container } = render(cell(row({ _summary_status: 'pending' }), { viewType }));

    expect(container.querySelector('.ai-cell')?.className).toBe('ai-cell ai-cell--pending');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it.each(['board', 'calendar'])('shows a warning icon on an errored %s card', (viewType) => {
    render(
      cell(row({ _summary_status: 'error', _summary_error: 'Model unavailable' }), { viewType }),
    );

    expect(screen.getByRole('img', { name: 'Model unavailable' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each(['board', 'calendar'])('shows nothing on a %s card that never ran', (viewType) => {
    const { container } = render(cell(row({ _summary_status: null, summary: null }), { viewType }));

    expect(container.childElementCount).toBe(0);
  });

  it('updates a pending card from the poller', async () => {
    fetchMock.mockReturnValue(
      respond({ docs: [{ id: 1, summary: 'New summary', _summary_status: 'done' }] }),
    );

    render(cell(row({ _summary_status: 'pending' }), { viewType: 'board' }));

    await nextTick();

    expect(screen.getByTestId('default-cell').textContent).toBe('New summary');
  });
});

describe('AICell polling', () => {
  it('reads two pending cells of one collection in one request and stops once done', async () => {
    fetchMock.mockReturnValue(
      respond({
        docs: [
          { id: 1, summary: 'First', _summary_status: 'done' },
          { id: 2, summary: 'Second', _summary_status: 'done' },
        ],
      }),
    );

    render(
      <>
        {cell(row({ _summary_status: 'pending' }))}
        {cell(row({ id: 2, _summary_status: 'pending' }))}
      </>,
    );

    await nextTick();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestURL()).toBe(
      '/api/tasks?depth=0&pagination=false&where[id][in][0]=1&where[id][in][1]=2&select[summary]=true&select[_summary_status]=true&select[_summary_error]=true&locale=en',
    );
    expect(
      screen.getAllByTestId('default-cell').map((node: HTMLElement) => node.textContent),
    ).toStrictEqual(['First', 'Second']);

    await nextTick();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps polling after a failed request', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValue(respond({ docs: [{ id: 1, summary: 'Back', _summary_status: 'done' }] }));

    render(cell(row({ _summary_status: 'pending' })));

    await nextTick();

    expect(screen.getByTestId('default-cell').textContent).toBe('Old summary');

    await nextTick();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('default-cell').textContent).toBe('Back');
  });

  it('stops polling when the cell unmounts', async () => {
    const { unmount } = render(cell(row({ _summary_status: 'pending' })));

    unmount();

    await nextTick();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('watchAIFieldRecord', () => {
  const base = {
    api: '/api',
    collectionSlug: 'tasks',
    draft: false,
    field: 'summary',
    locale: 'en',
  };

  it('makes one request per collection and locale', async () => {
    fetchMock.mockImplementation(() => respond({ docs: [] }));

    const stops = [
      watchAIFieldRecord({ ...base, id: 1, onDoc: vi.fn() }),
      watchAIFieldRecord({ ...base, id: 2, onDoc: vi.fn() }),
      watchAIFieldRecord({ ...base, id: 3, locale: 'fr', onDoc: vi.fn() }),
      watchAIFieldRecord({
        ...base,
        collectionSlug: 'articles',
        draft: true,
        id: 4,
        onDoc: vi.fn(),
      }),
    ];

    await vi.advanceTimersByTimeAsync(AI_FIELD_POLL_INTERVAL);

    stops.forEach((stop) => stop());

    expect(fetchMock.mock.calls.map((_call, index) => requestURL(index))).toStrictEqual([
      '/api/tasks?depth=0&pagination=false&where[id][in][0]=1&where[id][in][1]=2&select[summary]=true&select[_summary_status]=true&select[_summary_error]=true&locale=en',
      '/api/tasks?depth=0&pagination=false&where[id][in][0]=3&select[summary]=true&select[_summary_status]=true&select[_summary_error]=true&locale=fr',
      '/api/articles?depth=0&pagination=false&where[id][in][0]=4&select[summary]=true&select[_summary_status]=true&select[_summary_error]=true&locale=en&draft=true',
    ]);
  });

  it('reports a missing record once and stops watching it', async () => {
    const onDoc = vi.fn();

    fetchMock.mockImplementation(() => respond({ docs: [] }));

    const stop = watchAIFieldRecord({ ...base, id: 1, onDoc });

    await vi.advanceTimersByTimeAsync(AI_FIELD_POLL_INTERVAL * 2);

    stop();

    expect(onDoc.mock.calls).toStrictEqual([[undefined]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('AIField', () => {
  function savedDoc(state: Record<string, unknown> = {}) {
    Object.assign(documentInfo, {
      collectionSlug: 'tasks',
      docPermissions: { update: auth.update },
      id: 1,
      savedDocumentData: row(state),
    });
  }

  it('keeps the text field classes', () => {
    savedDoc();

    const { container } = renderField();

    expect(container.firstElementChild?.className).toBe('field-type text ai-field');
  });

  it('passes autoComplete and rtl to the text input', () => {
    savedDoc();

    const field = {
      ...summaryField,
      admin: { ...summaryField.admin, autoComplete: 'off', rtl: true },
    };

    const { container } = renderField({ field });
    const input = container.querySelector('input');

    expect(input?.getAttribute('autocomplete')).toBe('off');
    expect(input?.getAttribute('dir')).toBe('rtl');
  });

  it('leaves the text input direction to the page without rtl', () => {
    savedDoc();

    const { container } = renderField();

    expect(container.querySelector('input')?.hasAttribute('dir')).toBe(false);
  });

  it.each([
    [null, 'Generate'],
    ['pending', 'Generating…'],
    ['done', 'Regenerate'],
    ['error', 'Failed: Model unavailable · Retry'],
    ['manual', "Edited by hand, won't update automatically · Regenerate"],
  ])('shows the %s status line', (status, text) => {
    savedDoc({ _summary_status: status, _summary_error: 'Model unavailable' });

    const { container } = renderField();

    expect(statusLine(container)).toBe(text);
  });

  it('hides the actions without update permission even when editable', () => {
    auth.update = false;

    savedDoc({ _summary_status: 'manual' });

    const { container } = renderField({ readOnly: false });

    expect(statusLine(container)).toBe("Edited by hand, won't update automatically");
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows no status line for a done value without update permission', () => {
    auth.update = false;

    savedDoc();

    const { container } = renderField();

    expect(container.querySelector('.ai-field__status')).toBeNull();
  });

  it('keeps the actions on a read-only field with update permission', () => {
    savedDoc();

    const { container } = renderField({ readOnly: true });

    expect(container.querySelector('input')?.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeTruthy();
  });

  it('shows no status line in the create view', () => {
    Object.assign(documentInfo, { collectionSlug: 'tasks', docPermissions: { update: true } });

    const { container } = renderField();

    expect(container.querySelector('.ai-field__status')).toBeNull();
  });

  it('saves only the status when Retry is clicked', async () => {
    fetchMock.mockReturnValue(respond({ doc: row({ _summary_status: 'pending' }) }));

    savedDoc({ _summary_status: 'error', _summary_error: 'Model unavailable' });

    const { container } = renderField();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await flush();

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ _summary_status: 'pending' }),
    });
    expect(statusLine(container)).toBe('Generating…');
  });

  it('fills an unchanged input from the poller without marking the form modified', async () => {
    fetchMock.mockReturnValue(
      respond({ docs: [{ id: 1, summary: 'New summary', _summary_status: 'done' }] }),
    );

    form.value = 'Old summary';

    savedDoc({ _summary_status: 'pending' });

    const { container } = renderField();

    await nextTick();

    expect(setValue).toHaveBeenCalledWith('New summary', true);
    expect(statusLine(container)).toBe('Regenerate');
  });

  it('leaves an edited input alone when the poller brings a value', async () => {
    fetchMock.mockReturnValue(
      respond({ docs: [{ id: 1, summary: 'New summary', _summary_status: 'done' }] }),
    );

    form.value = 'My own words';

    savedDoc({ _summary_status: 'pending' });

    const { container } = renderField();

    await nextTick();

    expect(setValue).not.toHaveBeenCalled();
    expect(statusLine(container)).toBe('Regenerate');
  });
});

describe('AICell for a select', () => {
  const issue = (state: Record<string, unknown> = {}) =>
    row({ notes: 'Broken', type: 'bug', _type_status: 'done', _type_error: null, ...state });

  it('draws a coloured select value as option pills', () => {
    render(selectCell(typeField, issue()));

    expect(renderPills()).toEqual([
      { className: 'fb-option-pill fb-option-pill--red', text: 'Bug' },
    ]);
  });

  it('draws an uncoloured select value through DefaultCell with the raw value', () => {
    render(selectCell(plainTypeField, issue()));

    expect(screen.getByTestId('default-cell').textContent).toBe('bug');
    expect(DefaultCell.mock.lastCall?.[0]).toMatchObject({
      cellData: 'bug',
      field: plainTypeField,
    });
  });

  it('draws a multiple select as pills in stored order', () => {
    const rowData = row({ notes: 'Broken', labels: ['question', 'bug'], _labels_status: 'done' });

    render(selectCell(labelsField, rowData));

    expect(renderPills()).toEqual([
      { className: 'fb-option-pill fb-option-pill--gray', text: 'question' },
      { className: 'fb-option-pill fb-option-pill--red', text: 'Bug' },
    ]);
  });

  it('dims pending pills with the spinner', () => {
    const { container } = render(selectCell(typeField, issue({ _type_status: 'pending' })));

    expect(container.querySelector('.ai-cell')?.className).toBe('ai-cell ai-cell--pending');
    expect(screen.getByRole('img', { name: 'Generating' })).toBeTruthy();
    expect(renderPills()).toEqual([
      { className: 'fb-option-pill fb-option-pill--red', text: 'Bug' },
    ]);
  });

  it.each(['board', 'calendar'])('shows pills on a %s card', (viewType) => {
    render(selectCell(typeField, issue(), { viewType }));

    expect(screen.queryByRole('button')).toBeNull();
    expect(renderPills()).toEqual([
      { className: 'fb-option-pill fb-option-pill--red', text: 'Bug' },
    ]);
  });

  it('draws nothing for an empty multiple select', () => {
    const rowData = row({ notes: 'Broken', labels: [], _labels_status: 'done' });

    render(selectCell(labelsField, rowData));

    expect(DefaultCell).not.toHaveBeenCalled();
  });
});

describe('AIField for a select', () => {
  function savedIssue(state: Record<string, unknown> = {}) {
    Object.assign(documentInfo, {
      collectionSlug: 'tasks',
      docPermissions: { update: true },
      id: 1,
      savedDocumentData: row({ notes: 'Broken', type: 'bug', _type_status: 'done', ...state }),
    });
  }

  function renderSelect(field: SelectFieldClientProps['field'], props = {}) {
    return render(<AIField field={field} path={field.name} {...props} />);
  }

  it('renders a select with the option labels and the status line', () => {
    form.value = 'bug';

    savedIssue();

    const { container } = renderSelect(typeField);

    expect(container.firstElementChild?.className).toBe('field-type select ai-field');
    expect(container.querySelector('input')).toBeNull();
    expect(statusLine(container)).toBe('Regenerate');

    expect(selectProps()).toMatchObject({
      disabled: false,
      isMulti: false,
      options: [
        { label: 'Bug', value: 'bug' },
        { label: 'Feature', value: 'feature' },
        { label: 'question', value: 'question' },
      ],
      value: { label: 'Bug', value: 'bug' },
    });
  });

  it('shows no selection for an empty value', () => {
    form.value = null;

    savedIssue({ type: null });

    renderSelect(typeField);

    expect(selectProps().value).toBeNull();
  });

  it('saves the picked option, or null when cleared', () => {
    savedIssue();

    renderSelect(typeField);

    selectProps().onChange({ label: 'Feature', value: 'feature' });
    selectProps().onChange(null);

    expect(setValue.mock.calls).toEqual([['feature'], [null]]);
  });

  it('renders a multiple select with the values in stored order', () => {
    form.value = ['question', 'bug'];

    savedIssue({ labels: ['question', 'bug'], _labels_status: 'done' });

    renderSelect(labelsField);

    expect(selectProps()).toMatchObject({
      isMulti: true,
      value: [
        { label: 'question', value: 'question' },
        { label: 'Bug', value: 'bug' },
      ],
    });
  });

  it('saves the picked options of a multiple select, or an empty list when cleared', () => {
    savedIssue({ labels: [], _labels_status: 'done' });

    renderSelect(labelsField);

    selectProps().onChange([{ label: 'Bug', value: 'bug' }]);
    selectProps().onChange(null);

    expect(setValue.mock.calls).toEqual([[['bug']], [[]]]);
  });

  it('disables the select on a read-only field', () => {
    savedIssue();

    renderSelect(typeField, { readOnly: true });

    expect(selectProps().disabled).toBe(true);
  });

  it('fills an unchanged multiple select from the poller', async () => {
    fetchMock.mockReturnValue(
      respond({ docs: [{ id: 1, labels: ['feature'], _labels_status: 'done' }] }),
    );

    form.value = ['bug'];

    savedIssue({ labels: ['bug'], _labels_status: 'pending' });

    const { container } = renderSelect(labelsField);

    await nextTick();

    expect(setValue).toHaveBeenCalledWith(['feature'], true);
    expect(statusLine(container)).toBe('Regenerate');
  });
});

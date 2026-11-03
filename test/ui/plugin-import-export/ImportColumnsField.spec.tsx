import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportColumnsFieldProps } from '../../../packages/plugins/plugin-import-export/src/client/ImportColumnsField.js';
import type { ImportTarget } from '../../../packages/plugins/plugin-import-export/src/columns/suggest.js';
import type { ImportColumnsResponse } from '../../../packages/plugins/plugin-import-export/src/endpoints/importColumns.js';

type Values = Record<string, unknown>;

const form = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  listeners: new Set<() => void>(),
  documentInfo: { collectionSlug: 'imports' } as { collectionSlug: string; id?: number },
}));

function setFormValue(path: string, value: unknown) {
  form.values = { ...form.values, [path]: value };
  form.listeners.forEach((listener) => listener());
}

vi.mock('@frogbotai/ui/admin', async () => {
  const { useSyncExternalStore } = await import('react');

  const subscribe = (listener: () => void) => {
    form.listeners.add(listener);

    return () => form.listeners.delete(listener);
  };

  const useValues = () => useSyncExternalStore(subscribe, () => form.values);

  return {
    FieldLabel: ({ label }: { label: string }) => <span>{label}</span>,
    useConfig: () => ({ config: { routes: { api: '/api' } } }),
    useDocumentInfo: () => form.documentInfo,
    useField: ({ path }: { path: string }) => ({
      value: useValues()[path],
      setValue: (value: unknown) => setFormValue(path, value),
    }),
    useFormFields: (selector: (state: [Record<string, { value: unknown }>]) => unknown) =>
      selector([{ file: { value: useValues().file } }]),
  };
});

const { ImportColumnsField } =
  await import('../../../packages/plugins/plugin-import-export/src/client/ImportColumnsField.js');

const company: ImportTarget = {
  field: 'company',
  label: 'Company',
  type: 'relationship',
  hasMany: false,
  relationship: {
    collection: 'companies',
    matchBy: [
      { field: 'name', label: 'Name' },
      { field: 'id', label: 'ID' },
    ],
    defaultMatchBy: 'name',
  },
};

const columnsResponse: ImportColumnsResponse = {
  headers: ['Full Name', 'Account Name', 'Notes'],
  samples: { 'Full Name': ['Ada Lovelace', 'Grace Hopper'], 'Account Name': ['Acme Corp'] },
  targets: [{ field: 'name', label: 'Name', type: 'text', hasMany: false }, company],
  columns: [
    { header: 'Full Name', field: 'name' },
    { header: 'Account Name', field: 'company', matchBy: 'name', createMissing: false },
    { header: 'Notes', field: null },
  ],
  source: 'names',
};

const fieldProps = {
  field: { name: 'columnMap', label: 'Columns' },
  path: 'columnMap',
} as unknown as ImportColumnsFieldProps;

function respond(...bodies: [unknown, number?][]) {
  const fetch = vi.fn();

  for (const [body, status = 200] of bodies) {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
  }

  vi.stubGlobal('fetch', fetch);

  return fetch;
}

function chooseFile() {
  setFormValue(
    'file',
    new File(['Full Name,Account Name,Notes\nAda Lovelace,Acme Corp,x'], 'contacts.csv', {
      type: 'text/csv',
    }),
  );
}

function stored(): Values {
  return form.values.columnMap as Values;
}

describe('ImportColumnsField', () => {
  beforeEach(() => {
    form.values = { collectionSlug: 'contacts' };
    form.documentInfo = { collectionSlug: 'imports' };
  });

  it('renders nothing until a file is chosen', () => {
    const fetch = respond();

    const { container } = render(<ImportColumnsField {...fieldProps} />);

    expect(container.innerHTML).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lists the headers with samples and pickers from the endpoint, and stores the mapping', async () => {
    const fetch = respond([columnsResponse]);

    render(<ImportColumnsField {...fieldProps} />);
    chooseFile();

    await screen.findByText('Full Name');

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/api/imports/import-columns');
    expect(JSON.parse(init.body as string)).toMatchObject({
      collectionSlug: 'contacts',
      format: 'csv',
      fileData: expect.any(String),
    });
    expect(screen.getByText('Ada Lovelace, Grace Hopper')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Field for "Full Name"' }).textContent).toBe(
      'Name',
    );
    expect(screen.getByRole('combobox', { name: 'Field for "Notes"' }).textContent).toBe('Skip');
    expect(screen.getByRole('combobox', { name: 'Match "Account Name" by' }).textContent).toBe(
      'Name',
    );
    expect(screen.queryByRole('combobox', { name: 'Match "Full Name" by' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suggest with AI' })).toBeNull();
    expect(stored()).toEqual({
      headers: columnsResponse.headers,
      columns: columnsResponse.columns,
    });
  });

  it('turns on create missing for a relationship column', async () => {
    respond([columnsResponse]);

    render(<ImportColumnsField {...fieldProps} />);
    chooseFile();

    fireEvent.click(
      await screen.findByRole('switch', { name: 'Create missing for "Account Name"' }),
    );

    expect((stored().columns as Values[])[1]).toEqual({
      header: 'Account Name',
      field: 'company',
      matchBy: 'name',
      createMissing: true,
    });
  });

  it('fills Skip columns from Suggest with AI when AI is set up', async () => {
    const suggested = [...columnsResponse.columns.slice(0, 2), { header: 'Notes', field: 'name' }];

    const fetch = respond([columnsResponse], [{ columns: suggested, suggested: 1 }]);

    render(<ImportColumnsField {...fieldProps} ai />);
    chooseFile();

    fireEvent.click(await screen.findByRole('button', { name: 'Suggest with AI' }));

    await screen.findByText('AI mapped 1 column. Check them before importing.');

    const [url, init] = fetch.mock.calls[1] as [string, RequestInit];

    expect(url).toBe('/api/imports/suggest-columns');
    expect(JSON.parse(init.body as string)).toMatchObject({
      collectionSlug: 'contacts',
      columns: columnsResponse.columns,
    });
    expect(stored().columns).toEqual(suggested);
  });

  it('keeps the mapping and shows the message when the AI call fails', async () => {
    respond(
      [columnsResponse],
      [
        { columns: columnsResponse.columns, suggested: 0, error: 'AI suggestion failed: down' },
        502,
      ],
    );

    render(<ImportColumnsField {...fieldProps} ai />);
    chooseFile();

    fireEvent.click(await screen.findByRole('button', { name: 'Suggest with AI' }));

    await screen.findByText('AI suggestion failed: down');

    expect(stored().columns).toEqual(columnsResponse.columns);
  });

  it("shows the endpoint's error when the file can't be read", async () => {
    respond([{ error: 'Could not read the file: Invalid Closing Quote' }, 400]);

    render(<ImportColumnsField {...fieldProps} />);
    chooseFile();

    await screen.findByText('Could not read the file: Invalid Closing Quote');

    await waitFor(() => expect(form.values.columnMap).toBeNull());
  });

  it('shows a saved import’s mapping read-only, without fetching', () => {
    const fetch = respond();

    form.documentInfo = { collectionSlug: 'imports', id: 1 };

    form.values = {
      collectionSlug: 'contacts',
      columnMap: {
        headers: ['Full Name', 'Account Name', 'Notes'],
        columns: [
          { header: 'Full Name', field: 'name' },
          { header: 'Account Name', field: 'company', matchBy: 'name', createMissing: true },
          { header: 'Notes', field: null },
        ],
      },
    };

    render(<ImportColumnsField {...fieldProps} ai readOnly />);

    expect(screen.getByText('Account Name').parentElement?.textContent).toBe(
      'Account Name → company, matched by name, create missing',
    );
    expect(screen.getByText('Notes').parentElement?.textContent).toBe('Notes → Skip');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suggest with AI' })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

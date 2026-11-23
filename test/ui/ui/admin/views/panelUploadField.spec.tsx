import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docPermissions: undefined as unknown,
  field: {
    name: 'attachments',
    type: 'upload',
    hasMany: true,
    label: 'Attachments',
    relationTo: 'files',
  } as Record<string, unknown>,
  setValue: vi.fn(),
  submit: vi.fn(),
  value: [1] as unknown,
}));

vi.mock('@payloadcms/ui', async () => {
  const { useState } = await import('react');

  return {
    Button: ({ 'aria-label': label, onClick }: { 'aria-label'?: string; onClick?: () => void }) => (
      <button aria-label={label} onClick={onClick} type="button" />
    ),
    toast: { error: vi.fn() },
    useAuth: () => ({ permissions: { collections: { files: { create: true } } } }),
    useConfig: () => ({
      config: { routes: { api: '/api' } },
      getEntityConfig: () => ({ labels: { singular: 'File' } }),
    }),
    useDocumentInfo: () => ({
      docPermissions: mocks.docPermissions,
      hasSavePermission: true,
      id: 1,
      isTrashed: false,
    }),
    useField: () => {
      const [value, setValue] = useState(mocks.value);

      return {
        setValue: (next: unknown) => {
          mocks.setValue(next);
          setValue(next);
        },
        value,
      };
    },
    useForm: () => ({ submit: mocks.submit }),
    useTranslation: () => ({ i18n: { language: 'en', t: (key: string) => key } }),
    withCondition: (Component: unknown) => Component,
  };
});

vi.mock('../../../../../packages/ui/src/admin/views/panel/PanelConfig.client.js', () => ({
  usePanelLayout: () => ({
    collectionConfig: { fields: [mocks.field], slug: 'tasks' },
    properties: [],
  }),
}));

const { PanelUploadField } =
  await import('../../../../../packages/ui/src/admin/views/panel/PanelUploadField.client.js');

type Respond = (url: string, init?: RequestInit) => Promise<unknown>;

const found: Respond = (url) => {
  const ids = [...new URL(url, 'http://localhost').searchParams.entries()]
    .filter(([key]) => key.startsWith('where[id][in]'))
    .map(([, id]) => Number(id));

  return Promise.resolve({
    json: () => Promise.resolve({ docs: ids.map((id) => ({ filename: `file-${id}.pdf`, id })) }),
    ok: true,
  });
};

const fetchMock = vi.fn<Respond>(found);

async function flush() {
  for (let tick = 0; tick < 5; tick += 1) await act(() => Promise.resolve());
}

beforeEach(() => {
  mocks.docPermissions = undefined;

  mocks.field = {
    name: 'attachments',
    type: 'upload',
    hasMany: true,
    label: 'Attachments',
    relationTo: 'files',
  };

  mocks.setValue.mockReset();
  mocks.submit.mockReset();
  mocks.value = [1];
  fetchMock.mockReset();
  fetchMock.mockImplementation(found);
  vi.stubGlobal('fetch', fetchMock);
});

describe('PanelUploadField', () => {
  it('lists the attached files under the heading, with + and ✕', async () => {
    render(<PanelUploadField path="attachments" />);

    await screen.findByText('file-1.pdf');

    expect(screen.getByRole('heading', { name: 'Attachments' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add file' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove file-1.pdf' })).toBeTruthy();
  });

  it('asks for a file it cannot find only once', async () => {
    fetchMock.mockImplementation(() =>
      fetchMock.mock.calls.length > 10
        ? new Promise(() => undefined)
        : Promise.resolve({ json: () => Promise.resolve({ docs: [] }), ok: true }),
    );

    render(<PanelUploadField path="attachments" />);
    await flush();
    await flush();

    expect(fetchMock.mock.calls.length).toBe(1);
    expect(screen.getByText('#1')).toBeTruthy();
  });

  it('offers no + or ✕ when field-level update access on the upload field is denied', async () => {
    mocks.docPermissions = {
      fields: { attachments: { create: true, read: true, update: false }, title: true },
      update: true,
    };

    render(<PanelUploadField path="attachments" />);
    await screen.findByText('file-1.pdf');

    expect(screen.queryByRole('button', { name: 'Add file' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove file-1.pdf' })).toBeNull();
  });

  it('keeps a file removed while another upload is in flight removed', async () => {
    mocks.value = [1, 2];
    let finish = () => undefined as void;

    fetchMock.mockImplementation((url, init) =>
      init?.method === 'POST'
        ? new Promise((resolve) => {
            finish = () =>
              resolve({
                json: () => Promise.resolve({ doc: { filename: 'new.pdf', id: 7 } }),
                ok: true,
              });
          })
        : found(url, init),
    );

    const { container } = render(<PanelUploadField path="attachments" />);
    await screen.findByText('file-1.pdf');

    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['x'], 'new.pdf')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove file-1.pdf' }));
    finish();
    await flush();

    expect(mocks.setValue).toHaveBeenLastCalledWith([2, 7]);
  });

  it('hides + once a hasMany field holds maxRows files', async () => {
    mocks.field = { ...mocks.field, maxRows: 1 };

    render(<PanelUploadField path="attachments" />);
    await screen.findByText('file-1.pdf');

    expect(screen.queryByRole('button', { name: 'Add file' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove file-1.pdf' })).toBeTruthy();
  });

  it('uploads only as many picked files as maxRows leaves room for', async () => {
    mocks.field = { ...mocks.field, maxRows: 2 };

    fetchMock.mockImplementation((url, init) =>
      init?.method === 'POST'
        ? Promise.resolve({
            json: () => Promise.resolve({ doc: { filename: 'new.pdf', id: 7 } }),
            ok: true,
          })
        : found(url, init),
    );

    const { container } = render(<PanelUploadField path="attachments" />);
    await screen.findByText('file-1.pdf');

    const files = [new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')];
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files } });
    await flush();

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(mocks.setValue).toHaveBeenLastCalledWith([1, 7]);
  });
});

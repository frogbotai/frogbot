import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ClientField } from 'payload';
import type { KeyboardEvent, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CellEditor } from '../../../../../../packages/ui/src/admin/views/List/cellEdit/CellEditor.client';

const mocks = vi.hoisted(() => ({ claims: new Set<string>() }));

vi.mock('@payloadcms/ui', () => {
  const Pass = ({ children }: { children?: ReactNode }) => children;

  return {
    DocumentInfoProvider: Pass,
    Form: Pass,
    OperationProvider: Pass,
    RenderFields: () => (
      <input
        aria-label="custom"
        onKeyDown={(event: KeyboardEvent) => {
          if (mocks.claims.has(event.key)) event.preventDefault();
        }}
      />
    ),
    useAuth: () => ({ user: { id: 1 } }),
    useConfig: () => ({
      config: { routes: { api: '/api' } },
      getEntityConfig: () => ({ slug: 'things' }),
    }),
    useForm: () => ({ submit: vi.fn(() => Promise.resolve()) }),
    useFormModified: () => false,
    useLocale: () => ({ code: 'en' }),
    useServerFunctions: () => ({ getFormState: () => Promise.resolve({ state: {} }) }),
  };
});

const field = { name: 'title', type: 'text' } as ClientField;

async function renderEditor() {
  const onDone = vi.fn();
  const table = document.createElement('table');
  const row = table.insertRow();

  document.body.append(table);

  render(
    <CellEditor
      collectionSlug="things"
      field={field}
      handleRef={{ current: null }}
      id="1"
      onDone={onDone}
      onSaved={() => undefined}
      parentPath=""
      path="title"
      permissions={undefined}
    />,
    { container: row.insertCell() },
  );

  return { input: await screen.findByLabelText('custom'), onDone };
}

describe('CellEditor keys', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ id: 1, title: 'a' }), { status: 200 })),
      ),
    );
  });

  afterEach(() => {
    mocks.claims.clear();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('cancels on Esc', async () => {
    const { input, onDone } = await renderEditor();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onDone).toHaveBeenCalledWith('cancel');
  });

  it('closes an open menu on Esc before it cancels', async () => {
    const { input, onDone } = await renderEditor();
    const menu = document.createElement('div');

    menu.className = 'rs__menu';
    document.body.append(menu);
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onDone).not.toHaveBeenCalled();
  });

  it('saves on Enter', async () => {
    const { input, onDone } = await renderEditor();

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('saved'));
  });

  it('leaves Enter to a control that prevents it', async () => {
    mocks.claims.add('Enter');
    const { input, onDone } = await renderEditor();

    fireEvent.keyDown(input, { key: 'Enter' });
    await Promise.resolve();

    expect(onDone).not.toHaveBeenCalled();
  });
});

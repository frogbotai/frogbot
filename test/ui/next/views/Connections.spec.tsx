import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { getCachedFrogBot } from 'frogbot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionsViewClient } from '../../../../packages/next/src/views/Connections/ConnectionsView.client.js';
import { ConnectionsView } from '../../../../packages/next/src/views/Connections/index.js';
import {
  connectionInput,
  initialConnectionValue,
  projectConnectionSchema,
} from '../../../../packages/next/src/views/Connections/schema.js';
import type { ConnectionPiece } from '../../../../packages/next/src/views/Connections/types.js';

vi.mock('@payloadcms/ui', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('frogbot', () => ({ getCachedFrogBot: vi.fn() }));

const pieces: ConnectionPiece[] = [
  { slug: 'mail', label: 'Mail', oauth: true, secret: true, secretSchema: { type: 'string' } },
  { slug: 'static', label: 'Static', oauth: false, secret: true, secretSchema: { type: 'string' } },
];
const row = {
  id: 'connection/1',
  piece: 'mail',
  method: 'oauth' as const,
  status: 'active' as const,
  account: { label: 'Work', email: 'work@example.com' },
};
const props = {
  apiPath: '/custom-api/connections',
  returnTo: '/control/settings/connections',
  pieces,
  initialConnections: [row],
};
const fetchMock = vi.fn();

beforeEach(() => {
  vi.mocked(getCachedFrogBot).mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('linked accounts', () => {
  it.each([false, true])(
    'projects safe owner metadata with a Next admin request: %s',
    async (adminRequest) => {
      const list = vi.fn().mockResolvedValue([
        {
          ...row,
          credential: 'ciphertext',
          owner: 'private-owner',
          account: { ...row.account, token: 'private-token' },
        },
      ]);
      const req = {
        user: { id: 1 },
        frogbot: {
          config: {
            connections: {
              enabled: true,
              entries: {
                mail: {
                  piece: { piece: 'mail', oauth: { clientSecret: 'oauth-secret' } },
                  oauth: true,
                  secret: true,
                  secretSchema: {
                    type: 'string',
                    default: 'credential-default',
                    examples: ['credential-example'],
                  },
                },
              },
            },
          },
          connections: { list },
        },
      };
      if (adminRequest) {
        vi.mocked(getCachedFrogBot).mockReturnValue(req.frogbot as never);
        Reflect.deleteProperty(req, 'frogbot');
      }
      const view = await ConnectionsView({
        initPageResult: { req },
        payload: { config: { routes: { api: '/custom-api', admin: '/control' } } },
      } as never);
      expect(list).toHaveBeenCalledWith({ req });
      expect(view?.props.apiPath).toBe('/custom-api/connections');
      expect(view?.props.returnTo).toBe('/control/settings/connections');
      const serialized = JSON.stringify(view?.props);
      for (const secret of [
        'ciphertext',
        'private-owner',
        'private-token',
        'oauth-secret',
        'credential-default',
        'credential-example',
      ]) {
        expect(serialized).not.toContain(secret);
      }
    },
  );

  it('searches account metadata and disconnects through the configured prefix', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ docs: [] }));
    render(<ConnectionsViewClient {...props} />);
    fireEvent.change(screen.getByLabelText('Search connections'), { target: { value: 'missing' } });
    expect(screen.getByText('No connections match your search')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search connections'), {
      target: { value: 'work@example.com' },
    });
    expect(screen.getByText('Work')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Options for Mail' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Disconnect' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/custom-api/connections/connection%2F1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() => expect(screen.queryByText('Work')).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      '/custom-api/connections?limit=0&depth=0',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('uses one searchable modal, switches methods and posts raw masked credentials', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ id: 2 }))
      .mockResolvedValueOnce(Response.json({ docs: [row] }));
    render(<ConnectionsViewClient {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New Connection' }));
    fireEvent.change(screen.getByLabelText('Search integrations'), { target: { value: 'mail' } });
    expect(screen.queryByRole('button', { name: /^Static/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Mail OAuth/ }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Continue with Mail' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Static credentials' }));
    const credential = screen.getByLabelText('Credential');
    expect(credential.getAttribute('type')).toBe('password');
    fireEvent.change(credential, { target: { value: 'raw-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/custom-api/connections/mail',
        expect.objectContaining({ method: 'POST', body: '"raw-secret"' }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps failed forms open and clears credentials when returning to the picker', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    render(<ConnectionsViewClient {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New Connection' }));
    fireEvent.click(screen.getByRole('button', { name: /^Static Static credentials/ }));
    fireEvent.change(screen.getByLabelText('Credential'), { target: { value: 'bad-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'These credentials were not accepted. Check the values and try again.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: /^Static Static credentials/ }));
    expect(screen.getByLabelText('Credential')).toHaveProperty('value', '');
  });

  it('recovers from an initial loading error', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ docs: [row] }));
    render(
      <ConnectionsViewClient
        {...props}
        initialConnections={[]}
        initialError="Could not load your linked accounts."
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('status').textContent).toContain('Loading connections');
    await screen.findByText('Work');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('distinguishes optional omission from explicit null and renders typed choices', async () => {
    const schema = projectConnectionSchema({
      type: 'object',
      required: ['port'],
      properties: {
        token: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        port: { type: 'integer', enum: [80, 443] },
      },
    });
    fetchMock
      .mockResolvedValueOnce(Response.json({ id: 3 }))
      .mockResolvedValueOnce(Response.json({ docs: [] }));
    render(<ConnectionsViewClient {...props} pieces={[{ ...pieces[1]!, secretSchema: schema }]} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New Connection' }));
    fireEvent.click(screen.getByRole('button', { name: /^Static Static credentials/ }));
    expect(screen.getByRole('combobox', { name: 'token value mode' }).textContent).toBe(
      'Not provided',
    );
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'token value mode' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(await screen.findByRole('option', { name: 'Null', exact: true }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'port' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: '443' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/custom-api/connections/static',
        expect.objectContaining({ body: JSON.stringify({ token: null, port: 443 }) }),
      ),
    );
  });

  it('edits arrays of nested objects, booleans and numbers without a JSON textarea', async () => {
    const schema = projectConnectionSchema({
      type: 'object',
      required: ['accounts'],
      properties: {
        accounts: {
          type: 'array',
          items: {
            type: 'object',
            required: ['token', 'port', 'enabled'],
            properties: {
              token: { type: 'string' },
              port: { type: 'integer' },
              enabled: { type: 'boolean' },
            },
          },
        },
      },
    });
    fetchMock
      .mockResolvedValueOnce(Response.json({ id: 3 }))
      .mockResolvedValueOnce(Response.json({ docs: [] }));
    render(<ConnectionsViewClient {...props} pieces={[{ ...pieces[1]!, secretSchema: schema }]} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New Connection' }));
    fireEvent.click(screen.getByRole('button', { name: /^Static Static credentials/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('token'), { target: { value: 'nested-secret' } });
    fireEvent.change(screen.getByLabelText('port'), { target: { value: '443' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'enabled' }));
    expect(within(screen.getByRole('dialog')).queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/custom-api/connections/static',
        expect.objectContaining({
          body: JSON.stringify({
            accounts: [{ token: 'nested-secret', port: 443, enabled: true }],
          }),
        }),
      ),
    );
  });
});

describe('connection input schemas', () => {
  it('preserves omission, null, false, empty strings and arrays as distinct raw values', () => {
    const field = projectConnectionSchema({
      type: 'object',
      required: ['nested', 'items'],
      properties: {
        optional: { type: 'number' },
        nested: {
          type: 'object',
          required: ['nullable', 'enabled', 'empty'],
          properties: {
            nullable: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            enabled: { type: 'boolean' },
            empty: { type: 'string' },
          },
        },
        items: { type: 'array', items: { anyOf: [{ type: 'number' }, { type: 'null' }] } },
      },
    });
    expect(initialConnectionValue(field)).toEqual({
      nested: { nullable: '', enabled: false, empty: '' },
      items: [],
    });
    expect(
      connectionInput({
        field,
        value: { nested: { nullable: null, enabled: false, empty: '' }, items: ['1.5', null] },
      }),
    ).toEqual({ nested: { nullable: null, enabled: false, empty: '' }, items: [1.5, null] });
    expect(() => connectionInput({ field: { type: 'number' }, value: '' })).toThrow('valid number');
    expect(() => connectionInput({ field: { type: 'integer' }, value: '1.5' })).toThrow(
      'valid integer',
    );
  });

  it('rejects unsupported shapes instead of silently dropping them', () => {
    for (const schema of [
      { type: 'object', additionalProperties: { type: 'string' } },
      { anyOf: [{ type: 'number' }, { type: 'string' }] },
      { $ref: '#/definitions/token' },
      { type: 'array', items: [{ type: 'string' }] },
    ]) {
      expect(() => projectConnectionSchema(schema)).toThrow();
    }
  });
});

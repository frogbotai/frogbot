import type { CollectionAfterChangeHook, Field, FrogBotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import {
  type AuditEntryArgs,
  auditLogPlugin,
} from '../../../packages/plugins/plugin-audit-log/src/index.js';

async function apply(options: Parameters<typeof auditLogPlugin>[0] = {}, fields: Field[] = []) {
  return auditLogPlugin(options)({
    secret: 'test',
    collections: [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'posts', fields },
    ],
  } as never);
}

async function hook(options: Parameters<typeof auditLogPlugin>[0] = {}, fields: Field[] = []) {
  const result = await apply(options, fields);

  return result.collections.find((item) => item.slug === 'posts')?.hooks
    ?.afterChange?.[0] as CollectionAfterChangeHook;
}

function request(user: Record<string, unknown> | null = null) {
  const create = vi.fn().mockResolvedValue({});
  const error = vi.fn();

  return {
    req: {
      user,
      headers: new Headers({
        'x-forwarded-for': '192.0.2.10, 10.0.0.1',
        'user-agent': 'audit-test',
      }),
      frogbot: { create, logger: { error } },
    } as unknown as FrogBotRequest,
    create,
    error,
  };
}

describe('audit hooks', () => {
  it('records session attribution and update changes', async () => {
    const write = request({ id: 'user-1' });
    const afterChange = await hook();

    await afterChange({
      doc: { id: 'post-1', title: 'After' },
      previousDoc: { id: 'post-1', title: 'Before' },
      operation: 'update',
      req: write.req,
    } as never);

    expect(write.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'audit-logs',
        overrideAccess: true,
        data: expect.objectContaining({
          collection: 'posts',
          operation: 'update',
          documentId: 'post-1',
          user: 'user-1',
          changes: { title: { old: 'Before', new: 'After' } },
        }),
      }),
    );
  });

  it('records API key, metadata, and snapshot options', async () => {
    const write = request({ id: 'user-1', apiKeyId: 42, _strategy: 'api-key' });
    const afterChange = await hook({ ipAddress: true, snapshot: 'always', trustProxy: true });

    await afterChange({
      doc: { id: 7, title: 'Created' },
      previousDoc: undefined,
      operation: 'create',
      req: write.req,
    } as never);

    expect(write.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        apiKeyId: '42',
        ip: '192.0.2.10',
        userAgent: 'audit-test',
        snapshot: { id: 7, title: 'Created' },
      }),
    );
  });

  it('ignores forwarded IP headers unless proxy trust is enabled', async () => {
    const write = request();
    const afterChange = await hook({ ipAddress: true });

    await afterChange({
      doc: { id: 7 },
      previousDoc: undefined,
      operation: 'create',
      req: write.req,
    } as never);

    expect(write.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ ip: undefined, userAgent: 'audit-test' }),
    );
  });

  it('only records API key IDs from the API-key auth strategy', async () => {
    const write = request({ id: 'user-1', apiKeyId: 'spoofed', _strategy: 'local-jwt' });
    const afterChange = await hook();

    await afterChange({
      doc: { id: 7 },
      previousDoc: undefined,
      operation: 'create',
      req: write.req,
    } as never);

    expect(write.create.mock.calls[0][0].data.apiKeyId).toBeUndefined();
  });

  it('records userless deletes with delete snapshots', async () => {
    const result = await auditLogPlugin({ snapshot: 'delete' })({
      secret: 'test',
      collections: [{ slug: 'posts', fields: [] }],
    } as never);

    const afterDelete = result.collections.find((item) => item.slug === 'posts')?.hooks
      ?.afterDelete?.[0];

    const write = request();
    await afterDelete?.({ doc: { id: 'post-1', title: 'Deleted' }, req: write.req } as never);

    expect(write.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        operation: 'delete',
        user: undefined,
        changes: {},
        snapshot: { id: 'post-1', title: 'Deleted' },
      }),
    );
  });

  it('does not record disabled change operations', async () => {
    const write = request();
    const afterChange = await hook({ operations: ['create'] });

    await afterChange({
      doc: { id: 'post-1', title: 'After' },
      previousDoc: { id: 'post-1', title: 'Before' },
      operation: 'update',
      req: write.req,
    } as never);

    expect(write.create).not.toHaveBeenCalled();
  });

  it('logs a failed write and keeps the change when there is no transaction', async () => {
    const write = request();
    write.create.mockRejectedValue(new Error('database unavailable'));
    const afterChange = await hook();

    await expect(
      afterChange({
        doc: { id: 'post-1' },
        previousDoc: undefined,
        operation: 'create',
        req: write.req,
      } as never),
    ).resolves.toEqual({ id: 'post-1' });
    expect(write.error).toHaveBeenCalledOnce();
  });

  it('logs a failed write and fails the change inside a transaction', async () => {
    const write = request();
    const failure = new Error('invalid entry');

    write.create.mockImplementation(({ req }: { req: FrogBotRequest }) => {
      delete req.transactionID;

      return Promise.reject(failure);
    });

    write.req.transactionID = 'tx-1';
    const afterChange = await hook();

    await expect(
      afterChange({
        doc: { id: 'post-1' },
        previousDoc: undefined,
        operation: 'create',
        req: write.req,
      } as never),
    ).rejects.toBe(failure);
    expect(write.error).toHaveBeenCalledOnce();
  });

  it('waits for the audit write before the hook resolves', async () => {
    const write = request();
    let saved = false;

    write.create.mockImplementation(async () => {
      await Promise.resolve();
      saved = true;
    });

    const afterChange = await hook();

    await afterChange({
      doc: { id: 'post-1' },
      previousDoc: undefined,
      operation: 'create',
      req: write.req,
    } as never);

    expect(saved).toBe(true);
    expect(write.create.mock.calls[0][0].req).toBe(write.req);
  });

  it('writes nothing when entry returns false', async () => {
    const write = request();
    const entry = vi.fn().mockResolvedValue(false);
    const afterChange = await hook({ entry });

    await afterChange({
      doc: { id: 'post-1', lastUsedAt: 'b' },
      previousDoc: { id: 'post-1', lastUsedAt: 'a' },
      operation: 'update',
      req: write.req,
    } as never);

    expect(entry).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        operation: 'update',
        req: write.req,
        entry: expect.objectContaining({ changes: { lastUsedAt: { old: 'a', new: 'b' } } }),
      }),
    );
    expect(write.create).not.toHaveBeenCalled();
  });

  it('saves values added by entry into a field from overrides.fields', async () => {
    const write = request({ id: 'user-1', tenant: 'acme' });
    const options = {
      overrides: {
        fields: ({ defaultFields }: { defaultFields: Field[] }): Field[] => [
          ...defaultFields,
          { name: 'tenant', type: 'text' },
        ],
      },
      entry: ({ entry, req }: AuditEntryArgs) => ({ ...entry, tenant: req.user?.tenant }),
    };

    const result = await apply(options);
    const audit = result.collections.find((item) => item.slug === 'audit-logs');
    const afterChange = await hook(options);

    await afterChange({
      doc: { id: 'post-1' },
      previousDoc: undefined,
      operation: 'create',
      req: write.req,
    } as never);

    expect(audit?.fields.map((field) => ('name' in field ? field.name : undefined))).toContain(
      'tenant',
    );
    expect(write.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ collection: 'posts', tenant: 'acme' }),
    );
  });

  it('logs and writes nothing when entry throws', async () => {
    const write = request();
    const afterChange = await hook({
      entry: () => {
        throw new Error('bad entry');
      },
    });

    await expect(
      afterChange({
        doc: { id: 'post-1' },
        previousDoc: undefined,
        operation: 'create',
        req: write.req,
      } as never),
    ).resolves.toEqual({ id: 'post-1' });
    expect(write.create).not.toHaveBeenCalled();
    expect(write.error).toHaveBeenCalledOnce();
  });

  it('reads hidden fields from the final collection config the hook receives', async () => {
    const write = request();
    const afterChange = await hook();

    await afterChange({
      collection: { slug: 'posts', fields: [{ name: 'hash', type: 'text', hidden: true }] },
      doc: { id: 'post-1', hash: 'new' },
      previousDoc: { id: 'post-1', hash: 'old' },
      operation: 'update',
      req: write.req,
    } as never);

    expect(write.create.mock.calls[0][0].data.changes).toEqual({});
  });

  it('keeps hidden fields out of changes, snapshot and entry', async () => {
    const write = request();
    const entry = vi.fn(({ entry: value }: AuditEntryArgs) => value);
    const fields: Field[] = [
      { name: 'title', type: 'text' },
      { name: 'secret', type: 'text', hidden: true },
      { name: 'kept', type: 'text', admin: { disabled: true } },
      {
        name: 'meta',
        type: 'group',
        fields: [
          { name: 'token', type: 'text', hidden: true },
          { name: 'note', type: 'text' },
        ],
      },
      {
        type: 'tabs',
        tabs: [
          { label: 'Main', fields: [{ name: 'tabSecret', type: 'text', hidden: true }] },
          { name: 'named', fields: [{ name: 'inner', type: 'text', hidden: true }] },
        ],
      },
      { type: 'row', fields: [{ name: 'rowSecret', type: 'text', hidden: true }] },
      {
        name: 'items',
        type: 'array',
        fields: [
          { name: 'code', type: 'text', hidden: true },
          { name: 'label', type: 'text' },
        ],
      },
      {
        name: 'layout',
        type: 'blocks',
        blocks: [{ slug: 'cta', fields: [{ name: 'key', type: 'text', hidden: true }] }],
      },
    ];

    const afterChange = await hook({ snapshot: 'always', entry }, fields);
    const hidden = {
      secret: 'x',
      tabSecret: 'x',
      rowSecret: 'x',
      named: { inner: 'x' },
      meta: { token: 'x', note: 'n' },
      items: [{ code: 'x', label: 'l' }],
      layout: [{ blockType: 'cta', key: 'x' }],
    };

    await afterChange({
      doc: { id: 'post-1', title: 'After', kept: 'k2', ...hidden },
      previousDoc: { id: 'post-1', title: 'Before', kept: 'k1', ...hidden, secret: 'old' },
      operation: 'update',
      req: write.req,
    } as never);

    const data = write.create.mock.calls[0][0].data;
    const expected = {
      id: 'post-1',
      title: 'After',
      kept: 'k2',
      named: {},
      meta: { note: 'n' },
      items: [{ label: 'l' }],
      layout: [{ blockType: 'cta' }],
    };

    expect(data.snapshot).toEqual(expected);
    expect(data.changes).toEqual({
      title: { old: 'Before', new: 'After' },
      kept: { old: 'k1', new: 'k2' },
    });
    expect(entry.mock.calls[0][0].doc).toEqual(expected);
    expect(entry.mock.calls[0][0].previousDoc).not.toHaveProperty('secret');
    expect(JSON.stringify(data)).not.toContain('"x"');
  });

  it('stores related docs as ids, at any depth', async () => {
    const write = request();
    const entry = vi.fn(({ entry: value }: AuditEntryArgs) => value);
    const fields: Field[] = [
      { name: 'author', type: 'relationship', relationTo: 'users' },
      { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
      { name: 'owner', type: 'relationship', relationTo: ['users', 'teams'] },
      { name: 'image', type: 'upload', relationTo: 'media' },
      { name: 'posts', type: 'join', collection: 'posts', on: 'author' },
      {
        name: 'items',
        type: 'array',
        fields: [{ name: 'ref', type: 'relationship', relationTo: 'users' }],
      },
    ];

    const user = { id: 'u1', email: 'a@b.c', hash: 'x', salt: 'x' };
    const afterChange = await hook({ snapshot: 'always', entry }, fields);

    await afterChange({
      doc: {
        id: 'post-1',
        author: user,
        tags: [{ id: 't1', secret: 'x' }, 't2'],
        owner: { relationTo: 'users', value: user },
        image: { id: 'm1', secret: 'x' },
        posts: { docs: [{ id: 'p2', secret: 'x' }], hasNextPage: false },
        items: [{ ref: user }],
      },
      previousDoc: {
        id: 'post-1',
        author: 'u1',
        tags: ['t1', 't2'],
        owner: { relationTo: 'users', value: 'u1' },
        image: 'm1',
        posts: { docs: ['p2'], hasNextPage: false },
        items: [{ ref: 'u1' }],
      },
      operation: 'update',
      req: write.req,
    } as never);

    const data = write.create.mock.calls[0][0].data;

    expect(data.changes).toEqual({});
    expect(data.snapshot).toEqual({
      id: 'post-1',
      author: 'u1',
      tags: ['t1', 't2'],
      owner: { relationTo: 'users', value: 'u1' },
      image: 'm1',
      posts: { docs: ['p2'], hasNextPage: false },
      items: [{ ref: 'u1' }],
    });
    expect(entry.mock.calls[0][0].doc).toEqual(data.snapshot);
    expect(JSON.stringify(data)).not.toContain('"x"');
  });
});

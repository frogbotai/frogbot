import type { AfterChangeHook, FrogbotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { auditLogPlugin } from '../../../packages/plugins/plugin-audit-log/src/index.js';

async function hook(options: Parameters<typeof auditLogPlugin>[0] = {}) {
  const result = await auditLogPlugin(options)({
    secret: 'test',
    collections: [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'posts', fields: [] },
    ],
  } as never);
  return result.collections.find((item) => item.slug === 'posts')?.hooks
    ?.afterChange?.[0] as AfterChangeHook;
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
    } as unknown as FrogbotRequest,
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

  it('does not fail the source operation when writing fails', async () => {
    const write = request();
    write.create.mockRejectedValue(new Error('database unavailable'));
    const afterChange = await hook();
    expect(
      afterChange({
        doc: { id: 'post-1' },
        previousDoc: undefined,
        operation: 'create',
        req: write.req,
      } as never),
    ).toEqual({ id: 'post-1' });
    await vi.waitFor(() => expect(write.error).toHaveBeenCalledOnce());
  });
});

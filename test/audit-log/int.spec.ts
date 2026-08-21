import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot.js';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const credentials = { email: 'audit@frogbot.local', password: 'audit-password' };

type AuditEntry = {
  apiKeyId?: number | string;
  changes: Record<string, { old: unknown; new: unknown }>;
  documentId: string;
  operation: 'create' | 'delete' | 'update';
  user?: number | string;
};

describe('audit log plugin integration', () => {
  let booted: BootedFrogbot;
  let accountId: number | string;
  let authorization: Record<string, string>;

  beforeAll(async () => {
    booted = await bootFrogbot(dirname);
    const account = await booted.restClient.post<{ doc: { id: number | string } }>(
      '/api/accounts',
      credentials,
    );
    accountId = account.body.doc.id;
    const login = await booted.restClient.post<{ token: string }>(
      '/api/accounts/login',
      credentials,
    );
    authorization = { Authorization: `JWT ${login.body.token}` };
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  async function entries(documentId: number | string) {
    await vi.waitFor(async () => {
      const result = await booted.frogbot.find({
        collection: 'audit-logs' as never,
        where: { documentId: { equals: String(documentId) } },
        overrideAccess: true,
        depth: 0,
        limit: 20,
      });
      expect(result.docs.length).toBeGreaterThan(0);
    });
    const result = await booted.frogbot.find({
      collection: 'audit-logs' as never,
      where: { documentId: { equals: String(documentId) } },
      overrideAccess: true,
      depth: 0,
      limit: 20,
      sort: '-timestamp',
    });
    return result.docs as unknown as AuditEntry[];
  }

  it('records session CRUD exactly once with stable field boundaries', async () => {
    const created = await booted.restClient.post<{ doc: { id: number | string } }>(
      '/api/posts',
      { title: 'Created', optional: 'remove-me' },
      { headers: authorization },
    );
    expect(created.status).toBe(201);
    const id = created.body.doc.id;
    expect(
      (
        await booted.restClient.patch(
          `/api/posts/${id}`,
          { title: 'Updated', optional: null },
          { headers: authorization },
        )
      ).status,
    ).toBe(200);
    expect(
      (await booted.restClient.delete(`/api/posts/${id}`, { headers: authorization })).status,
    ).toBe(200);

    await vi.waitFor(async () => expect(await entries(id)).toHaveLength(3));
    const audit = await entries(id);
    expect(audit.filter((entry) => entry.operation === 'create')).toHaveLength(1);
    expect(audit.filter((entry) => entry.operation === 'update')).toHaveLength(1);
    expect(audit.filter((entry) => entry.operation === 'delete')).toHaveLength(1);
    expect(audit.every((entry) => String(entry.user) === String(accountId))).toBe(true);
    expect(audit.find((entry) => entry.operation === 'update')?.changes.optional).toEqual({
      old: 'remove-me',
      new: null,
    });
  });

  it('attributes verified API-key writes and userless local writes', async () => {
    const mint = await booted.restClient.post<{ id: number | string; token: string }>(
      '/api/credentials/mint',
      { name: 'Audit integration' },
      { headers: authorization },
    );
    const keyed = await booted.restClient.post<{ doc: { id: number | string } }>(
      '/api/posts',
      { title: 'API key' },
      { headers: { 'x-service-key': mint.body.token } },
    );
    const keyedAudit = (await entries(keyed.body.doc.id))[0];
    expect(String(keyedAudit?.user)).toBe(String(accountId));
    expect(String(keyedAudit?.apiKeyId)).toBe(String(mint.body.id));

    const local = await booted.frogbot.create({
      collection: 'posts',
      data: { title: 'Userless' },
      overrideAccess: true,
    });
    const localAudit = (await entries(local.id))[0];
    expect(localAudit?.user).toBeNull();
    expect(localAudit?.apiKeyId).toBeNull();
  });

  it('rejects API writes to audit entries', async () => {
    const existing = (
      await booted.frogbot.find({
        collection: 'audit-logs' as never,
        overrideAccess: true,
        limit: 1,
      })
    ).docs[0]!;
    expect(
      (await booted.restClient.post('/api/audit-logs', {}, { headers: authorization })).status,
    ).toBe(403);
    expect(
      (
        await booted.restClient.patch(
          `/api/audit-logs/${existing.id}`,
          {},
          { headers: authorization },
        )
      ).status,
    ).toBe(403);
    expect(
      (await booted.restClient.delete(`/api/audit-logs/${existing.id}`, { headers: authorization }))
        .status,
    ).toBe(403);
  });

  it('prunes expired entries through the retention task', async () => {
    const old = await booted.frogbot.create({
      collection: 'audit-logs' as never,
      data: {
        collection: 'posts',
        operation: 'create',
        documentId: 'expired',
        changes: {},
        timestamp: '2000-01-01T00:00:00.000Z',
      },
      overrideAccess: true,
    });
    const task = booted.payload.config.jobs?.tasks?.find(
      (candidate) => candidate.slug === 'frogbot-prune-audit-logs',
    );
    await task?.handler({ req: { payload: booted.payload } } as never);
    await expect(
      booted.frogbot.findByID({
        collection: 'audit-logs' as never,
        id: old.id,
        overrideAccess: true,
      }),
    ).rejects.toThrow();
  });
});

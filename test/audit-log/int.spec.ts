import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const credentials = { email: 'audit@frogbot.local', password: 'audit-password' };

describe('audit log plugin integration', () => {
  let booted: BootedFrogBot;
  let accountId: number | string;
  let authorization: Record<string, string>;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
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

  async function entries(documentId: number | string) {
    await vi.waitFor(async () => {
      const result = await booted.frogbot.find({
        collection: 'audit-logs',
        where: { documentId: { equals: String(documentId) } },
        overrideAccess: true,
        depth: 0,
        limit: 20,
      });

      expect(result.docs.length).toBeGreaterThan(0);
    });

    const result = await booted.frogbot.find({
      collection: 'audit-logs',
      where: { documentId: { equals: String(documentId) } },
      overrideAccess: true,
      depth: 0,
      limit: 20,
      sort: '-timestamp',
    });

    return result.docs;
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
    expect(audit.find((entry) => entry.operation === 'update')?.changes).toHaveProperty(
      'optional',
      { old: 'remove-me', new: null },
    );
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

    expect(localAudit?.user ?? null).toBeNull();
    expect(localAudit?.apiKeyId ?? null).toBeNull();
  });

  it('rejects API writes to audit entries', async () => {
    const existing = await booted.frogbot.create({
      collection: 'audit-logs',
      data: {
        collection: 'posts',
        operation: 'create',
        documentId: 'existing',
        changes: {},
        timestamp: new Date().toISOString(),
      },
      overrideAccess: true,
    });

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
      collection: 'audit-logs',
      data: {
        collection: 'posts',
        operation: 'create',
        documentId: 'expired',
        changes: {},
        timestamp: '2000-01-01T00:00:00.000Z',
      },
      overrideAccess: true,
    });

    const job = await booted.frogbot.jobs.queue({ task: 'frogbot-prune-audit-logs', input: {} });
    await booted.frogbot.jobs.runByID({ id: job.id });

    await expect(
      booted.frogbot.findByID({
        collection: 'audit-logs',
        id: old.id,
        overrideAccess: true,
      }),
    ).rejects.toThrow();
  });
});

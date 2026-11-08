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

  async function entries(documentId: number | string, collection = 'posts') {
    await vi.waitFor(async () => {
      const result = await booted.frogbot.find({
        collection: 'audit-logs',
        where: { collection: { equals: collection }, documentId: { equals: String(documentId) } },
        overrideAccess: true,
        depth: 0,
        limit: 20,
      });

      expect(result.docs.length).toBeGreaterThan(0);
    });

    const result = await booted.frogbot.find({
      collection: 'audit-logs',
      where: { collection: { equals: collection }, documentId: { equals: String(documentId) } },
      overrideAccess: true,
      depth: 0,
      limit: 20,
      sort: '-timestamp',
    });

    return result.docs;
  }

  async function begin() {
    const transactionID = await booted.payload.db.beginTransaction();

    if (transactionID === null) throw new Error('[test] the adapter did not start a transaction');
    const req = await booted.frogbot.createRequest();

    req.transactionID = transactionID;

    return { req, transactionID };
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

  it('keeps hidden fields out of changes and snapshot, even with showHiddenFields', async () => {
    const post = await booted.frogbot.create({
      collection: 'posts',
      data: { title: 'Hidden', secret: 's1', meta: { token: 't1', note: 'n1' } },
      overrideAccess: true,
    });

    await booted.frogbot.update({
      collection: 'posts',
      id: post.id,
      data: { title: 'Hidden 2', secret: 's2', meta: { token: 't2', note: 'n2' } },
      overrideAccess: true,
      showHiddenFields: true,
    });

    await booted.frogbot.delete({
      collection: 'posts',
      id: post.id,
      overrideAccess: true,
      showHiddenFields: true,
    });

    const audit = await entries(post.id);
    const update = audit.find((entry) => entry.operation === 'update');

    expect(audit).toHaveLength(3);
    expect(update?.changes).toEqual({
      title: { old: 'Hidden', new: 'Hidden 2' },
      meta: { old: { note: 'n1' }, new: { note: 'n2' } },
    });
    expect(audit.find((entry) => entry.operation === 'create')?.changes).not.toHaveProperty(
      'secret',
    );
    expect(audit.find((entry) => entry.operation === 'delete')?.snapshot).toEqual(
      expect.objectContaining({ title: 'Hidden 2', meta: { note: 'n2' } }),
    );
    expect(JSON.stringify(audit)).not.toMatch(/"(s1|s2|t1|t2)"/);
  });

  it('keeps login fields core adds, such as hash and salt, out of entries', async () => {
    await booted.frogbot.update({
      collection: 'accounts',
      id: accountId,
      data: { password: 'audit-password-2' },
      overrideAccess: true,
    });

    await booted.frogbot.delete({ collection: 'accounts', id: accountId, overrideAccess: true });

    const audit = await entries(accountId, 'accounts');

    expect(audit.map((entry) => entry.operation).sort()).toEqual(['create', 'delete', 'update']);
    expect(JSON.stringify(audit)).not.toMatch(/"(hash|salt|resetPasswordToken|lockUntil)"/);
  });

  it('leaves no entry when the change is rolled back', async () => {
    const { req, transactionID } = await begin();
    const post = await booted.frogbot.create({
      collection: 'posts',
      data: { title: 'Rolled back' },
      overrideAccess: true,
      req,
    });

    await booted.payload.db.rollbackTransaction(transactionID);

    const posts = await booted.frogbot.find({
      collection: 'posts',
      where: { id: { equals: post.id } },
      overrideAccess: true,
    });

    const audit = await booted.frogbot.find({
      collection: 'audit-logs',
      where: { collection: { equals: 'posts' }, documentId: { equals: String(post.id) } },
      overrideAccess: true,
    });

    expect(posts.docs).toEqual([]);
    expect(audit.docs).toEqual([]);
  });

  async function postsTitled(title: string) {
    const result = await booted.frogbot.find({
      collection: 'posts',
      where: { title: { equals: title } },
      overrideAccess: true,
      depth: 0,
    });

    return result.docs;
  }

  async function allEntries() {
    const result = await booted.frogbot.find({
      collection: 'audit-logs',
      overrideAccess: true,
      depth: 0,
      limit: 0,
    });

    return result.docs;
  }

  it('fails a REST create whose audit write fails, and saves neither', async () => {
    const res = await booted.restClient.post(
      '/api/posts',
      { title: 'BAD create' },
      { headers: authorization },
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await postsTitled('BAD create')).toEqual([]);
    expect(await allEntries()).toEqual([
      expect.objectContaining({ collection: 'accounts', operation: 'create' }),
    ]);
  });

  it('fails a local update whose audit write fails, and keeps the old doc', async () => {
    const post = await booted.frogbot.create({
      collection: 'posts',
      data: { title: 'Before' },
      overrideAccess: true,
    });

    await expect(
      booted.frogbot.update({
        collection: 'posts',
        id: post.id,
        data: { title: 'BAD update' },
        overrideAccess: true,
      }),
    ).rejects.toThrow();

    const fresh = await booted.frogbot.findByID({
      collection: 'posts',
      id: post.id,
      overrideAccess: true,
    });

    expect(fresh.title).toBe('Before');
    expect((await entries(post.id)).map((entry) => entry.operation)).toEqual(['create']);
  });

  it('fails a REST delete whose audit write fails, and keeps the doc', async () => {
    const post = await booted.frogbot.create({
      collection: 'posts',
      data: { title: 'BAD delete' },
      overrideAccess: true,
    });

    const res = await booted.restClient.delete(`/api/posts/${post.id}`, {
      headers: authorization,
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await postsTitled('BAD delete')).map((doc) => String(doc.id))).toEqual([
      String(post.id),
    ]);
  });

  it('throws to a caller whose transaction a failed audit write ended', async () => {
    const { req } = await begin();

    await booted.frogbot.create({
      collection: 'posts',
      data: { title: 'Earlier in tx' },
      overrideAccess: true,
      req,
    });

    await expect(
      booted.frogbot.create({
        collection: 'posts',
        data: { title: 'BAD create' },
        overrideAccess: true,
        req,
      }),
    ).rejects.toThrow();
    expect(req.transactionID).toBeUndefined();
    expect(await postsTitled('Earlier in tx')).toEqual([]);
  });

  it('stores related docs as ids, so their hidden fields stay out', async () => {
    const vault = await booted.frogbot.create({
      collection: 'vault',
      data: { name: 'v', vaultSecret: 'VAULT-SECRET' },
      overrideAccess: true,
    });

    const post = await booted.frogbot.create({
      collection: 'posts',
      data: { title: 'Rel', author: accountId, vaultRef: vault.id },
      overrideAccess: true,
    });

    await booted.frogbot.update({
      collection: 'posts',
      id: post.id,
      data: { title: 'Rel 2' },
      overrideAccess: true,
      showHiddenFields: true,
    });

    await booted.frogbot.delete({
      collection: 'posts',
      id: post.id,
      overrideAccess: true,
      showHiddenFields: true,
    });

    const audit = await entries(post.id);

    expect(audit.find((entry) => entry.operation === 'update')?.changes).toEqual({
      title: { old: 'Rel', new: 'Rel 2' },
    });
    expect(audit.find((entry) => entry.operation === 'create')?.changes).toEqual(
      expect.objectContaining({
        author: { old: null, new: accountId },
        vaultRef: { old: null, new: vault.id },
      }),
    );
    expect(audit.find((entry) => entry.operation === 'delete')?.snapshot).toEqual(
      expect.objectContaining({ author: accountId, vaultRef: vault.id }),
    );
    expect(JSON.stringify(audit)).not.toMatch(/VAULT-SECRET|"hash"|"salt"/);
  });

  it('keeps the default entry shape', async () => {
    const post = await booted.frogbot.create({
      collection: 'posts',
      data: { title: 'Shape' },
      overrideAccess: true,
    });

    const [entry] = await entries(post.id);

    expect(entry).toEqual(
      expect.objectContaining({
        collection: 'posts',
        operation: 'create',
        documentId: String(post.id),
        changes: expect.objectContaining({ title: { old: null, new: 'Shape' } }),
        timestamp: expect.any(String),
      }),
    );
    expect(Object.keys(entry).sort()).toEqual(
      [
        'apiKeyId',
        'changes',
        'collection',
        'createdAt',
        'documentId',
        'id',
        'operation',
        'snapshot',
        'timestamp',
        'updatedAt',
        'user',
      ].sort(),
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
    for (let index = 0; index < 101; index++) {
      await booted.frogbot.create({
        collection: 'audit-logs',
        data: {
          collection: 'posts',
          operation: 'create',
          documentId: `expired-${index}`,
          changes: {},
          timestamp: '2000-01-01T00:00:00.000Z',
        },
        overrideAccess: true,
      });
    }

    const recent = await booted.frogbot.create({
      collection: 'audit-logs',
      data: {
        collection: 'posts',
        operation: 'create',
        documentId: 'recent',
        changes: {},
        timestamp: new Date().toISOString(),
      },
      overrideAccess: true,
    });

    const job = await booted.frogbot.jobs.queue({
      task: 'frogbot-prune-audit-logs',
      input: {},
      overrideAccess: true,
    });

    await booted.frogbot.jobs.runByID({ id: job.id, overrideAccess: true });

    const remaining = await booted.frogbot.find({
      collection: 'audit-logs',
      where: { collection: { equals: 'posts' } },
      limit: 0,
      overrideAccess: true,
    });

    expect(remaining.docs.map((doc) => doc.id)).toEqual([recent.id]);
  });

  it('schedules pruning on the default queue alongside a job left on the old queue', async () => {
    const post = await booted.frogbot.create({
      collection: 'posts',
      data: { title: 'Kept' },
      overrideAccess: true,
    });

    await booted.frogbot.create({
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

    const leftover = await booted.frogbot.jobs.queue({
      task: 'frogbot-prune-audit-logs',
      queue: 'frogbot-prune-audit-logs',
      input: {},
      overrideAccess: true,
    });

    const oldQueue = await booted.frogbot.jobs.handleSchedules({
      queue: 'frogbot-prune-audit-logs',
    });

    const defaultQueue = await booted.frogbot.jobs.handleSchedules({ queue: 'default' });

    expect(oldQueue.queued).toEqual([]);
    expect(defaultQueue.errored).toEqual([]);

    const scheduled = await booted.payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'frogbot-prune-audit-logs' }, id: { not_equals: leftover.id } },
      limit: 0,
      overrideAccess: true,
    });

    expect(scheduled.docs).toEqual([
      expect.objectContaining({ queue: 'default', meta: { scheduled: true } }),
    ]);

    await booted.frogbot.jobs.runByID({ id: leftover.id, overrideAccess: true });

    const remaining = await booted.frogbot.find({
      collection: 'audit-logs',
      where: { collection: { equals: 'posts' } },
      limit: 0,
      overrideAccess: true,
    });

    expect(remaining.docs.map((doc) => doc.documentId)).toEqual([String(post.id)]);
    expect(
      (await booted.frogbot.findByID({ collection: 'posts', id: post.id, overrideAccess: true }))
        .title,
    ).toBe('Kept');
  });
});

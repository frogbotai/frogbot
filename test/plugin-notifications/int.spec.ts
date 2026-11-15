import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { notify } from '@frogbotai/plugin-notifications';
import { toPayloadRequest } from 'frogbot/internal';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Doc = Record<string, unknown> & { id: number | string };

const text = (value: string) => ({
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  type: 'text',
  version: 1,
});

function body(...children: Record<string, unknown>[]) {
  return {
    root: {
      children: [
        {
          children,
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  };
}

const mention = (id: number | string, label: string) => ({
  label,
  relationTo: 'users',
  type: 'mention',
  value: id,
  version: 1,
});

describe('notifications plugin', () => {
  let booted: BootedFrogBot;
  const users: Record<string, { headers: Record<string, string>; id: number | string }> = {};

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    for (const name of ['ana', 'sam', 'kim', 'blocked']) {
      const credentials = { email: `${name}@frogbot.local`, password: `${name}-password` };
      const created = await booted.restClient.post<{ doc: Doc }>('/api/users', {
        ...credentials,
        name: name[0].toUpperCase() + name.slice(1),
      });

      const login = await booted.restClient.post<{ token: string }>(
        '/api/users/login',
        credentials,
      );

      users[name] = {
        headers: { Authorization: `JWT ${login.body.token}` },
        id: created.body.doc.id,
      };
    }
  });

  async function deal() {
    return booted.frogbot.create({
      collection: 'deals',
      data: { name: 'Acme' },
      overrideAccess: true,
    });
  }

  async function inbox(as: string) {
    const response = await booted.restClient.get<{ docs: Doc[] }>(
      '/api/notifications?depth=0&sort=createdAt',
      { headers: users[as].headers },
    );

    return response.body.docs;
  }

  async function comment(as: string, data: Record<string, unknown>) {
    return booted.restClient.post<{ doc: Doc }>('/api/comments', data, {
      headers: users[as].headers,
    });
  }

  it('notifies a newly mentioned user once, with an excerpt and a link to the record', async () => {
    const record = await deal();
    const created = await comment('ana', {
      body: body(mention(users.sam.id, 'Sam'), text(' can you check the logs?')),
      collection: 'deals',
      documentId: String(record.id),
    });

    expect(created.status).toBe(201);

    const sam = await inbox('sam');
    const admin = booted.payload.config.routes.admin;

    expect(sam).toHaveLength(1);
    expect(sam[0]).toMatchObject({
      excerpt: '@Sam can you check the logs?',
      link: `${admin === '/' ? '' : admin}/collections/deals/${record.id}`,
      source: 'plugin-comments',
      title: 'Ana mentioned you in a comment',
    });
    expect(sam[0].readAt ?? null).toBeNull();
    expect(await inbox('ana')).toEqual([]);
    expect(await inbox('kim')).toEqual([]);
  });

  it('notifies nobody on an edit, except a user the edit adds', async () => {
    const record = await deal();
    const created = await comment('ana', {
      body: body(mention(users.sam.id, 'Sam'), text(' hi')),
      collection: 'deals',
      documentId: String(record.id),
    });

    const id = created.body.doc.id;

    const edited = await booted.restClient.patch(
      `/api/comments/${id}`,
      { body: body(mention(users.sam.id, 'Sam'), text(' hi again')) },
      { headers: users.ana.headers },
    );

    expect(edited.status).toBe(200);
    expect(await inbox('sam')).toHaveLength(1);

    await booted.restClient.patch(
      `/api/comments/${id}`,
      { body: body(mention(users.sam.id, 'Sam'), text(' and '), mention(users.kim.id, 'Kim')) },
      { headers: users.ana.headers },
    );

    expect(await inbox('sam')).toHaveLength(1);
    expect(await inbox('kim')).toHaveLength(1);
  });

  it("doesn't notify the author, or a user who can't read the record", async () => {
    const record = await deal();

    await comment('ana', {
      body: body(mention(users.ana.id, 'Ana'), text(' and '), mention(users.blocked.id, 'B')),
      collection: 'deals',
      documentId: String(record.id),
    });

    expect(await inbox('ana')).toEqual([]);
    expect(await inbox('blocked')).toEqual([]);

    const all = await booted.frogbot.find({
      collection: 'notifications',
      overrideAccess: true,
      limit: 0,
    });

    expect(all.totalDocs).toBe(0);
  });

  it('lets each user read and mark only their own notifications, and nobody create one', async () => {
    const req = await booted.frogbot.createRequest({});

    await notify(req, { title: 'Job failed', user: users.sam.id, link: '/admin' });
    await notify(req, { title: 'Draft ready', user: users.kim.id });

    const [sams] = await inbox('sam');

    expect(sams.title).toBe('Job failed');
    expect((await inbox('kim')).map((doc) => doc.title)).toEqual(['Draft ready']);

    const byOther = await booted.restClient.get(`/api/notifications/${sams.id}`, {
      headers: users.kim.headers,
    });

    expect(byOther.status).toBe(404);

    const markedByOther = await booted.restClient.patch(
      `/api/notifications/${sams.id}`,
      { readAt: new Date().toISOString() },
      { headers: users.kim.headers },
    );

    expect(markedByOther.status).toBe(403);

    const marked = await booted.restClient.patch<{ doc: Doc }>(
      `/api/notifications/${sams.id}`,
      { readAt: '2026-11-15T12:00:00.000Z', title: 'Changed', user: users.kim.id },
      { headers: users.sam.headers },
    );

    expect(marked.status).toBe(200);
    expect(marked.body.doc.readAt).toBe('2026-11-15T12:00:00.000Z');
    expect(marked.body.doc.title).toBe('Job failed');
    expect(String((marked.body.doc.user as Doc).id)).toBe(String(users.sam.id));

    const forged = await booted.restClient.post(
      '/api/notifications',
      { title: 'Fake', user: users.sam.id },
      { headers: users.kim.headers },
    );

    expect(forged.status).toBe(403);
  });

  it('notify() joins the caller’s transaction', async () => {
    const req = await booted.frogbot.createRequest({});

    const id = (await booted.payload.db.beginTransaction()) as number | string;

    expect(id).toBeTruthy();

    toPayloadRequest(req).transactionID = id;
    await notify(req, { title: 'Rolled back', user: users.sam.id });
    await booted.payload.db.rollbackTransaction(id);

    expect(await inbox('sam')).toEqual([]);
  });
});

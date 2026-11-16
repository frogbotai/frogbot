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
      actor: users.ana.id,
      excerpt: '@Sam can you check the logs?',
      kind: 'mention',
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

  it('never notifies a user twice for one comment, even when an edit removes and re-adds them', async () => {
    const record = await deal();
    const created = await comment('ana', {
      body: body(mention(users.sam.id, 'Sam'), text(' hi')),
      collection: 'deals',
      documentId: String(record.id),
    });

    const id = created.body.doc.id;

    await booted.restClient.patch(
      `/api/comments/${id}`,
      { body: body(text('hi')) },
      { headers: users.ana.headers },
    );

    await booted.restClient.patch(
      `/api/comments/${id}`,
      { body: body(mention(users.sam.id, 'Sam'), text(' hi')) },
      { headers: users.ana.headers },
    );

    expect(await inbox('sam')).toHaveLength(1);
  });

  it('notifies for a comment on a record created earlier in the same transaction', async () => {
    const ana = await booted.frogbot.findByID({
      collection: 'users',
      id: users.ana.id,
      overrideAccess: true,
    });

    const user = { ...ana, collection: 'users' };
    const req = await booted.frogbot.createRequest({ user });
    const id = (await booted.payload.db.beginTransaction()) as number | string;

    toPayloadRequest(req).transactionID = id;

    const record = await booted.frogbot.create({
      collection: 'deals',
      data: { name: 'Acme' },
      overrideAccess: true,
      req,
    });

    await booted.frogbot.create({
      collection: 'comments',
      data: {
        body: body(mention(users.sam.id, 'Sam'), text(' new deal')),
        collection: 'deals',
        documentId: String(record.id),
      },
      overrideAccess: false,
      req,
    });

    await booted.payload.db.commitTransaction(id);

    expect(await inbox('sam')).toHaveLength(1);
    expect(toPayloadRequest(req).user?.id).toBe(users.ana.id);
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

  async function anaReq() {
    const ana = await booted.frogbot.findByID({
      collection: 'users',
      id: users.ana.id,
      overrideAccess: true,
    });

    return booted.frogbot.createRequest({ user: { ...ana, collection: 'users' } });
  }

  it('a bulk edit that newly mentions Sam in two comments notifies Sam once per comment', async () => {
    const record = await deal();

    for (const words of ['first', 'second']) {
      await comment('ana', {
        body: body(text(words)),
        collection: 'deals',
        documentId: String(record.id),
      });
    }

    const req = await anaReq();
    const result = await booted.frogbot.update({
      collection: 'comments',
      data: { body: body(mention(users.sam.id, 'Sam'), text(' look')) },
      overrideAccess: false,
      req,
      where: { author: { equals: users.ana.id } },
    });

    expect(result.errors).toEqual([]);
    expect(result.docs).toHaveLength(2);
    expect(await inbox('sam')).toHaveLength(2);
    expect(toPayloadRequest(req).user?.id).toBe(users.ana.id);
  });

  it('two comments saved at once on one request each notify their own mention', async () => {
    const one = await deal();
    const two = await deal();
    const req = await anaReq();
    const save = (record: Doc, who: string) =>
      booted.frogbot.create({
        collection: 'comments',
        data: {
          body: body(mention(users[who].id, who)),
          collection: 'deals',
          documentId: String(record.id),
        },
        overrideAccess: false,
        req,
      });

    await Promise.all([save(one, 'sam'), save(two, 'kim')]);

    const admin = booted.payload.config.routes.admin;
    const base = `${admin === '/' ? '' : admin}/collections/deals/`;

    expect((await inbox('sam')).map((doc) => doc.link)).toEqual([`${base}${one.id}`]);
    expect((await inbox('kim')).map((doc) => doc.link)).toEqual([`${base}${two.id}`]);
    expect(toPayloadRequest(req).user?.id).toBe(users.ana.id);
  });

  it('an edit saved with select still notifies the user it adds, once', async () => {
    const record = await deal();
    const created = await comment('ana', {
      body: body(text('hi')),
      collection: 'deals',
      documentId: String(record.id),
    });

    await booted.frogbot.update({
      collection: 'comments',
      data: { body: body(mention(users.sam.id, 'Sam'), text(' hi')) },
      id: created.body.doc.id,
      overrideAccess: false,
      req: await anaReq(),
      select: { id: true },
    });

    expect(await inbox('sam')).toHaveLength(1);

    await booted.restClient.patch(
      `/api/comments/${created.body.doc.id}`,
      { body: body(mention(users.sam.id, 'Sam'), text(' hi again')) },
      { headers: users.ana.headers },
    );

    expect(await inbox('sam')).toHaveLength(1);
  });

  it('deleting a user deletes their notifications', async () => {
    const req = await booted.frogbot.createRequest({});

    await notify(req, { title: 'For Sam', user: users.sam.id });
    await notify(req, { title: 'For Kim', user: users.kim.id });
    await booted.frogbot.delete({ collection: 'users', id: users.sam.id, overrideAccess: true });

    const left = await booted.frogbot.find({ collection: 'notifications', overrideAccess: true });

    expect(left.docs.map((doc) => doc.title)).toEqual(['For Kim']);
  });

  it('lets the owner change only readAt', async () => {
    const req = await booted.frogbot.createRequest({});
    const sent = await notify(req, { title: 'Job failed', user: users.sam.id });
    const patched = await booted.restClient.patch<{ doc: Doc }>(
      `/api/notifications/${sent.id}`,
      {
        createdAt: '2000-01-01T00:00:00.000Z',
        readAt: '2026-11-15T12:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
      },
      { headers: users.sam.headers },
    );

    expect(patched.status).toBe(200);

    const stored = await booted.frogbot.findByID({
      collection: 'notifications',
      id: sent.id,
      overrideAccess: true,
    });

    expect(stored.readAt).toBe('2026-11-15T12:00:00.000Z');
    expect(stored.createdAt).toBe(sent.createdAt);
    expect(stored.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
  });

  it('stores fields added with overrides.fields, and nobody can edit them later', async () => {
    const req = await booted.frogbot.createRequest({});
    const sent = await notify(req, {
      archivedAt: '2026-11-15T12:00:00.000Z',
      kind: 'assigned',
      title: 'Assigned to you',
      user: users.sam.id,
    });

    expect(sent).toMatchObject({ archivedAt: '2026-11-15T12:00:00.000Z', kind: 'assigned' });

    await booted.restClient.patch(
      `/api/notifications/${sent.id}`,
      { kind: 'other' },
      { headers: users.sam.headers },
    );

    const stored = await booted.frogbot.findByID({
      collection: 'notifications',
      id: sent.id,
      overrideAccess: true,
    });

    expect(stored.kind).toBe('assigned');
  });

  it('marks all of a user’s unread notifications read in one request, and nobody else’s', async () => {
    const req = await booted.frogbot.createRequest({});

    await notify(req, { title: 'One', user: users.sam.id });
    await notify(req, { title: 'Two', user: users.sam.id });
    await notify(req, { title: 'For Kim', user: users.kim.id });

    const marked = await booted.restClient.patch(
      '/api/notifications?where[readAt][exists]=false&limit=0',
      { readAt: '2026-11-15T12:00:00.000Z' },
      { headers: users.sam.headers },
    );

    expect(marked.status).toBe(200);
    expect((await inbox('sam')).map((doc) => doc.readAt)).toEqual([
      '2026-11-15T12:00:00.000Z',
      '2026-11-15T12:00:00.000Z',
    ]);
    expect((await inbox('kim'))[0].readAt ?? null).toBeNull();
  });
});

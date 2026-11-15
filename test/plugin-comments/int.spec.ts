import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  convertLexicalToPlaintext,
  MentionPlaintextConverter,
} from '@frogbotai/richtext-lexical/plaintext';
import { toPayloadRequest } from 'frogbot/internal';
import { isValidElement, type ReactElement } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { RecordComments } from '../../packages/plugins/plugin-comments/src/rsc/RecordComments.js';
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

describe('comments plugin', () => {
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

    for (const name of ['ana', 'sam', 'blocked']) {
      const credentials = { email: `${name}@frogbot.local`, password: `${name}-password` };
      const created = await booted.restClient.post<{ doc: Doc }>('/api/users', {
        ...credentials,
        name,
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

  async function comment(as: string, data: Record<string, unknown>) {
    return booted.restClient.post<{ doc: Doc; errors?: { message: string }[] }>(
      '/api/comments',
      data,
      {
        headers: users[as].headers,
      },
    );
  }

  it('fills mentions from the body, sets the author, and returns the body as body', async () => {
    const record = await deal();
    const value = body(mention(users.sam.id, 'Sam'), text(' can you check the logs?'));
    const created = await comment('ana', {
      author: users.sam.id,
      body: value,
      collection: 'deals',
      documentId: String(record.id),
    });

    expect(created.status).toBe(201);

    const doc = created.body.doc;

    expect(String((doc.author as Doc).id ?? doc.author)).toBe(String(users.ana.id));
    expect(
      (doc.mentions as (Doc | number | string)[]).map((item) =>
        String(typeof item === 'object' ? item.id : item),
      ),
    ).toEqual([String(users.sam.id)]);
    expect(doc.bodyField).toBe('body_0');
    expect(doc).not.toHaveProperty('body_0');
    expect(
      convertLexicalToPlaintext({
        converters: MentionPlaintextConverter,
        data: doc.body as Parameters<typeof convertLexicalToPlaintext>[0]['data'],
      }),
    ).toBe('@Sam can you check the logs?');
  });

  it('writes no audit entry or version on the record, and needs no update access on it', async () => {
    const record = await deal();
    const before = await booted.frogbot.find({
      collection: 'audit-logs',
      overrideAccess: true,
      limit: 0,
    });

    const versions = await booted.frogbot.findVersions({
      collection: 'deals',
      overrideAccess: true,
    });

    expect(
      (
        await comment('ana', {
          body: body(text('Hi')),
          collection: 'deals',
          documentId: String(record.id),
        })
      ).status,
    ).toBe(201);

    const after = await booted.frogbot.find({
      collection: 'audit-logs',
      overrideAccess: true,
      limit: 0,
    });

    const versionsAfter = await booted.frogbot.findVersions({
      collection: 'deals',
      overrideAccess: true,
    });

    expect(after.totalDocs).toBe(before.totalDocs);
    expect(versionsAfter.totalDocs).toBe(versions.totalDocs);
  });

  it("hides a record's comments from people who can't read the record", async () => {
    const record = await deal();

    await comment('ana', {
      body: body(text('Secret plan')),
      collection: 'deals',
      documentId: String(record.id),
    });

    await comment('ana', { body: body(text('Open task')), collection: 'tasks', documentId: '1' });

    const seen = await booted.restClient.get<{ docs: Doc[] }>('/api/comments?depth=0', {
      headers: users.blocked.headers,
    });

    expect(seen.body.docs.map((doc) => doc.collection)).toEqual([]);

    const task = await booted.frogbot.create({
      collection: 'tasks',
      data: { title: 'T' },
      overrideAccess: true,
    });

    await comment('ana', {
      body: body(text('On a task')),
      collection: 'tasks',
      documentId: String(task.id),
    });

    const visible = await booted.restClient.get<{ docs: Doc[] }>('/api/comments?depth=0', {
      headers: users.blocked.headers,
    });

    expect(visible.body.docs.map((doc) => doc.collection)).toEqual(['tasks']);

    const blocked = await comment('blocked', {
      body: body(text('Let me in')),
      collection: 'deals',
      documentId: String(record.id),
    });

    expect(blocked.status).toBe(403);
  });

  it('lets only the author edit or delete a comment, and re-fills mentions on edit', async () => {
    const record = await deal();
    const created = await comment('ana', {
      body: body(text('Draft')),
      collection: 'deals',
      documentId: String(record.id),
    });

    const id = created.body.doc.id;

    const stranger = await booted.restClient.patch(
      `/api/comments/${id}`,
      { body: body(text('Mine now')) },
      {
        headers: users.sam.headers,
      },
    );

    expect(stranger.status).toBe(403);
    expect(
      (await booted.restClient.delete(`/api/comments/${id}`, { headers: users.sam.headers }))
        .status,
    ).toBe(403);

    const edited = await booted.restClient.patch<{ doc: Doc }>(
      `/api/comments/${id}`,
      { body: body(text('Ping '), mention(users.sam.id, 'Sam')), documentId: '999' },
      { headers: users.ana.headers },
    );

    expect(edited.status).toBe(200);
    expect(edited.body.doc.documentId).toBe(String(record.id));
    expect(edited.body.doc.mentions).toHaveLength(1);
    expect(
      (await booted.restClient.delete(`/api/comments/${id}`, { headers: users.ana.headers }))
        .status,
    ).toBe(200);
  });

  it('refuses an empty comment and a collection without comments', async () => {
    const record = await deal();
    const empty = await comment('ana', {
      body: body(text('   ')),
      collection: 'deals',
      documentId: String(record.id),
    });

    const nowhere = await comment('ana', {
      body: body(text('Hi')),
      collection: 'media',
      documentId: '1',
    });

    expect(empty.status).toBe(400);
    expect(empty.body.errors?.[0]?.message).toBe('A comment needs some text.');
    expect(nowhere.status).toBe(403);
  });

  it("uses each collection's editor: uploads in Deals comments are populated, Tasks get their own body field", async () => {
    const record = await deal();
    const task = await booted.frogbot.create({
      collection: 'tasks',
      data: { title: 'T' },
      overrideAccess: true,
    });

    const media = await booted.frogbot.create({
      collection: 'media',
      data: {},
      file: { data: Buffer.from('hello'), mimetype: 'text/plain', name: 'note.txt', size: 5 },
      overrideAccess: true,
    });

    const upload = {
      fields: {},
      format: '',
      relationTo: 'media',
      type: 'upload',
      value: media.id,
      version: 3,
    };

    const created = await comment('ana', {
      body: { root: { ...body().root, children: [upload] } },
      collection: 'deals',
      documentId: String(record.id),
    });

    expect(created.status).toBe(201);

    const read = await booted.restClient.get<Doc>(`/api/comments/${created.body.doc.id}?depth=1`, {
      headers: users.ana.headers,
    });

    const node = (read.body.body as { root: { children: { value: unknown }[] } }).root.children[0];

    expect(node.value).toMatchObject({ id: media.id, filename: media.filename });

    const plain = await comment('ana', {
      body: body(text('Fine')),
      collection: 'tasks',
      documentId: String(task.id),
    });

    expect(plain.body.doc.bodyField).toBe('body_1');
  });

  it('lists only comments made since the record was created, as a reused id brings back old ones', async () => {
    const record = await deal();

    await booted.frogbot.create({
      collection: 'comments',
      data: {
        author: users.ana.id,
        body: body(text('Left on a deleted record')),
        collection: 'deals',
        createdAt: '2000-01-01T00:00:00.000Z',
        documentId: String(record.id),
      },
      overrideAccess: true,
    });

    await comment('ana', {
      body: body(text('Current')),
      collection: 'deals',
      documentId: String(record.id),
    });

    const req = await booted.frogbot.createRequest();
    const ana = await booted.frogbot.findByID({
      collection: 'users',
      id: users.ana.id,
      overrideAccess: true,
    });

    req.user = { ...ana, collection: 'users' } as typeof req.user;

    const node = await RecordComments({
      collection: 'deals',
      id: record.id,
      req: toPayloadRequest(req) as unknown as Parameters<typeof RecordComments>[0]['req'],
    });

    expect(isValidElement(node)).toBe(true);

    const { initial, target } = (
      node as ReactElement<{ initial: { body: unknown }[]; target: { since?: string } }>
    ).props;

    expect(initial).toHaveLength(1);
    expect(target.since).toBe(record.createdAt);
  });

  it("deletes a record's comments with it, so a new record that reuses its id starts empty", async () => {
    const note = (owner: string, title: string) =>
      booted.frogbot.create({
        collection: 'notes',
        data: { owner: users[owner].id, title },
        overrideAccess: true,
      });

    const old = await note('ana', 'Ana private');

    await comment('ana', {
      body: body(text('Ana secret')),
      collection: 'notes',
      documentId: String(old.id),
    });

    await booted.frogbot.delete({ collection: 'notes', id: old.id, overrideAccess: true });

    const reused = await note('sam', 'Sam note');

    expect(String(reused.id)).toBe(String(old.id));

    const seen = await booted.restClient.get<{ docs: Doc[] }>(
      `/api/comments?depth=0&where[collection][equals]=notes&where[documentId][equals]=${reused.id}`,
      { headers: users.sam.headers },
    );

    expect(seen.body.docs).toEqual([]);

    const left = await booted.frogbot.count({ collection: 'comments', overrideAccess: true });

    expect(left.totalDocs).toBe(0);
  });

  it('refuses a comment from a user outside the author collection', async () => {
    const record = await deal();
    const credentials = { email: 'cust@frogbot.local', password: 'cust-password' };

    await booted.restClient.post('/api/customers', credentials);

    const login = await booted.restClient.post<{ token: string }>(
      '/api/customers/login',
      credentials,
    );

    const posted = await booted.restClient.post(
      '/api/comments',
      {
        body: body(text('From a customer')),
        collection: 'deals',
        documentId: String(record.id),
      },
      { headers: { Authorization: `JWT ${login.body.token}` } },
    );

    expect(posted.status).toBe(403);
  });
});

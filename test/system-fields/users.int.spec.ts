import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { GRAPHQL_POST } from '@frogbotai/next/routes';
import type { FrogBotInstance } from 'frogbot';
import { FrogBot, runQueuedTurn } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';
import type { StubChatModel } from '../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../__helpers/shared/StubChatModel';
import { bootFresh, clearAndNumber, waitForStartupNumbering } from './boot.js';
import config, { buildSystemFieldsConfig } from './config.js';
import {
  adminsSlug,
  agentSlug,
  apiKeysSlug,
  chatsSlug,
  chatTransactionsDatabasePath,
  createTicketToolSlug,
  databasePath,
  exportsSlug,
  importsDir,
  importsSlug,
  messagesSlug,
  modelPort,
  ticketsSlug,
  touchTicketTaskSlug,
  transactionsDatabasePath,
  usageLogsSlug,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const password = 'frogbot-system-fields-password';
const graphQLPost = GRAPHQL_POST(config);
const isMongo = getCurrentDatabaseAdapter() === 'mongodb';
const isSQLite = getCurrentDatabaseAdapter() === 'sqlite';

type ID = number | string;

type SignedIn = {
  id: ID;
  headers: Record<string, string>;
  token: string;
  user: { id: ID; collection: string };
};

type Ticket = {
  id: ID;
  title: string;
  _status?: string | null;
  number?: number | null;
  assignee?: ID | null;
  createdBy?: ID | null;
  lastModifiedBy?: ID | null;
  editedByAdmin?: ID | null;
};

type SavedDoc = { doc: { id: ID } };

const userFields = ['createdBy', 'lastModifiedBy'] as const;

describe('created by and last modified by', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;
  let ana: SignedIn;
  let ben: SignedIn;
  let admin: SignedIn;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'system-fields-users');
    await waitForStartupNumbering(booted.frogbot);
  });

  beforeEach(async () => {
    await clearAndNumber(booted.frogbot);

    ana = await signIn(usersSlug, 'ana@system-fields.test');
    ben = await signIn(usersSlug, 'ben@system-fields.test');
    admin = await signIn(adminsSlug, 'admin@system-fields.test');
  });

  afterEach(async () => {
    model.reset();

    for (const collection of [apiKeysSlug, usageLogsSlug, messagesSlug, chatsSlug]) {
      await booted.frogbot.delete({
        collection: collection as typeof ticketsSlug,
        where: {},
        overrideAccess: true,
      });
    }
  });

  afterAll(async () => {
    await booted.shutdown();
    await model.close();
    await rm(importsDir, { recursive: true, force: true });
    await rm(databasePath, { force: true });
  });

  async function signIn(collection: string, email: string): Promise<SignedIn> {
    const user = await booted.frogbot.create({
      collection: collection as typeof usersSlug,
      data: { email, password },
      overrideAccess: true,
    });

    const login = await booted.restClient.post<{ token: string }>(`/api/${collection}/login`, {
      email,
      password,
    });

    if (login.status !== 200) throw new Error(`Login failed with ${login.status}.`);

    return {
      id: user.id,
      headers: { Authorization: `JWT ${login.body.token}` },
      token: login.body.token,
      user: { id: user.id, collection },
    };
  }

  async function restCreate(by: SignedIn, data: Record<string, unknown>): Promise<ID> {
    const response = await booted.restClient.post<SavedDoc>(`/api/${ticketsSlug}`, data, {
      headers: by.headers,
    });

    expect(response.status).toBe(201);

    return response.body.doc.id;
  }

  async function restUpdate(by: SignedIn, id: ID, data: Record<string, unknown>, query = '') {
    const response = await booted.restClient.patch<SavedDoc>(
      `/api/${ticketsSlug}/${id}${query}`,
      data,
      { headers: by.headers },
    );

    expect(response.status).toBe(200);
  }

  async function readTicket(id: ID, { draft = false } = {}): Promise<Ticket> {
    return (await booted.frogbot.findByID({
      collection: ticketsSlug,
      id,
      depth: 0,
      draft,
      overrideAccess: true,
    })) as unknown as Ticket;
  }

  async function savedBy(id: ID, options?: { draft?: boolean }) {
    const ticket = await readTicket(id, options);

    return { createdBy: ticket.createdBy ?? null, lastModifiedBy: ticket.lastModifiedBy ?? null };
  }

  async function ticketIDs(query: { sort?: string; where?: Record<string, unknown> }) {
    const result = await booted.frogbot.find({
      collection: ticketsSlug,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      ...query,
    } as never);

    return (result.docs as unknown as Ticket[]).map(({ id }) => id);
  }

  async function restTicketIDs(query: string) {
    const response = await booted.restClient.get<{ docs: Ticket[] }>(
      `/api/${ticketsSlug}?depth=0&limit=100&${query}`,
      { headers: ana.headers },
    );

    expect(response.status).toBe(200);

    return response.body.docs.map(({ id }) => id);
  }

  async function graphQL(by: SignedIn, source: string) {
    const response = await graphQLPost(
      new Request('http://localhost/api/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `JWT ${by.token}` },
        body: JSON.stringify({ query: source }),
      }),
    );

    return (await response.json()) as {
      data?: Record<string, { id: ID } | null> | null;
      errors?: { message: string }[];
    };
  }

  async function createAs(user: SignedIn, data: Record<string, unknown>): Promise<ID> {
    const ticket = await booted.frogbot.create({
      collection: ticketsSlug,
      data: data as never,
      user: user.user,
    });

    return ticket.id;
  }

  describe('who counts as the user', () => {
    it('a signed-in REST create records the user as creator and last modifier', async () => {
      const id = await restCreate(ana, { title: 'Printer' });

      expect(await savedBy(id)).toEqual({ createdBy: ana.id, lastModifiedBy: ana.id });
    });

    it('a signed-in REST update records the user as last modifier and keeps the creator', async () => {
      const id = await restCreate(ana, { title: 'Printer' });

      await restUpdate(ben, id, { title: 'Printer on floor 2' });

      expect(await savedBy(id)).toEqual({ createdBy: ana.id, lastModifiedBy: ben.id });
    });

    it('an API key create records the key owner', async () => {
      const mint = await booted.restClient.post<{ token: string }>(
        `/api/${apiKeysSlug}/mint`,
        { name: 'Integration' },
        { headers: ana.headers },
      );

      expect(mint.status).toBe(201);

      const id = await restCreate(
        { ...ana, headers: { Authorization: `Bearer ${mint.body.token}` } },
        { title: 'From the integration' },
      );

      expect(await savedBy(id)).toEqual({ createdBy: ana.id, lastModifiedBy: ana.id });
    });

    it('a chat turn records the person chatting', async () => {
      const chat = await booted.frogbot.create({
        collection: chatsSlug,
        data: { user: ben.id, agent: agentSlug },
        overrideAccess: true,
      });

      await booted.frogbot.create({
        collection: messagesSlug,
        data: {
          id: `queued-${chat.id}`,
          chat: chat.id,
          role: 'user',
          parts: [{ type: 'text', text: 'Open a ticket for the printer.' }],
          status: 'queued',
          delivery: 'queue',
          author: { user: ben.user },
        },
        overrideAccess: true,
      });

      model.respond(
        {
          toolCalls: [
            { id: 'call-create', name: createTicketToolSlug, input: { title: 'From chat' } },
          ],
        },
        { text: 'Opened it.' },
      );

      await runQueuedTurn({ frogbot: booted.frogbot, chatId: chat.id });

      await vi.waitFor(async () => {
        const titled = await booted.frogbot.findByID({
          collection: chatsSlug,
          id: chat.id,
          depth: 0,
          overrideAccess: true,
        });
        const usage = await booted.frogbot.count({
          collection: usageLogsSlug,
          where: { user: { equals: ben.id } },
          overrideAccess: true,
        });

        expect(titled.title).toBeTruthy();
        expect(usage.totalDocs).toBeGreaterThan(0);
      });

      const [id] = await ticketIDs({ where: { title: { equals: 'From chat' } } });

      expect(await savedBy(id!)).toEqual({ createdBy: ben.id, lastModifiedBy: ben.id });
    });

    it('a Local API create with no user leaves both user fields empty', async () => {
      const ticket = await booted.frogbot.create({
        collection: ticketsSlug,
        data: { title: 'From a script' },
      });

      expect(await savedBy(ticket.id)).toEqual({ createdBy: null, lastModifiedBy: null });
    });

    it('a job update after a user save keeps that user as last modifier', async () => {
      const id = await restCreate(ana, { title: 'Printer' });

      await restUpdate(ben, id, { title: 'Printer on floor 2' });

      await booted.frogbot.jobs.queue({
        task: touchTicketTaskSlug,
        input: { ticket: String(id), title: 'Printer, checked' },
      } as never);
      await booted.frogbot.jobs.run();

      const ticket = await readTicket(id);

      expect(ticket.title).toBe('Printer, checked');
      expect(ticket.lastModifiedBy).toBe(ben.id);
    });
  });

  describe('which user collection', () => {
    it('a save by a user from another auth collection leaves lastModifiedBy unchanged and sets editedByAdmin', async () => {
      const id = await restCreate(ana, { title: 'Printer' });

      await restUpdate(admin, id, { title: 'Printer, reviewed' });

      const ticket = await readTicket(id);

      expect(ticket).toMatchObject({
        createdBy: ana.id,
        lastModifiedBy: ana.id,
        editedByAdmin: admin.id,
      });
    });
  });

  describe('read-only to people and agents', () => {
    it('REST create values for the user fields are dropped and the save succeeds', async () => {
      const id = await restCreate(ana, {
        title: 'Printer',
        createdBy: ben.id,
        lastModifiedBy: ben.id,
        editedByAdmin: admin.id,
      });

      const ticket = await readTicket(id);

      expect(ticket).toMatchObject({ createdBy: ana.id, lastModifiedBy: ana.id });
      expect(ticket.editedByAdmin ?? null).toBeNull();
    });

    it('REST update values for the user fields are dropped and the save succeeds', async () => {
      const id = await restCreate(ana, { title: 'Printer' });

      await restUpdate(ana, id, {
        title: 'Printer, again',
        createdBy: ben.id,
        lastModifiedBy: ben.id,
      });

      expect(await savedBy(id)).toEqual({ createdBy: ana.id, lastModifiedBy: ana.id });
    });

    it('GraphQL values for the user fields are dropped and the save succeeds', async () => {
      const body = await graphQL(
        ana,
        `mutation { createTicket(data: { title: "Printer", createdBy: ${JSON.stringify(ben.id)}, lastModifiedBy: ${JSON.stringify(ben.id)} }) { id } }`,
      );

      expect(body.errors).toBeUndefined();
      expect(await savedBy(body.data!.createTicket!.id)).toEqual({
        createdBy: ana.id,
        lastModifiedBy: ana.id,
      });
    });

    it('CSV import values for the user fields are dropped and the rows save', async () => {
      const csv = [
        'title,createdBy,lastModifiedBy',
        `Imported one,${ben.id},${ben.id}`,
        `Imported two,${ben.id},${ben.id}`,
      ].join('\n');
      const data = Buffer.from(csv);

      const imported = await booted.frogbot.create({
        collection: importsSlug,
        data: { collectionSlug: ticketsSlug, importMode: 'create' },
        file: { data, mimetype: 'text/csv', name: 'tickets.csv', size: data.length },
        user: ana.user,
      } as never);

      await booted.frogbot.jobs.run();

      const result = (await booted.frogbot.findByID({
        collection: importsSlug,
        id: imported.id,
        overrideAccess: true,
      } as never)) as unknown as { status: string; summary?: { imported?: number } };

      const ids = await ticketIDs({ where: { title: { like: 'Imported' } }, sort: 'title' });

      expect(result).toMatchObject({ status: 'completed', summary: { imported: 2 } });
      expect(await Promise.all(ids.map((id) => savedBy(id)))).toEqual([
        { createdBy: ana.id, lastModifiedBy: ana.id },
        { createdBy: ana.id, lastModifiedBy: ana.id },
      ]);
    });
  });

  describe('seeds and migrations', () => {
    it('a Local API create keeps supplied user values', async () => {
      const ticket = await booted.frogbot.create({
        collection: ticketsSlug,
        data: { title: 'Seeded', createdBy: ana.id, lastModifiedBy: ben.id },
      });

      expect(await savedBy(ticket.id)).toEqual({ createdBy: ana.id, lastModifiedBy: ben.id });
    });

    it('a trusted update cannot change createdBy', async () => {
      const ticket = await booted.frogbot.create({
        collection: ticketsSlug,
        data: { title: 'Seeded', createdBy: ana.id },
      });

      await booted.frogbot.update({
        collection: ticketsSlug,
        id: ticket.id,
        data: { createdBy: ben.id },
      });

      expect((await savedBy(ticket.id)).createdBy).toBe(ana.id);
    });
  });

  describe('duplicate and versions', () => {
    it('a REST duplicate makes the duplicating user creator and last modifier', async () => {
      const id = await restCreate(ana, { title: 'Printer' });

      const duplicate = await booted.restClient.post<SavedDoc>(
        `/api/${ticketsSlug}/${id}/duplicate`,
        {},
        { headers: ben.headers },
      );

      expect(duplicate.status).toBe(200);
      expect(await savedBy(duplicate.body.doc.id)).toEqual({
        createdBy: ben.id,
        lastModifiedBy: ben.id,
      });
    });

    it('an autosave draft records the saving user', async () => {
      const id = await restCreate(ana, { title: 'Printer' });

      await restUpdate(ben, id, { title: 'Printer, draft' }, '?draft=true&autosave=true');

      const draft = await readTicket(id, { draft: true });

      expect(draft).toMatchObject({
        _status: 'draft',
        createdBy: ana.id,
        lastModifiedBy: ben.id,
      });
    });

    it('restoring a version keeps the creator and records the restoring user', async () => {
      const id = await restCreate(ana, { title: 'Printer' });

      await restUpdate(ana, id, { title: 'Printer on floor 2' });

      const versions = await booted.frogbot.findVersions({
        collection: ticketsSlug,
        where: { parent: { equals: id } },
        sort: 'createdAt',
        overrideAccess: true,
      });

      const restore = await booted.restClient.post(
        `/api/${ticketsSlug}/versions/${versions.docs[0]!.id}`,
        {},
        { headers: ben.headers },
      );

      const ticket = await readTicket(id);

      expect(restore.status).toBe(200);
      expect(ticket).toMatchObject({ title: 'Printer', createdBy: ana.id, lastModifiedBy: ben.id });
    });
  });

  describe('queries', () => {
    async function seedOnePerUser() {
      const cy = await signIn(usersSlug, 'cy@system-fields.test');

      for (const user of [ben, cy, ana]) {
        await createAs(user, { title: `For ${String(user.id)}`, assignee: user.id });
      }
    }

    it.each(userFields)(
      'Local API sort and filter on %s match the same query on assignee',
      async (field) => {
        await seedOnePerUser();

        const sorted = await ticketIDs({ sort: field });
        const reversed = await ticketIDs({ sort: `-${field}` });
        const filtered = await ticketIDs({ where: { [field]: { equals: ana.id } } });

        expect(sorted).toEqual(await ticketIDs({ sort: 'assignee' }));
        expect(reversed).toEqual(await ticketIDs({ sort: '-assignee' }));
        expect(filtered).toEqual(await ticketIDs({ where: { assignee: { equals: ana.id } } }));
        expect(filtered).toHaveLength(1);
      },
    );

    it.each(userFields)(
      'REST sort and filter on %s match the same query on assignee',
      async (field) => {
        await seedOnePerUser();

        const sorted = await restTicketIDs(`sort=${field}`);
        const filtered = await restTicketIDs(`where[${field}][equals]=${String(ana.id)}`);

        expect(sorted).toEqual(await restTicketIDs('sort=assignee'));
        expect(filtered).toEqual(await restTicketIDs(`where[assignee][equals]=${String(ana.id)}`));
        expect(filtered).toHaveLength(1);
      },
    );
  });

  describe('edge cases', () => {
    it('25 parallel signed-in REST creates record the user and get the numbers 1 to 25', async () => {
      const ids = await Promise.all(
        Array.from({ length: 25 }, (_, index) => restCreate(ana, { title: `Ticket ${index}` })),
      );

      const tickets = await Promise.all(ids.map((id) => readTicket(id)));
      const numbers = tickets.map(({ number }) => number!).sort((a, b) => a - b);

      expect(numbers).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
      expect(new Set(tickets.map(({ createdBy }) => createdBy))).toEqual(new Set([ana.id]));
      expect(new Set(tickets.map(({ lastModifiedBy }) => lastModifiedBy))).toEqual(
        new Set([ana.id]),
      );
    });

    it('a create by a user from another auth collection leaves both user fields empty', async () => {
      const id = await restCreate(admin, { title: 'Printer' });

      const ticket = await readTicket(id);

      expect(await savedBy(id)).toEqual({ createdBy: null, lastModifiedBy: null });
      expect(ticket.editedByAdmin).toBe(admin.id);
    });

    it.runIf(isMongo)('an API key whose owner was deleted saves with no user', async () => {
      const mint = await booted.restClient.post<{ token: string }>(
        `/api/${apiKeysSlug}/mint`,
        { name: 'Integration' },
        { headers: ben.headers },
      );

      await booted.frogbot.db.deleteOne({
        collection: usersSlug,
        where: { id: { equals: ben.id } },
      });

      const id = await restCreate(
        { ...ben, headers: { Authorization: `Bearer ${mint.body.token}` } },
        { title: 'From the integration' },
      );

      expect(mint.status).toBe(201);
      expect(await savedBy(id)).toEqual({ createdBy: null, lastModifiedBy: null });
    });

    it('a trusted update sending createdBy on a record stored without one keeps it empty', async () => {
      const ticket = await booted.frogbot.db.create({
        collection: ticketsSlug,
        data: { title: 'Stored earlier' },
      });

      await booted.frogbot.update({
        collection: ticketsSlug,
        id: ticket.id,
        data: { createdBy: ben.id },
      });

      expect((await savedBy(ticket.id)).createdBy).toBeNull();
    });

    it('an update carrying context.frogbotAIFieldRun keeps the previous last modifier', async () => {
      const id = await restCreate(ana, { title: 'Printer' });

      await booted.frogbot.update({
        collection: ticketsSlug,
        id,
        data: { title: 'Printer, summarised' },
        user: ben.user,
        context: { frogbotAIFieldRun: true },
      } as never);

      expect(await savedBy(id)).toEqual({ createdBy: ana.id, lastModifiedBy: ana.id });
    });

    it('a record stored before the fields existed records the next user save as last modifier only', async () => {
      const ticket = await booted.frogbot.db.create({
        collection: ticketsSlug,
        data: { title: 'Stored earlier' },
      });

      await restUpdate(ben, ticket.id, { title: 'Stored earlier, checked' });

      expect(await savedBy(ticket.id)).toEqual({ createdBy: null, lastModifiedBy: ben.id });
    });
  });
});

describe.skipIf(!isSQLite)('CSV import and export inside one SQLite transaction', () => {
  let frogbot: FrogBotInstance;
  let ana: { id: ID; collection: string };

  beforeAll(async () => {
    await rm(transactionsDatabasePath, { force: true });

    const transactionsConfig = await buildSystemFieldsConfig({
      db: sqliteAdapter({
        client: { url: `file:${transactionsDatabasePath}` },
        transactionOptions: {},
      }),
    });

    frogbot = await bootFresh(() => new FrogBot().init({ config: transactionsConfig }));
    await waitForStartupNumbering(frogbot);
  });

  beforeEach(async () => {
    await clearAndNumber(frogbot);

    const user = await frogbot.create({
      collection: usersSlug,
      data: { email: 'ana@system-fields.test', password },
      overrideAccess: true,
    });

    ana = { id: user.id, collection: usersSlug };
  });

  afterAll(async () => {
    await frogbot.destroy();
    await rm(importsDir, { recursive: true, force: true });
    await rm(transactionsDatabasePath, { force: true });
  });

  it('a CSV import queues its job with the create and completes', async () => {
    const data = Buffer.from(['title', 'Imported one', 'Imported two'].join('\n'));

    const imported = await frogbot.create({
      collection: importsSlug,
      data: { collectionSlug: ticketsSlug, importMode: 'create' },
      file: { data, mimetype: 'text/csv', name: 'tickets.csv', size: data.length },
      user: ana,
    } as never);

    await frogbot.jobs.run();

    const result = await frogbot.findByID({
      collection: importsSlug,
      id: imported.id,
      overrideAccess: true,
    } as never);

    const tickets = await frogbot.find({
      collection: ticketsSlug,
      where: { title: { like: 'Imported' } },
      overrideAccess: true,
    });

    expect(result).toMatchObject({ status: 'completed', summary: { imported: 2 } });
    expect(tickets.totalDocs).toBe(2);
  });

  it('a CSV export queues its job with the create and saves its file', async () => {
    await frogbot.create({ collection: ticketsSlug, data: { title: 'Exported' } });

    const exported = await frogbot.create({
      collection: exportsSlug,
      data: { collectionSlug: ticketsSlug, format: 'csv' },
      user: ana,
    } as never);

    await frogbot.jobs.run();

    const result = (await frogbot.findByID({
      collection: exportsSlug,
      id: exported.id,
      overrideAccess: true,
    } as never)) as unknown as { filename?: string | null };

    expect(result.filename).toMatch(/\.csv$/);
  });
});

describe.skipIf(!isSQLite)('a chat turn on SQLite with transactions on', () => {
  let frogbot: FrogBotInstance;
  let model: StubChatModel;

  beforeAll(async () => {
    await rm(chatTransactionsDatabasePath, { force: true });

    model = await startStubChatModel(modelPort);

    const config = await buildSystemFieldsConfig({
      db: sqliteAdapter({
        client: { url: `file:${chatTransactionsDatabasePath}` },
        transactionOptions: {},
      }),
    });

    frogbot = await bootFresh(() => new FrogBot().init({ config }));
    await waitForStartupNumbering(frogbot);
  });

  afterAll(async () => {
    await frogbot.destroy();
    await model.close();
    await rm(chatTransactionsDatabasePath, { force: true });
  });

  it('a queued turn with a server tool saves its reply, usage, and title without busy errors', async () => {
    const errors = vi.spyOn(frogbot.logger, 'error');
    const user = await frogbot.create({
      collection: usersSlug,
      data: { email: 'cy@system-fields.test', password },
      overrideAccess: true,
    });
    const chat = await frogbot.create({
      collection: chatsSlug,
      data: { user: user.id, agent: agentSlug },
      overrideAccess: true,
    });

    await frogbot.create({
      collection: messagesSlug,
      data: {
        id: `queued-${chat.id}`,
        chat: chat.id,
        role: 'user',
        parts: [{ type: 'text', text: 'Open a ticket for the printer.' }],
        status: 'queued',
        delivery: 'queue',
        author: { user: { id: user.id, collection: usersSlug } },
      },
      overrideAccess: true,
    });

    model.respond(
      {
        toolCalls: [
          { id: 'call-create', name: createTicketToolSlug, input: { title: 'From chat' } },
        ],
      },
      { text: 'Opened it.' },
    );

    await runQueuedTurn({ frogbot, chatId: chat.id });

    await vi.waitFor(async () => {
      const titled = await frogbot.findByID({
        collection: chatsSlug,
        id: chat.id,
        depth: 0,
        overrideAccess: true,
      });
      const usage = await frogbot.count({
        collection: usageLogsSlug,
        where: { user: { equals: user.id } },
        overrideAccess: true,
      });

      expect(titled.title).toBeTruthy();
      expect(usage.totalDocs).toBeGreaterThan(0);
    });

    const { docs: replies } = await frogbot.find({
      collection: messagesSlug,
      where: { chat: { equals: chat.id }, role: { equals: 'assistant' } },
      overrideAccess: true,
    });
    const logged = errors.mock.calls
      .flat()
      .map((argument) =>
        JSON.stringify(argument, (_, value: unknown) =>
          value instanceof Error ? value.message : value,
        ),
      );

    expect(replies.flatMap((reply) => reply.parts)).toContainEqual(
      expect.objectContaining({ type: 'text', text: 'Opened it.' }),
    );
    expect(
      logged.filter((line) => /SQLITE_BUSY|database is locked|without `req`/.test(line)),
    ).toEqual([]);
  });
});

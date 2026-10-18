import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogBotInstance } from 'frogbot';
import { FrogBot, runQueuedTurn } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';
import type { StubChatModel } from '../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../__helpers/shared/StubChatModel';
import { bootFresh, clearAndNumber, waitForStartupNumbering } from './boot.js';
import { buildSystemFieldsConfig } from './config.js';
import type { User } from './frogbot-types.js';
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
  transactionsDatabasePath,
  usageLogsSlug,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const password = 'frogbot-system-fields-password';
const isSQLite = getCurrentDatabaseAdapter() === 'sqlite';

type ID = User['id'];

type SignedIn = {
  id: ID;
  headers: Record<string, string>;
  token: string;
  user: { id: ID; collection: string };
};

type Author = { relationTo: string; value: ID } | null | undefined;

type Ticket = { id: ID; title: string; createdBy?: Author; updatedBy?: Author };

type SavedDoc = { doc: { id: ID } };

describe("Payload's createdBy and updatedBy", () => {
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

  afterEach(() => model.reset());

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

  async function restUpdate(by: SignedIn, id: ID, data: Record<string, unknown>) {
    const response = await booted.restClient.patch<SavedDoc>(`/api/${ticketsSlug}/${id}`, data, {
      headers: by.headers,
    });

    expect(response.status).toBe(200);
  }

  async function savedBy(id: ID) {
    const ticket = (await booted.frogbot.findByID({
      collection: ticketsSlug,
      id,
      depth: 0,
      overrideAccess: true,
    })) as Ticket;

    return { createdBy: ticket.createdBy ?? null, updatedBy: ticket.updatedBy ?? null };
  }

  const by = (user: SignedIn) => ({ relationTo: user.user.collection, value: user.id });

  it('records who created and who last saved a record', async () => {
    const id = await restCreate(ana, { title: 'First' });

    expect(await savedBy(id)).toEqual({ createdBy: by(ana), updatedBy: by(ana) });

    await restUpdate(ben, id, { title: 'Second' });

    expect(await savedBy(id)).toEqual({ createdBy: by(ana), updatedBy: by(ben) });
  });

  it('relates to every auth collection', async () => {
    const id = await restCreate(admin, { title: 'By an admin' });

    expect(await savedBy(id)).toEqual({ createdBy: by(admin), updatedBy: by(admin) });
  });

  it('leaves both empty for a write with no user', async () => {
    const ticket = await booted.frogbot.create({
      collection: ticketsSlug,
      data: { title: 'Seeded' },
      overrideAccess: true,
    });

    expect(await savedBy(ticket.id)).toEqual({ createdBy: null, updatedBy: null });
  });

  it('ignores authors sent by the client', async () => {
    const id = await restCreate(ana, { title: 'Forged', createdBy: by(ben), updatedBy: by(ben) });

    expect(await savedBy(id)).toEqual({ createdBy: by(ana), updatedBy: by(ana) });
  });

  it("leaves FrogBot's own collections without authors", async () => {
    const payloadConfig = await booted.frogbot.config._internal.payloadConfig;

    for (const slug of [chatsSlug, messagesSlug, usageLogsSlug, apiKeysSlug]) {
      const collection = payloadConfig.collections.find((entry) => entry.slug === slug);
      const names = collection?.fields.map((field) => ('name' in field ? field.name : undefined));

      expect(names, slug).not.toContain('createdBy');
      expect(names, slug).not.toContain('updatedBy');
    }
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
      overrideAccess: true,
    } as never);

    await frogbot.jobs.run({ overrideAccess: true });

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
    await frogbot.create({
      collection: ticketsSlug,
      data: { title: 'Exported' },
      overrideAccess: true,
    });

    const exported = await frogbot.create({
      collection: exportsSlug,
      data: { collectionSlug: ticketsSlug, format: 'csv' },
      user: ana,
      overrideAccess: true,
    } as never);

    await frogbot.jobs.run({ overrideAccess: true });

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

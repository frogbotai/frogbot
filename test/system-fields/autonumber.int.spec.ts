import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { GRAPHQL_POST } from '@frogbotai/next/routes';
import type { FrogBotInstance } from 'frogbot';
import { findByAutonumberKey } from 'frogbot';
import { ensureAutonumbers, FrogBot, getFrogBotPayload } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';
import { bootFresh, clearAndNumber, countCounters, waitForStartupNumbering } from './boot.js';
import config, { buildTicketsConfig } from './config.js';
import {
  countersSlug,
  databasePath,
  hiddenIssueTitle,
  importsDir,
  importsSlug,
  issuesSlug,
  oldKeysSlug,
  projectsSlug,
  ticketsSlug,
  transactionsDatabasePath,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const isSQLite = getCurrentDatabaseAdapter() === 'sqlite';
const isMongo = getCurrentDatabaseAdapter() === 'mongodb';
const joinsTransaction = getCurrentDatabaseAdapter() === 'postgres';
const pendingMessage = 'Existing records are still being numbered. Try again in a moment.';
const graphQLPost = GRAPHQL_POST(config);

type ID = number | string;

type Ticket = {
  id: ID;
  title: string;
  number?: number | null;
  details?: { ref?: number | null; note?: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
};

type SavedDoc = { doc: Ticket };

type Issue = { id: ID; title: string; project: ID; number?: number | null; key?: string | null };

type Request = Awaited<ReturnType<FrogBotInstance['createRequest']>>;

function rejectionFor(path: string, message?: string) {
  return {
    name: 'ValidationError',
    data: { errors: [expect.objectContaining({ path, ...(message && { message }) })] },
  };
}

function expectDistinctNumbers(numbers: unknown[]) {
  expect(numbers.every((number) => Number.isSafeInteger(number) && (number as number) >= 1)).toBe(
    true,
  );
  expect(new Set(numbers).size).toBe(numbers.length);
}

describe('autonumber', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'system-fields-autonumber');
    await waitForStartupNumbering(booted.frogbot);
  });

  beforeEach(async () => {
    await clearAndNumber(booted.frogbot);
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(importsDir, { recursive: true, force: true });
    await rm(databasePath, { force: true });
  });

  async function create(data: Record<string, unknown>): Promise<Ticket> {
    return (await booted.frogbot.create({
      collection: ticketsSlug,
      data: { title: 'Printer', ...data },
      overrideAccess: true,
    })) as unknown as Ticket;
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

  async function titles(query: { sort?: string; where?: Record<string, unknown> }) {
    return (await find(query)).map(({ title }) => title);
  }

  async function numbers(where?: Record<string, unknown>) {
    return (await find({ sort: 'number', where })).map(({ number }) => number);
  }

  async function find(query: { sort?: string; where?: Record<string, unknown> }) {
    const result = await booted.frogbot.find({
      collection: ticketsSlug,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      ...query,
    } as never);

    return result.docs as unknown as Ticket[];
  }

  async function restTitles(query: string) {
    const response = await booted.restClient.get<{ docs: Ticket[] }>(
      `/api/${ticketsSlug}?depth=0&limit=100&${query}`,
    );

    expect(response.status).toBe(200);

    return response.body.docs.map(({ title }) => title);
  }

  async function restCreate(data: Record<string, unknown>): Promise<Ticket> {
    const response = await booted.restClient.post<SavedDoc>(`/api/${ticketsSlug}`, data);

    expect(response.status).toBe(201);

    return response.body.doc;
  }

  async function restUpdate(id: ID, data: Record<string, unknown>, query = '') {
    const response = await booted.restClient.patch<SavedDoc>(
      `/api/${ticketsSlug}/${id}${query}`,
      data,
    );

    expect(response.status).toBe(200);
  }

  describe('assignment', () => {
    it('50 parallel creates get the numbers 1 to 50 on each field', async () => {
      const tickets = await Promise.all(
        Array.from({ length: 50 }, (_, index) => create({ title: `Ticket ${index}` })),
      );

      const oneToFifty = Array.from({ length: 50 }, (_, index) => index + 1);
      const sorted = (values: unknown[]) => [...values].sort((a, b) => Number(a) - Number(b));

      expect(sorted(tickets.map((ticket) => ticket.number))).toEqual(oneToFifty);
      expect(sorted(tickets.map((ticket) => ticket.details?.ref))).toEqual(oneToFifty);
    });

    it('details.ref counts on its own', async () => {
      const seeded = await create({ number: 100 });
      const next = await create({});

      expect(next.number).toBe(101);
      expect(next.details?.ref).toBe(seeded.details!.ref! + 1);
    });

    it('deleting a record leaves a gap and the next create is higher', async () => {
      const [first, second, third] = [await create({}), await create({}), await create({})];

      await booted.frogbot.delete({ collection: ticketsSlug, id: second.id, overrideAccess: true });

      const next = await create({});

      expect(next.number).toBeGreaterThan(third.number!);
      expect(await numbers()).toEqual([first.number, third.number, next.number]);
    });

    it('a failed save leaves the next number unique and higher', async () => {
      const before = await create({});

      await expect(create({ title: undefined })).rejects.toMatchObject(rejectionFor('title'));

      const after = await create({});

      expect(after.number).toBeGreaterThan(before.number!);
    });
  });

  describe('read-only to people and agents', () => {
    it('a REST create drops sent numbers and assigns the next ones', async () => {
      const before = await create({});

      const ticket = await restCreate({ title: 'From REST', number: 500, details: { ref: 500 } });

      expect(ticket.number).toBe(before.number! + 1);
      expect(ticket.details?.ref).toBe(before.details!.ref! + 1);
    });

    it('a GraphQL create drops sent numbers and assigns the next ones', async () => {
      const before = await create({});

      const response = await graphQLPost(
        new Request('http://localhost/api/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query:
              'mutation { createTicket(data: { title: "From GraphQL", number: 500, details: { ref: 500 } }) { id } }',
          }),
        }),
      );

      const body = (await response.json()) as {
        data?: { createTicket?: { id: ID } | null } | null;
        errors?: { message: string }[];
      };

      expect(body.errors).toBeUndefined();

      const ticket = await readTicket(body.data!.createTicket!.id);

      expect(ticket.number).toBe(before.number! + 1);
      expect(ticket.details?.ref).toBe(before.details!.ref! + 1);
    });

    it('a CSV import drops sent numbers and numbers each row', async () => {
      const user = await booted.frogbot.create({
        collection: usersSlug,
        data: { email: 'ana@system-fields.test', password: 'frogbot-system-fields-password' },
        overrideAccess: true,
      });

      const csv = ['title,number', 'Imported one,500', 'Imported two,500'].join('\n');
      const data = Buffer.from(csv);

      const imported = await booted.frogbot.create({
        collection: importsSlug,
        data: { collectionSlug: ticketsSlug, importMode: 'create' },
        file: { data, mimetype: 'text/csv', name: 'tickets.csv', size: data.length },
        user: { ...user, collection: usersSlug },
        overrideAccess: true,
      } as never);

      await booted.frogbot.jobs.run({ overrideAccess: true });

      const result = (await booted.frogbot.findByID({
        collection: importsSlug,
        id: imported.id,
        overrideAccess: true,
      } as never)) as unknown as { status: string; summary?: { imported?: number } };

      const importedNumbers = await numbers({ title: { like: 'Imported' } });

      expect(result).toMatchObject({ status: 'completed', summary: { imported: 2 } });

      expectDistinctNumbers(importedNumbers);

      expect(importedNumbers).not.toContain(500);
    });
  });

  describe('seeds and migrations', () => {
    it('a Local API seed number is kept and the next automatic number follows it', async () => {
      const seeded = await create({ number: 100 });
      const next = await create({});

      expect(seeded.number).toBe(100);
      expect(next.number).toBe(101);
    });

    it('a seed number already in use fails naming number', async () => {
      await create({ number: 7 });

      await expect(create({ number: 7 })).rejects.toMatchObject(rejectionFor('number'));
    });

    it.each([2.5, 0])('a seed number of %s fails naming number', async (number) => {
      await expect(create({ number })).rejects.toMatchObject({
        ...rejectionFor('number'),
        message: expect.stringContaining('number'),
      });
    });

    it('a trusted update cannot change the number', async () => {
      const ticket = await create({});

      await booted.frogbot.update({
        collection: ticketsSlug,
        id: ticket.id,
        data: { number: 999 } as never,
        overrideAccess: true,
      });

      expect((await readTicket(ticket.id)).number).toBe(ticket.number);
    });

    it('seeds racing automatic creates clash with none and the next number is above them', async () => {
      const seeds = [100, 200, 300, 400, 500];

      const saved = await Promise.all([
        ...seeds.map((number) => create({ title: `Seeded ${number}`, number })),
        ...Array.from({ length: 20 }, (_, index) => create({ title: `Ticket ${index}` })),
      ]);

      const next = await create({});

      expect(saved.slice(0, seeds.length).map(({ number }) => number)).toEqual(seeds);

      expectDistinctNumbers(saved.map(({ number }) => number));

      expect(next.number).toBeGreaterThan(500);
    });
  });

  describe('duplicate and versions', () => {
    it('a REST duplicate gets a new number', async () => {
      const ticket = await restCreate({ title: 'Printer' });

      const duplicate = await booted.restClient.post<SavedDoc>(
        `/api/${ticketsSlug}/${ticket.id}/duplicate`,
        {},
      );

      expect(duplicate.status).toBe(200);
      expect(duplicate.body.doc.number).toBeGreaterThan(ticket.number!);
      expect(duplicate.body.doc.details?.ref).toBeGreaterThan(ticket.details!.ref!);
    });

    it('a REST update keeps the number', async () => {
      const ticket = await restCreate({ title: 'Printer' });

      await restUpdate(ticket.id, { title: 'Printer on floor 2', number: 999 });

      expect((await readTicket(ticket.id)).number).toBe(ticket.number);
    });

    it('an autosave draft keeps the number', async () => {
      const ticket = await restCreate({ title: 'Printer' });

      await restUpdate(ticket.id, { title: 'Printer, draft' }, '?draft=true&autosave=true');

      expect(await readTicket(ticket.id, { draft: true })).toMatchObject({
        title: 'Printer, draft',
        number: ticket.number,
        details: { ref: ticket.details!.ref },
      });
    });

    it('restoring a version keeps the number', async () => {
      const ticket = await restCreate({ title: 'Printer' });

      await restUpdate(ticket.id, { title: 'Printer on floor 2' });

      const versions = await booted.frogbot.findVersions({
        collection: ticketsSlug,
        where: { parent: { equals: ticket.id } },
        sort: 'createdAt',
        overrideAccess: true,
      });

      const restore = await booted.restClient.post(
        `/api/${ticketsSlug}/versions/${versions.docs[0].id}`,
        {},
      );

      expect(restore.status).toBe(200);
      expect(await readTicket(ticket.id)).toMatchObject({
        title: 'Printer',
        number: ticket.number,
        details: { ref: ticket.details!.ref },
      });
    });
  });

  describe('queries', () => {
    let refOfB: number;

    beforeEach(async () => {
      await create({ title: 'C', number: 30 });
      refOfB = (await create({ title: 'B', number: 20 })).details!.ref!;
      await create({ title: 'A', number: 10 });
    });

    it('Local API sort and filter on number', async () => {
      expect(await titles({ sort: 'number' })).toEqual(['A', 'B', 'C']);
      expect(await titles({ sort: '-number' })).toEqual(['C', 'B', 'A']);
      expect(await titles({ sort: 'number', where: { number: { greater_than: 15 } } })).toEqual([
        'B',
        'C',
      ]);
    });

    it('Local API sort and filter on details.ref', async () => {
      expect(await titles({ sort: 'details.ref' })).toEqual(['C', 'B', 'A']);
      expect(await titles({ sort: '-details.ref' })).toEqual(['A', 'B', 'C']);
      expect(await titles({ where: { 'details.ref': { equals: refOfB } } })).toEqual(['B']);
    });

    it('REST sort and filter on number', async () => {
      expect(await restTitles('sort=number')).toEqual(['A', 'B', 'C']);
      expect(await restTitles('sort=-number')).toEqual(['C', 'B', 'A']);
      expect(await restTitles('sort=number&where[number][greater_than]=15')).toEqual(['B', 'C']);
    });

    it('REST sort and filter on details.ref', async () => {
      expect(await restTitles('sort=details.ref')).toEqual(['C', 'B', 'A']);
      expect(await restTitles('sort=-details.ref')).toEqual(['A', 'B', 'C']);
      expect(await restTitles(`where[details.ref][equals]=${refOfB}`)).toEqual(['B']);
    });
  });

  describe('numbering existing records', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function insertExisting(numbered: number[] = []): Promise<Ticket[]> {
      const days = [4, 3, 2, 1];

      for (const day of days) {
        const at = `2026-01-0${day}T00:00:00.000Z`;
        const number = numbered[day - 1];

        await booted.frogbot.db.create({
          collection: ticketsSlug,
          data: {
            title: `Day ${day}`,
            details: { note: `Note ${day}`, ...(number && { ref: number }) },
            createdAt: at,
            updatedAt: at,
            ...(number ? { number } : !isMongo && { number: null }),
          },
        });
      }

      await booted.frogbot.db.deleteMany({ collection: countersSlug, where: {} });

      return find({ sort: 'createdAt' });
    }

    it('the startup run numbers records oldest first without changing them', async () => {
      const before = await insertExisting();

      await ensureAutonumbers(booted.frogbot);

      const after = await find({ sort: 'createdAt' });
      const next = await create({});

      expect(after).toEqual(
        before.map((ticket, index) => ({
          ...ticket,
          number: index + 1,
          details: { ...ticket.details, ref: index + 1 },
        })),
      );
      expect([next.number, next.details?.ref]).toEqual([5, 5]);
    });

    it('a half-numbered collection continues after its numbered records', async () => {
      await insertExisting([1, 2]);

      await ensureAutonumbers(booted.frogbot);

      const tickets = await find({ sort: 'createdAt' });

      expect(tickets.map(({ number }) => number)).toEqual([1, 2, 3, 4]);
      expect(tickets.map(({ details }) => details?.ref)).toEqual([1, 2, 3, 4]);
    });

    it('updates of records not numbered yet save without a number, and numbering still follows', async () => {
      const existing = await insertExisting();

      await Promise.all(
        existing.map((ticket) =>
          booted.frogbot.update({
            collection: ticketsSlug,
            id: ticket.id,
            data: { title: `${ticket.title}, edited` },
            overrideAccess: true,
          }),
        ),
      );

      const edited = await find({ sort: 'createdAt' });

      await ensureAutonumbers(booted.frogbot);

      expect(edited.map(({ number }) => number ?? null)).toEqual([null, null, null, null]);
      expect((await find({ sort: 'createdAt' })).map(({ number }) => number)).toEqual([1, 2, 3, 4]);
    });

    async function insertPublishedBeforeNumbering(): Promise<ID> {
      const at = '2026-01-01T00:00:00.000Z';
      const data = {
        title: 'Published earlier',
        _status: 'published',
        createdAt: at,
        updatedAt: at,
        ...(!isMongo && { number: null }),
      };

      const doc = await booted.frogbot.db.create({ collection: ticketsSlug, data });

      await booted.frogbot.db.createVersion({
        collectionSlug: ticketsSlug,
        parent: doc.id,
        versionData: { ...data, id: doc.id },
        autosave: false,
        createdAt: at,
        updatedAt: at,
      });

      await booted.frogbot.db.deleteMany({ collection: countersSlug, where: {} });
      await ensureAutonumbers(booted.frogbot);

      return doc.id as ID;
    }

    it('a draft save on a record numbered at startup keeps its published number', async () => {
      const id = await insertPublishedBeforeNumbering();

      await restUpdate(id, { title: 'Published earlier, draft' }, '?draft=true');

      expect(await readTicket(id)).toMatchObject({
        title: 'Published earlier',
        number: 1,
        details: { ref: 1 },
      });
    });

    it('a draft save on a record numbered at startup carries its number into the draft', async () => {
      const id = await insertPublishedBeforeNumbering();

      await restUpdate(id, { title: 'Published earlier, draft' }, '?draft=true');

      expect(await readTicket(id, { draft: true })).toMatchObject({
        title: 'Published earlier, draft',
        number: 1,
        details: { ref: 1 },
      });
    });

    it('publishing a draft of a record numbered at startup keeps its number', async () => {
      const id = await insertPublishedBeforeNumbering();

      await restUpdate(id, { title: 'Published earlier, draft' }, '?draft=true');
      await restUpdate(id, { title: 'Published earlier, edited', _status: 'published' });

      expect(await readTicket(id)).toMatchObject({
        title: 'Published earlier, edited',
        number: 1,
        details: { ref: 1 },
      });
    });

    it.skipIf(joinsTransaction)(
      'a create with no counter numbers existing records first',
      async () => {
        await insertExisting();

        const ticket = await create({ title: 'New' });

        expect(ticket.number).toBe(5);
        expect(await titles({ sort: 'number' })).toEqual([
          'Day 1',
          'Day 2',
          'Day 3',
          'Day 4',
          'New',
        ]);
      },
    );

    it.skipIf(joinsTransaction)(
      'a create waits while another run holds the lock, then takes the next number',
      async () => {
        await booted.frogbot.db.deleteMany({ collection: countersSlug, where: {} });

        const findOne = vi.spyOn(booted.frogbot.db, 'findOne');

        const counterChecks = () =>
          findOne.mock.calls.filter(([args]) => args.collection === countersSlug).length;

        const ticket = await booted.frogbot.kv.lock(
          'autonumber:tickets.number',
          60_000,
          async () => {
            const pending = create({});

            await vi.waitFor(() => expect(counterChecks()).toBeGreaterThanOrEqual(2), {
              timeout: 10_000,
            });

            await booted.frogbot.db.create({
              collection: countersSlug,
              data: { key: 'tickets.number', value: 7 },
            });

            return pending;
          },
        );

        expect(ticket.number).toBe(8);
      },
    );

    it.runIf(joinsTransaction)(
      'a create with no counter inside a transaction fails at once and writes nothing',
      async () => {
        await booted.frogbot.db.deleteMany({ collection: countersSlug, where: {} });

        await expect(create({})).rejects.toMatchObject(rejectionFor('number', pendingMessage));

        expect((await find({})).length).toBe(0);
        expect(await countCounters(booted.frogbot)).toBe(0);
      },
    );
  });

  describe('scoped', () => {
    async function createProject(key: string): Promise<ID> {
      const project = await booted.frogbot.create({
        collection: projectsSlug,
        data: { key },
        overrideAccess: true,
      });

      return project.id as ID;
    }

    async function createIssue(project: ID, data: Record<string, unknown> = {}, req?: Request) {
      return (await booted.frogbot.create({
        collection: issuesSlug,
        data: { title: 'Bug', project, ...data } as never,
        depth: 0,
        req,
        overrideAccess: true,
      })) as unknown as Issue;
    }

    async function updateIssue(id: ID, data: Record<string, unknown>) {
      return (await booted.frogbot.update({
        collection: issuesSlug,
        id,
        data,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Issue;
    }

    async function readIssue(id: ID) {
      return (await booted.frogbot.findByID({
        collection: issuesSlug,
        id,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Issue;
    }

    async function issueNumbers(project: ID) {
      const { docs } = await booted.frogbot.find({
        collection: issuesSlug,
        where: { project: { equals: project } },
        sort: 'number',
        depth: 0,
        pagination: false,
        overrideAccess: true,
      });

      return (docs as unknown as Issue[]).map(({ number }) => number);
    }

    async function openTransaction() {
      const db = getFrogBotPayload(booted.frogbot).db;
      const req = await booted.frogbot.createRequest();
      const id = await db.beginTransaction();

      if (id === null) throw new Error('[test] the adapter did not start a transaction');

      req.transactionID = id;

      return { db, id, req };
    }

    const upTo = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

    it('parallel creates in two projects number 1 to 25 in each', async () => {
      const [app, web] = [await createProject('APP'), await createProject('WEB')];

      await Promise.all(
        Array.from({ length: 50 }, (_, index) =>
          createIssue(index % 2 ? web : app, { title: `Issue ${index}` }),
        ),
      );

      expect(await issueNumbers(app)).toEqual(upTo(25));
      expect(await issueNumbers(web)).toEqual(upTo(25));
    });

    it('a new project starts at 1 while another keeps counting', async () => {
      const app = await createProject('APP');

      await createIssue(app);
      await createIssue(app);

      const web = await createProject('WEB');

      expect((await createIssue(web)).number).toBe(1);
      expect((await createIssue(app)).number).toBe(3);
    });

    it.runIf(joinsTransaction)(
      'two first creates in one new project in parallel transactions both commit with 1 and 2',
      async () => {
        const project = await createProject('APP');
        const [first, second] = [await openTransaction(), await openTransaction()];
        const db = first.db as unknown as {
          drizzle: unknown;
          execute: (args: { drizzle: unknown; raw: string }) => Promise<{ rows: unknown[] }>;
        };

        const waiting = async () => {
          const { rows } = await db.execute({
            drizzle: db.drizzle,
            raw: 'select 1 from pg_locks where not granted',
          });

          return rows.length;
        };

        const one = await createIssue(project, { title: 'One' }, first.req);
        const pending = createIssue(project, { title: 'Two' }, second.req);

        await vi.waitFor(async () => expect(await waiting()).toBeGreaterThan(0), {
          timeout: 10_000,
        });

        await first.db.commitTransaction(first.id);

        const two = await pending;

        await second.db.commitTransaction(second.id);

        expect([one.number, two.number]).toEqual([1, 2]);
        expect(await issueNumbers(project)).toEqual([1, 2]);
      },
    );

    it.runIf(joinsTransaction)(
      'a create rolled back in a transaction gives its number back, in a new project too',
      async () => {
        const [app, web] = [await createProject('APP'), await createProject('WEB')];

        await createIssue(app);

        const { db, id, req } = await openTransaction();

        await createIssue(app, {}, req);
        await createIssue(web, {}, req);
        await db.rollbackTransaction(id);

        expect((await createIssue(app)).number).toBe(2);
        expect((await createIssue(web)).number).toBe(1);
      },
    );

    it('records numbered before the scope keep their numbers, and the rest are numbered oldest first per project', async () => {
      const [app, web, ops] = [
        await createProject('APP'),
        await createProject('WEB'),
        await createProject('OPS'),
      ];

      const existing: [ID, number | null][] = [
        [app, 1],
        [web, 2],
        [app, 3],
        [web, null],
        [web, null],
        [app, null],
        [ops, 7],
      ];

      for (const [day, [project, number]] of existing.entries()) {
        const at = `2026-01-0${day + 1}T00:00:00.000Z`;

        await booted.frogbot.db.create({
          collection: issuesSlug,
          data: {
            title: `Day ${day + 1}`,
            project,
            createdAt: at,
            updatedAt: at,
            number,
          },
        });
      }

      await booted.frogbot.db.deleteMany({ collection: countersSlug, where: {} });
      await ensureAutonumbers(booted.frogbot);

      const { docs } = await booted.frogbot.find({
        collection: issuesSlug,
        sort: 'createdAt',
        depth: 0,
        pagination: false,
        overrideAccess: true,
      });

      expect((docs as unknown as Issue[]).map(({ number }) => number)).toEqual([
        1, 2, 3, 3, 4, 4, 7,
      ]);

      expect((await createIssue(app)).number).toBe(5);
      expect((await createIssue(web)).number).toBe(5);
      expect((await createIssue(ops)).number).toBe(8);
      expect((await createIssue(await createProject('NEW'))).number).toBe(1);
    });

    it('a seed number raises only its project, and a repeat in that project fails as not unique', async () => {
      const [app, web] = [await createProject('APP'), await createProject('WEB')];

      expect((await createIssue(app, { number: 10 })).number).toBe(10);
      expect((await createIssue(app)).number).toBe(11);
      expect((await createIssue(web)).number).toBe(1);
      expect((await createIssue(web, { number: 10 })).number).toBe(10);

      await expect(createIssue(app, { number: 10 })).rejects.toMatchObject({
        name: 'ValidationError',
        data: { errors: [expect.objectContaining({ message: 'Value must be unique' })] },
      });
    });

    it('an update that keeps the project keeps the number', async () => {
      const app = await createProject('APP');
      const issue = await createIssue(app);

      await updateIssue(issue.id, { title: 'Bug, edited' });

      expect((await readIssue(issue.id)).number).toBe(issue.number);
    });

    it('moving an issue to another project gives it the next number there', async () => {
      const [app, web] = [await createProject('APP'), await createProject('WEB')];
      const [, moving] = [await createIssue(app), await createIssue(app)];

      await createIssue(web);

      expect((await updateIssue(moving.id, { project: web })).number).toBe(2);
      expect(await issueNumbers(web)).toEqual([1, 2]);
      expect((await createIssue(app)).number).toBe(3);
    });

    it('a bulk update that moves issues numbers each in the target project', async () => {
      const [app, web] = [await createProject('APP'), await createProject('WEB')];
      const moving = [await createIssue(app), await createIssue(app), await createIssue(app)];

      await createIssue(web);

      await booted.frogbot.update({
        collection: issuesSlug,
        where: { id: { in: moving.map(({ id }) => id) } },
        data: { project: web } as never,
        overrideAccess: true,
      });

      expect(await issueNumbers(app)).toEqual([]);
      expect(await issueNumbers(web)).toEqual(upTo(4));
    });

    it('restoring a version from the old project gives the next number there', async () => {
      const [app, web] = [await createProject('APP'), await createProject('WEB')];
      const issue = await createIssue(app);

      await createIssue(app);
      await updateIssue(issue.id, { project: web });

      const versions = await booted.frogbot.findVersions({
        collection: issuesSlug,
        where: { parent: { equals: issue.id } },
        sort: 'createdAt',
        overrideAccess: true,
      });

      const restore = await booted.restClient.post(
        `/api/${issuesSlug}/versions/${versions.docs[0].id}`,
        {},
      );

      expect(restore.status).toBe(200);
      expect(await readIssue(issue.id)).toMatchObject({ project: app, number: 3 });
      expect(await issueNumbers(web)).toEqual([]);
    });

    describe('keys', () => {
      async function issueKeys(project: ID) {
        const { docs } = await booted.frogbot.find({
          collection: issuesSlug,
          where: { project: { equals: project } },
          sort: 'number',
          depth: 0,
          pagination: false,
          overrideAccess: true,
        });

        return (docs as unknown as Issue[]).map(({ key }) => key);
      }

      async function findByKey(key: string, options: Record<string, unknown> = {}) {
        return (await findByAutonumberKey(booted.frogbot, {
          collection: issuesSlug,
          key,
          depth: 0,
          overrideAccess: true,
          ...options,
        } as never)) as unknown as Issue | null;
      }

      async function renameProject(id: ID, key: string) {
        await booted.frogbot.update({
          collection: projectsSlug,
          id,
          data: { key } as never,
          overrideAccess: true,
        });
      }

      it('a create gets the key from its project and number, and a seed number gets the matching key', async () => {
        const [app, web] = [await createProject('APP'), await createProject('WEB')];

        expect((await createIssue(app)).key).toBe('APP-1');
        expect((await createIssue(web)).key).toBe('WEB-1');
        expect((await createIssue(app, { number: 7 })).key).toBe('APP-7');
        expect((await createIssue(app)).key).toBe('APP-8');
      });

      it('a written key is dropped, on REST and on a trusted create', async () => {
        const app = await createProject('APP');

        const response = await booted.restClient.post<{ doc: Issue }>(`/api/${issuesSlug}`, {
          title: 'From REST',
          project: app,
          key: 'NOPE-9',
        });

        expect(response.status).toBe(201);
        expect(response.body.doc.key).toBe('APP-1');
        expect((await createIssue(app, { key: 'NOPE-10' })).key).toBe('APP-2');
      });

      it('the key filters, sorts, is the title and matches list search', async () => {
        const [app, web] = [await createProject('APP'), await createProject('WEB')];
        const first = await createIssue(app, { title: 'First' });

        await createIssue(web, { title: 'Second' });
        await createIssue(app, { title: 'Third' });

        const { docs: matching } = await booted.frogbot.find({
          collection: issuesSlug,
          where: { key: { equals: 'APP-1' } },
          depth: 0,
          overrideAccess: true,
        });

        expect((matching as unknown as Issue[]).map(({ id }) => id)).toEqual([first.id]);

        const { docs: sorted } = await booted.frogbot.find({
          collection: issuesSlug,
          sort: '-key',
          depth: 0,
          overrideAccess: true,
        });

        expect((sorted as unknown as Issue[]).map(({ key }) => key)).toEqual([
          'WEB-1',
          'APP-2',
          'APP-1',
        ]);

        expect(
          getFrogBotPayload(booted.frogbot).collections[issuesSlug].config.admin.useAsTitle,
        ).toBe('key');

        const listed = await booted.restClient.get<{ docs: Issue[] }>(
          `/api/${issuesSlug}?depth=0&where[key][like]=APP-2`,
        );

        expect(listed.status).toBe(200);
        expect(listed.body.docs.map(({ title }) => title)).toEqual(['Third']);
      });

      it.skipIf(isMongo)('lexical search finds an issue by its key', async () => {
        const app = await createProject('APP');

        await createIssue(app, { title: 'Printer jam' });
        await createIssue(app, { title: 'Paper out' });

        const result = await booted.frogbot.search({
          collection: issuesSlug,
          index: 'keys',
          query: { text: 'APP-2' },
          overrideAccess: true,
        } as never);

        expect(result.hits[0]?.doc).toMatchObject({ title: 'Paper out', key: 'APP-2' });
      });

      it('moving an issue gives it the new key, and the old key still finds it', async () => {
        const [app, web] = [await createProject('APP'), await createProject('WEB')];
        const [, moving] = [await createIssue(app), await createIssue(app)];

        await createIssue(web);

        expect((await updateIssue(moving.id, { project: web })).key).toBe('WEB-2');
        expect(await findByKey('APP-2')).toMatchObject({ id: moving.id, key: 'WEB-2' });
        expect(await findByKey('WEB-2')).toMatchObject({ id: moving.id });
        expect(await findByKey('APP-9')).toBeNull();
      });

      it('a key taken again by a seed finds its new holder, not the issue that moved away', async () => {
        const [app, web] = [await createProject('APP'), await createProject('WEB')];
        const moving = await createIssue(app);

        await updateIssue(moving.id, { project: web });

        const holder = await createIssue(app, { number: 1 });

        expect(holder.key).toBe('APP-1');
        expect(await findByKey('APP-1')).toMatchObject({ id: holder.id });
      });

      it("renaming a project's key rewrites its issues in that save and leaves others alone", async () => {
        const [app, web] = [await createProject('APP'), await createProject('WEB')];
        const [first] = [await createIssue(app), await createIssue(app), await createIssue(web)];
        const updatedAt = (await readIssue(first.id)) as Issue & { updatedAt?: string };

        await renameProject(app, 'APX');

        expect(await issueKeys(app)).toEqual(['APX-1', 'APX-2']);
        expect(await issueKeys(web)).toEqual(['WEB-1']);
        expect(await findByKey('APP-1')).toMatchObject({ id: first.id, key: 'APX-1' });
        expect(((await readIssue(first.id)) as Issue & { updatedAt?: string }).updatedAt).toBe(
          updatedAt.updatedAt,
        );
        expect((await createIssue(app)).key).toBe('APX-3');
      });

      it.runIf(joinsTransaction)(
        'a rename rolled back in a transaction keeps the old keys',
        async () => {
          const app = await createProject('APP');

          await createIssue(app);

          const { db, id, req } = await openTransaction();

          await booted.frogbot.update({
            collection: projectsSlug,
            id: app,
            data: { key: 'APX' } as never,
            overrideAccess: true,
            req,
          });

          await db.rollbackTransaction(id);

          expect(await issueKeys(app)).toEqual(['APP-1']);
          expect(await findByKey('APX-1')).toBeNull();
        },
      );

      it('without overrideAccess, a hidden issue is found by neither its key nor an old one', async () => {
        const [app, web] = [await createProject('APP'), await createProject('WEB')];
        const hidden = await createIssue(app, { title: hiddenIssueTitle });

        await updateIssue(hidden.id, { project: web });

        expect(await findByKey('WEB-1')).toMatchObject({ id: hidden.id });
        expect(await findByKey('WEB-1', { overrideAccess: false })).toBeNull();
        expect(await findByKey('APP-1', { overrideAccess: false })).toBeNull();
        expect(await findByKey('APP-1')).toMatchObject({ id: hidden.id });
      });

      it('startup keys numbered issues that have no key yet', async () => {
        const app = await createProject('APP');

        const { id } = await booted.frogbot.db.create({
          collection: issuesSlug,
          data: { title: 'Imported', project: app, number: 4 },
        });

        expect((await readIssue(id as ID)).key ?? null).toBeNull();

        await ensureAutonumbers(booted.frogbot);

        expect((await readIssue(id as ID)).key).toBe('APP-4');
        expect((await createIssue(app)).key).toBe('APP-5');
      });

      it('old keys are kept in their hidden collection', async () => {
        const [app, web] = [await createProject('APP'), await createProject('WEB')];
        const issue = await createIssue(app);

        await updateIssue(issue.id, { project: web });

        const { docs } = await booted.frogbot.db.find({
          collection: oldKeysSlug,
          where: {},
          pagination: false,
        });

        expect(docs).toEqual([
          expect.objectContaining({
            collection: issuesSlug,
            path: 'key',
            key: 'APP-1',
            record: String(issue.id),
          }),
        ]);
      });

      it("deleting an issue forgets its old keys, so a record reusing its ID doesn't take them", async () => {
        const [app, web, ops] = [
          await createProject('APP'),
          await createProject('WEB'),
          await createProject('OPS'),
        ];

        const issue = await createIssue(app);

        await updateIssue(issue.id, { project: web });
        await booted.frogbot.delete({ collection: issuesSlug, id: issue.id, overrideAccess: true });

        expect((await booted.frogbot.db.count({ collection: oldKeysSlug })).totalDocs).toBe(0);

        await createIssue(ops);

        expect(await findByKey('APP-1')).toBeNull();
      });

      it('a key held by an issue the user cannot read gives null, not its earlier holder', async () => {
        const [app, web] = [await createProject('APP'), await createProject('WEB')];
        const moved = await createIssue(app);

        await updateIssue(moved.id, { project: web });
        await createIssue(app, { number: 1, title: hiddenIssueTitle });

        expect(await findByKey('APP-1', { overrideAccess: false })).toBeNull();
      });

      it('moving away and back gives the next number, and both old keys find the issue', async () => {
        const [app, web] = [await createProject('APP'), await createProject('WEB')];
        const issue = await createIssue(app);

        await updateIssue(issue.id, { project: web });

        expect(await updateIssue(issue.id, { project: app })).toMatchObject({
          number: 2,
          key: 'APP-2',
        });
        expect(await findByKey('APP-1')).toMatchObject({ id: issue.id });
        expect(await findByKey('WEB-1')).toMatchObject({ id: issue.id });
      });

      it('a REST duplicate gets the next number and its key', async () => {
        const app = await createProject('APP');
        const issue = await createIssue(app);
        const response = await booted.restClient.post<{ doc: Issue }>(
          `/api/${issuesSlug}/${issue.id}/duplicate`,
          {},
        );

        expect(response.status).toBe(200);
        expect(response.body.doc).toMatchObject({ number: 2, key: 'APP-2' });
      });

      it('renaming a project with more than one page of issues rewrites every key', async () => {
        const app = await createProject('APP');

        for (let index = 0; index < 130; index += 1) await createIssue(app);

        await renameProject(app, 'APX');

        expect(await issueKeys(app)).toEqual(upTo(130).map((number) => `APX-${number}`));
      });
    });
  });
});

describe.skipIf(!isSQLite)('autonumber inside one SQLite transaction', () => {
  let frogbot: FrogBotInstance;
  let countersAtInit: number;

  beforeAll(async () => {
    await rm(transactionsDatabasePath, { force: true });

    const config = await buildTicketsConfig({
      db: sqliteAdapter({
        client: { url: `file:${transactionsDatabasePath}` },
        transactionOptions: {},
      }),
      onInit: async (app) => {
        countersAtInit = await countCounters(app);
      },
    });

    frogbot = await bootFresh(() => new FrogBot().init({ config }));
    await waitForStartupNumbering(frogbot);
  });

  beforeEach(async () => {
    await clearAndNumber(frogbot);
  });

  afterAll(async () => {
    await frogbot.destroy();
    await rm(transactionsDatabasePath, { force: true });
  });

  async function create(
    title: string,
    req?: Awaited<ReturnType<FrogBotInstance['createRequest']>>,
  ) {
    return (await frogbot.create({
      collection: ticketsSlug,
      data: { title },
      req,
      overrideAccess: true,
    })) as unknown as Ticket;
  }

  async function openTransaction() {
    const db = getFrogBotPayload(frogbot).db;
    const req = await frogbot.createRequest();
    const id = await db.beginTransaction();

    if (id === null) throw new Error('[test] the adapter did not start a transaction');

    req.transactionID = id;

    return { db, id, req };
  }

  it('the app onInit on a new database finds every counter', () => {
    expect(countersAtInit).toBe(3);
  });

  it('two creates in one transaction get consecutive numbers', async () => {
    const before = await create('Before');
    const { db, id, req } = await openTransaction();

    const first = await create('First', req);
    const second = await create('Second', req);

    await db.commitTransaction(id);

    expect([first.number, second.number]).toEqual([before.number! + 1, before.number! + 2]);
  });

  it('a rolled-back transaction leaves no gap', async () => {
    const before = await create('Before');
    const { db, id, req } = await openTransaction();

    await create('First', req);
    await create('Second', req);
    await db.rollbackTransaction(id);

    const after = await create('After');

    expect(after.number).toBe(before.number! + 1);
  });

  it('a scoped create rolled back in a transaction gives its number back, in a new project too', async () => {
    const createIn = async (project: ID, req?: Request) =>
      (await frogbot.create({
        collection: issuesSlug,
        data: { title: 'Bug', project } as never,
        req,
        overrideAccess: true,
      })) as unknown as Issue;

    const [app, web] = await Promise.all(
      ['APP', 'WEB'].map(
        async (key) =>
          (await frogbot.create({ collection: projectsSlug, data: { key }, overrideAccess: true }))
            .id as ID,
      ),
    );

    await createIn(app);

    const { db, id, req } = await openTransaction();

    expect((await createIn(app, req)).number).toBe(2);
    expect((await createIn(web, req)).number).toBe(1);
    expect((await createIn(web, req)).number).toBe(2);

    await db.rollbackTransaction(id);

    expect((await createIn(app)).number).toBe(2);
    expect((await createIn(web)).number).toBe(1);
  });

  it('a create with no counter fails at once and writes nothing', async () => {
    await getFrogBotPayload(frogbot).db.deleteMany({ collection: countersSlug, where: {} });

    await expect(create('First')).rejects.toMatchObject(rejectionFor('number', pendingMessage));

    expect((await frogbot.find({ collection: ticketsSlug, overrideAccess: true })).totalDocs).toBe(
      0,
    );
    expect(await countCounters(frogbot)).toBe(0);
  });
});

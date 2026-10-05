import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPHQL_POST } from '@frogbotai/next/routes';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';
import type { StubChatModel, StubChatRequest } from '../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../__helpers/shared/StubChatModel';
import config from './config.js';
import {
  aiFieldTaskSlug,
  articlesSlug,
  issuesSlug,
  jobsSlug,
  modelPort,
  otherModel,
  reportsSlug,
  rollbackTitle,
  tasksSlug,
  usageLogsSlug,
  usersSlug,
  writerModel,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const password = 'frogbot-test-password';

const transactions = getCurrentDatabaseAdapter() !== 'sqlite';

const textSelects = getCurrentDatabaseAdapter() !== 'postgres';

const waitFor = { timeout: 10_000 };

const graphQLPost = GRAPHQL_POST(config);

type Doc = Record<string, unknown> & { id: number | string };

type Job = Doc & { hasError?: boolean; input: Record<string, unknown> };

function deferred() {
  let resolve!: () => void;

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function systemMessage(request: StubChatRequest | undefined): unknown {
  return request?.messages.find(({ role }) => role === 'system')?.content;
}

function userMessage(request: StubChatRequest | undefined): unknown {
  return request?.messages.find(({ role }) => role === 'user')?.content;
}

describe('aiField runs', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname);
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterEach(async () => {
    await vi.waitFor(async () => {
      if ((await usageRows()).length !== model.titleRequests.length) {
        throw new Error('[test] usage rows are still being written');
      }
    }, waitFor);

    for (const collection of [usageLogsSlug, jobsSlug, 'payload-locked-documents']) {
      await booted.payload.delete({ collection: collection as never, where: {} });
    }

    model.reset();
  });

  afterAll(async () => {
    await booted?.shutdown();
    await model?.close();
  });

  async function usageRows(): Promise<Doc[]> {
    const result = await booted.payload.find({
      collection: usageLogsSlug as never,
      depth: 0,
      pagination: false,
    });

    return result.docs as unknown as Doc[];
  }

  async function aiJobs(): Promise<Job[]> {
    const result = await booted.payload.find({
      collection: jobsSlug,
      where: { taskSlug: { equals: aiFieldTaskSlug } },
      depth: 0,
      pagination: false,
    });

    return result.docs as unknown as Job[];
  }

  async function waitingRuns(field?: string): Promise<Job[]> {
    return (await aiJobs()).filter(
      (job) => !job.completedAt && (field === undefined || job.input.field === field),
    );
  }

  function runJobs() {
    return booted.frogbot.jobs.run({ queue: 'default' });
  }

  async function createUser(role: string, data: Record<string, unknown> = {}): Promise<Doc> {
    return (await booted.frogbot.create({
      collection: usersSlug,
      data: { email: `${role}-${randomUUID()}@frogbot.local`, password, role, ...data } as never,
      overrideAccess: true,
    })) as unknown as Doc;
  }

  async function signIn(role: string): Promise<{ user: Doc; headers: Record<string, string> }> {
    const user = await createUser(role);

    const login = await booted.restClient.post<{ token: string }>(`/api/${usersSlug}/login`, {
      email: user.email,
      password,
    });

    return { user, headers: { Authorization: `JWT ${login.body.token}` } };
  }

  function createTask(data: Record<string, unknown>, user?: Doc): Promise<Doc> {
    return booted.frogbot.create({
      collection: tasksSlug,
      data: data as never,
      ...(user ? { user: user as never, overrideAccess: false } : {}),
    }) as Promise<unknown> as Promise<Doc>;
  }

  function updateTask(id: Doc['id'], data: Record<string, unknown>, user?: Doc): Promise<Doc> {
    return booted.frogbot.update({
      collection: tasksSlug,
      id,
      data: data as never,
      ...(user ? { user: user as never, overrideAccess: false } : {}),
    }) as Promise<unknown> as Promise<Doc>;
  }

  function patchTask(
    id: Doc['id'],
    data: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    return booted.restClient.patch(`/api/${tasksSlug}/${id}`, data, { headers });
  }

  function findTask(id: Doc['id']): Promise<Doc> {
    return booted.frogbot.findByID({
      collection: tasksSlug,
      id,
      depth: 0,
    }) as Promise<unknown> as Promise<Doc>;
  }

  async function heldRun(text: string) {
    const gate = deferred();

    model.respondTitle({ text, hold: gate.promise });

    const run = runJobs();

    await vi.waitFor(() => expect(model.titleRequests).toHaveLength(1), waitFor);

    return { release: gate.resolve, run };
  }

  describe('queueing', () => {
    it('a create with an input sets the summary pending and queues one run', async () => {
      const task = await createTask({ notes: 'Paint the fence' });

      expect(task._summary_status).toBe('pending');
      expect(await waitingRuns('summary')).toHaveLength(1);
    });

    it('a create without inputs leaves the status empty and queues nothing', async () => {
      const task = await createTask({});

      expect(task._summary_status ?? null).toBeNull();
      expect(await waitingRuns('summary')).toHaveLength(0);
    });

    it('a REST update to a field that is not an input queues nothing', async () => {
      const { headers } = await signIn('editor');
      const task = await createTask({ notes: 'Paint the fence' });

      await runJobs();

      const response = await patchTask(task.id, { priority: 2 }, headers);

      expect(response.status).toBe(200);
      expect(await waitingRuns('summary')).toHaveLength(0);
      expect((await findTask(task.id))._summary_status).toBe('done');
    });

    it('a Local API update to a field that is not an input queues nothing', async () => {
      const task = await createTask({ notes: 'Paint the fence' });

      await runJobs();

      await updateTask(task.id, { priority: 2 });

      expect(await waitingRuns('summary')).toHaveLength(0);
      expect((await findTask(task.id))._summary_status).toBe('done');
    });

    it('a bulk Local API update of an input queues one run per record', async () => {
      const first = await createTask({ title: 'First' });
      const second = await createTask({ title: 'Second' });

      await runJobs();

      await booted.frogbot.update({
        collection: tasksSlug,
        where: { id: { in: [first.id, second.id] } },
        data: { notes: 'Paint the fence' } as never,
      });

      const waiting = await waitingRuns('summary');

      expect(waiting.map(({ input }) => String(input.id)).sort()).toEqual(
        [String(first.id), String(second.id)].sort(),
      );
    });

    it('a GraphQL create with an input sets the summary pending and queues one run', async () => {
      const response = await graphQLPost(
        new Request('http://localhost/api/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query:
              'mutation { createTask(data: { notes: "Paint the fence" }) { _summary_status } }',
          }),
        }),
      );

      const body = (await response.json()) as {
        data?: { createTask?: { _summary_status?: string } };
        errors?: unknown[];
      };

      expect(body.errors).toBeUndefined();
      expect(body.data?.createTask?._summary_status).toBe('pending');
      expect(await waitingRuns('summary')).toHaveLength(1);
    });

    it.runIf(transactions)(
      'a save that fails after the write leaves no run and no record',
      async () => {
        await expect(
          createTask({ title: rollbackTitle, notes: 'Paint the fence' }),
        ).rejects.toThrow('Rolled back on purpose.');

        const { totalDocs } = await booted.frogbot.count({ collection: tasksSlug });

        expect(totalDocs).toBe(0);
        expect(await aiJobs()).toHaveLength(0);
      },
    );
  });

  describe('the request', () => {
    it('sends the prompt as instructions and the inputs as JSON, with no tools', async () => {
      await createTask({ title: 'Fence', notes: 'Paint it', secret: 'Blue' });

      await runJobs();

      const [request] = model.titleRequests;

      expect(request?.tools).toBeUndefined();
      expect(request?.messages[0]).toEqual({ role: 'system', content: 'Summarize.' });

      expect(userMessage(request)).toBe(
        JSON.stringify({ title: 'Fence', notes: 'Paint it', secret: 'Blue' }),
      );
    });

    it('uses the default model for summary and the field model for category', async () => {
      await createTask({ notes: 'Paint the fence' });

      await runJobs();
      await runJobs();

      expect(model.titleRequests.map(({ model: id }) => id)).toEqual([writerModel, otherModel]);
    });
  });

  describe('results', () => {
    it('a run saves the trimmed text as done with no error', async () => {
      const task = await createTask({ notes: 'Paint the fence' });

      model.respondTitle({ text: '  A fence job.  ' });

      await runJobs();

      expect(await findTask(task.id)).toMatchObject({
        summary: 'A fence job.',
        _summary_status: 'done',
        _summary_error: null,
      });
    });

    it('a provider error saves error with a message of at most 200 characters', async () => {
      const task = await createTask({ notes: 'Paint the fence' });

      model.respondTitle({
        text: '',
        error: { status: 400, body: { error: { message: 'Bad request. '.repeat(40) } } },
      });

      await runJobs();

      const saved = await findTask(task.id);
      const message = saved._summary_error as string;

      expect(saved._summary_status).toBe('error');
      expect(message.length).toBeGreaterThan(0);
      expect(message.length).toBeLessThanOrEqual(200);
    });

    it('a user over budget gets error and no usage row', async () => {
      const user = await createUser('editor', { monthlyBudget: 0.01, spendThisPeriodUSD: 1 });
      const task = await createTask({ notes: 'Paint the fence' }, user);

      await runJobs();

      expect((await findTask(task.id))._summary_status).toBe('error');
      expect(model.titleRequests).toHaveLength(0);
      expect(await usageRows()).toHaveLength(0);
    });

    it("a user whose models leave out the field's model gets error and no usage row", async () => {
      const user = await createUser('editor', {
        modelAccess: 'selected',
        models: [`test/${otherModel}`],
      });

      const task = await createTask({ notes: 'Paint the fence' }, user);

      await runJobs();

      expect(await findTask(task.id)).toMatchObject({
        _summary_status: 'error',
        _summary_error: `Model "test/${writerModel}" is not allowed by this policy.`,
      });

      expect(model.titleRequests).toHaveLength(0);
      expect(await usageRows()).toHaveLength(0);
    });
  });

  describe('manual edits', () => {
    it('a hand edit sets manual and later input changes queue nothing', async () => {
      const { headers } = await signIn('editor');
      const task = await createTask({ notes: 'Paint the fence' });

      await runJobs();

      await patchTask(task.id, { summary: 'Mine' }, headers);
      await patchTask(task.id, { notes: 'Paint the gate' }, headers);

      expect(await findTask(task.id)).toMatchObject({ summary: 'Mine', _summary_status: 'manual' });
      expect(await waitingRuns('summary')).toHaveLength(0);
    });

    it('a hand edit during a run keeps the hand-written value', async () => {
      const { headers } = await signIn('editor');
      const task = await createTask({ notes: 'Paint the fence' });
      const held = await heldRun('Generated');

      await patchTask(task.id, { summary: 'Mine' }, headers);

      held.release();
      await held.run;

      expect(await findTask(task.id)).toMatchObject({ summary: 'Mine', _summary_status: 'manual' });
    });
  });

  describe('rapid edits', () => {
    it('a run whose inputs changed saves nothing, and the next run saves the new result', async () => {
      const task = await createTask({ notes: 'one' });
      const held = await heldRun('From one');

      await updateTask(task.id, { notes: 'two' });

      held.release();
      await held.run;

      const stale = await findTask(task.id);

      expect(stale.summary ?? null).toBeNull();
      expect(stale._summary_status).toBe('pending');

      model.respondTitle({ text: 'From two' });

      await runJobs();

      expect(userMessage(model.titleRequests[1])).toContain('two');
      expect(await findTask(task.id)).toMatchObject({
        summary: 'From two',
        _summary_status: 'done',
      });
    });

    it('five quick edits leave one waiting run that uses the last edit', async () => {
      const { headers } = await signIn('editor');
      const task = await createTask({ notes: 'v0' });

      for (const notes of ['v1', 'v2', 'v3', 'v4', 'v5']) {
        await patchTask(task.id, { notes }, headers);
      }

      expect(await waitingRuns('summary')).toHaveLength(1);

      model.respondTitle({ text: 'Fifth' });

      await runJobs();

      expect(model.titleRequests).toHaveLength(1);
      expect(userMessage(model.titleRequests[0])).toContain('v5');
      expect((await findTask(task.id)).summary).toBe('Fifth');
    });
  });

  describe('regenerate', () => {
    it('writing pending on a manual record queues one run that replaces the value', async () => {
      const { headers } = await signIn('editor');
      const task = await createTask({ notes: 'Paint the fence', summary: 'Mine' });

      expect(task._summary_status).toBe('manual');

      await runJobs();

      await patchTask(task.id, { _summary_status: 'pending' }, headers);

      expect(await waitingRuns('summary')).toHaveLength(1);

      model.respondTitle({ text: 'Fresh' });

      await runJobs();

      expect(await findTask(task.id)).toMatchObject({ summary: 'Fresh', _summary_status: 'done' });
    });

    it('a viewer cannot regenerate', async () => {
      const { headers } = await signIn('viewer');
      const task = await createTask({ notes: 'Paint the fence', summary: 'Mine' });

      const response = await patchTask(task.id, { _summary_status: 'pending' }, headers);

      expect(response.status).toBe(403);
      expect(await waitingRuns('summary')).toHaveLength(0);
    });

    it('a Regenerate while another user edits the record is refused and queues nothing', async () => {
      const { headers } = await signIn('editor');
      const other = await createUser('editor');
      const task = await createTask({ notes: 'Paint the fence', summary: 'Mine' });

      await booted.payload.create({
        collection: 'payload-locked-documents',
        data: {
          document: { relationTo: tasksSlug, value: task.id },
          user: { relationTo: usersSlug, value: other.id },
        } as never,
      });

      const response = await patchTask(task.id, { _summary_status: 'pending' }, headers);

      expect(response.status).toBe(423);
      expect(await waitingRuns('summary')).toHaveLength(0);
      expect((await findTask(task.id))._summary_status).toBe('manual');
    });
  });

  describe('chains', () => {
    it('a summary run queues one category run, and that run completes it', async () => {
      const task = await createTask({ notes: 'Paint the fence' });

      await runJobs();

      const waiting = await waitingRuns();

      expect(waiting.map(({ input }) => input.field)).toEqual(['category']);

      await runJobs();

      expect(await waitingRuns()).toHaveLength(0);
      expect((await findTask(task.id))._category_status).toBe('done');
    });
  });

  describe('locales and drafts', () => {
    function findArticle(id: Doc['id'], args: Record<string, unknown> = {}): Promise<Doc> {
      return booted.frogbot.findByID({
        collection: articlesSlug,
        id,
        depth: 0,
        ...args,
      }) as Promise<unknown> as Promise<Doc>;
    }

    it('a French save writes only the French summary', async () => {
      const article = (await booted.frogbot.create({
        collection: articlesSlug,
        data: { body: 'Hello', _status: 'published' } as never,
      })) as unknown as Doc;

      model.respondTitle({ text: 'English summary' }, { text: 'French summary' });

      await runJobs();

      await booted.frogbot.update({
        collection: articlesSlug,
        id: article.id,
        data: { body: 'Bonjour' } as never,
        locale: 'fr',
      });

      await runJobs();

      expect((await findArticle(article.id, { locale: 'fr' })).summary).toBe('French summary');
      expect((await findArticle(article.id, { locale: 'en' })).summary).toBe('English summary');
    });

    it("a draft save's run stays a draft and leaves the published summary", async () => {
      const article = (await booted.frogbot.create({
        collection: articlesSlug,
        data: { body: 'v1', _status: 'published' } as never,
      })) as unknown as Doc;

      model.respondTitle({ text: 'Published summary' }, { text: 'Draft summary' });

      await runJobs();

      await booted.frogbot.update({
        collection: articlesSlug,
        id: article.id,
        data: { body: 'v2' } as never,
        draft: true,
      });

      await runJobs();

      expect(await findArticle(article.id, { draft: true })).toMatchObject({
        summary: 'Draft summary',
        _status: 'draft',
      });

      expect((await findArticle(article.id)).summary).toBe('Published summary');
    });
  });

  describe('attribution', () => {
    it("a user-triggered run's usage row names the user", async () => {
      const user = await createUser('editor');

      await createTask({ notes: 'Paint the fence' }, user);

      await runJobs();

      await vi.waitFor(
        async () => expect((await usageRows()).map((row) => row.user)).toEqual([user.id]),
        waitFor,
      );
    });

    it('a run with no user succeeds and its usage row has no user', async () => {
      const task = await createTask({ notes: 'Paint the fence' });

      await runJobs();

      expect((await findTask(task.id))._summary_status).toBe('done');

      await vi.waitFor(async () => expect(await usageRows()).toHaveLength(1), waitFor);

      expect((await usageRows())[0]?.user ?? null).toBeNull();
    });

    it("a run's save keeps the last modified by of a later save", async () => {
      const first = await createUser('editor');
      const second = await createUser('editor');
      const task = await createTask({});

      await updateTask(task.id, { notes: 'Paint the fence' }, first);
      await updateTask(task.id, { notes: 'Paint the fence' }, second);

      await runJobs();

      expect(await findTask(task.id)).toMatchObject({
        _summary_status: 'done',
        lastModifiedBy: second.id,
      });
    });
  });

  describe('access', () => {
    it("an editor's run leaves out inputs the editor can't read", async () => {
      const user = await createUser('editor');

      await createTask({ title: 'Fence', notes: 'Paint it', secret: 'Blue' }, user);

      await runJobs();

      expect(userMessage(model.titleRequests[0])).toBe(
        JSON.stringify({ title: 'Fence', notes: 'Paint it' }),
      );
    });

    it('a run with no user includes every input', async () => {
      await createTask({ notes: 'Paint it', secret: 'Blue' });

      await runJobs();

      expect(userMessage(model.titleRequests[0])).toContain('"secret":"Blue"');
    });

    it("a run for a user who can't read the record records why", async () => {
      const user = await createUser('blind');
      const task = await createTask({});

      await updateTask(task.id, { notes: 'Paint the fence' }, user);

      await runJobs();

      expect(model.titleRequests).toHaveLength(0);

      expect(await findTask(task.id)).toMatchObject({
        _summary_status: 'error',
        _summary_error: "The user who started this run can't read this record.",
      });
    });

    it('a run for a deleted user records that the user no longer exists', async () => {
      const user = await createUser('editor');
      const task = await createTask({ notes: 'Paint the fence' }, user);

      await booted.frogbot.delete({ collection: usersSlug, id: user.id });

      await runJobs();

      expect(model.titleRequests).toHaveLength(0);

      expect(await findTask(task.id)).toMatchObject({
        _summary_status: 'error',
        _summary_error: 'The user who started this run no longer exists.',
      });
    });

    it('a run for a deleted record completes with no error', async () => {
      const task = await createTask({ notes: 'Paint the fence' });

      await booted.frogbot.delete({ collection: tasksSlug, id: task.id });

      await runJobs();

      expect(model.titleRequests).toHaveLength(0);
      expect(await aiJobs()).toEqual([]);
    });
  });

  describe('select output', () => {
    async function createDoc(collection: string, data: Record<string, unknown>): Promise<Doc> {
      return (await booted.frogbot.create({
        collection: collection as never,
        data: data as never,
      })) as unknown as Doc;
    }

    function findDoc(collection: string, id: Doc['id']): Promise<Doc> {
      return booted.frogbot.findByID({
        collection: collection as never,
        id,
        depth: 0,
      }) as Promise<unknown> as Promise<Doc>;
    }

    async function classify(text: string): Promise<Doc> {
      const issue = await createDoc(issuesSlug, { notes: 'The button is broken' });

      model.respondTitle({ text });

      await runJobs();

      return findDoc(issuesSlug, issue.id);
    }

    async function label(text: string): Promise<Doc> {
      const report = await createDoc(reportsSlug, { body: 'The API docs are wrong' });

      model.respondTitle({ text });

      await runJobs();

      return findDoc(reportsSlug, report.id);
    }

    it('asks for JSON and lists the allowed values for a select', async () => {
      await classify('{"result":"bug"}');

      const [request] = model.titleRequests as Array<
        StubChatRequest & { response_format?: unknown }
      >;

      expect(request?.response_format).toEqual({ type: 'json_object' });
      expect(systemMessage(request)).toBe('Classify.\n\nAllowed values: bug, feature, question');
    });

    it('lists the allowed values for a multiple select', async () => {
      await label('{"elements":["api"]}');

      const [request] = model.titleRequests as Array<
        StubChatRequest & { response_format?: unknown }
      >;

      expect(request?.response_format).toEqual({ type: 'json_object' });
      expect(systemMessage(request)).toBe('Label.\n\nAllowed values (any number): ui, api, docs');
    });

    it('saves the picked option', async () => {
      expect(await classify('{"result":"bug"}')).toMatchObject({
        type: 'bug',
        _type_status: 'done',
        _type_error: null,
      });
    });

    it('saves an empty answer as no value on an optional select', async () => {
      expect(await classify('{"result":""}')).toMatchObject({ type: null, _type_status: 'done' });
    });

    it('saves error for an answer that is not an option', async () => {
      const issue = await classify('{"result":"enhancement"}');

      expect(issue._type_status).toBe('error');
      expect(issue._type_error).toBe('No object generated: response did not match schema.');
    });

    it('saves error for an answer that is not JSON', async () => {
      const issue = await classify('It is a bug.');

      expect(issue._type_status).toBe('error');
      expect(issue._type_error).toBe('No object generated: could not parse the response.');
    });

    it('saves the picked options without duplicates, in the model order', async () => {
      expect(await label('{"elements":["api","ui","api"]}')).toMatchObject({
        labels: ['api', 'ui'],
        _labels_status: 'done',
        _labels_error: null,
      });
    });

    it('saves error when a list holds a value that is not an option', async () => {
      expect(await label('{"elements":["api","mobile"]}')).toMatchObject({
        _labels_status: 'error',
        _labels_error: "Picked a value that isn't an option: mobile",
      });
    });

    it('saves an empty list as no options on a multiple select', async () => {
      expect(await label('{"elements":[]}')).toMatchObject({
        labels: [],
        _labels_status: 'done',
        _labels_error: null,
      });
    });

    it.runIf(textSelects)(
      'a record holding a removed option fails Regenerate with an invalid selection',
      async () => {
        const issue = await classify('{"result":"bug"}');

        await booted.payload.db.updateOne({
          collection: issuesSlug,
          id: issue.id,
          data: { type: 'obsolete' },
        });

        const response = await booted.restClient.patch(`/api/${issuesSlug}/${issue.id}`, {
          _type_status: 'pending',
        });

        expect(response.status).toBe(400);
        expect(JSON.stringify(response.body)).toContain('This field has an invalid selection');
        expect(await waitingRuns('type')).toHaveLength(0);
      },
    );
  });

  describe('records saved before the field existed', () => {
    async function createOlderTask(): Promise<Doc> {
      return (await booted.payload.db.create({
        collection: tasksSlug,
        data: { title: 'Older', notes: 'Paint the fence' },
      })) as unknown as Doc;
    }

    it('reads with an empty status, so the List can offer Generate', async () => {
      const task = await createOlderTask();

      const { docs } = await booted.frogbot.find({
        collection: tasksSlug,
        where: { id: { equals: task.id } },
        depth: 0,
      });

      expect(Object.hasOwn(docs[0] ?? {}, '_summary_status')).toBe(true);
      expect(docs[0]?._summary_status).toBeNull();
    });

    it('Generate queues a run that saves the value', async () => {
      const { headers } = await signIn('editor');
      const task = await createOlderTask();

      await patchTask(task.id, { _summary_status: 'pending' }, headers);

      model.respondTitle({ text: 'Generated later' });

      await runJobs();

      expect(await findTask(task.id)).toMatchObject({
        summary: 'Generated later',
        _summary_status: 'done',
      });
    });
  });
});

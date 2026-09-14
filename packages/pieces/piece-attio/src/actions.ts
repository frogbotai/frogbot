import type { PieceActionDefinition } from 'frogbot/pieces';
import { z } from 'zod';

import type { AttioClient } from './client.js';

const jsonObject = z.record(z.string(), z.unknown());
const resource = jsonObject;
const resultList = z.object({ found: z.boolean(), result: z.array(resource) });
const attributes = jsonObject.optional();
const objectId = z.string().meta({ label: 'Object' });
const listId = z.string().meta({ label: 'List' });

function action<TInput extends z.ZodType, TOutput extends z.ZodType>(
  definition: PieceActionDefinition<TInput, TOutput, object, AttioClient, unknown>,
) {
  return definition;
}

async function data(client: AttioClient, request: Parameters<AttioClient['request']>[0]) {
  const response = await client.request<{ data: unknown }>(request);

  return response.data;
}

function attributeValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;

  const item = value as Record<string, unknown>;
  const type = item.attribute_type;

  if (['text', 'number', 'checkbox', 'rating', 'date', 'timestamp'].includes(String(type))) {
    return item.value ?? null;
  }

  if (type === 'currency') return { value: item.currency_value, currency_code: item.currency_code };
  if (type === 'email-address') return item.email_address;
  if (type === 'personal-name') return item.full_name;
  if (type === 'phone-number') return item.phone_number;
  if (type === 'domain') return item.domain;
  if (type === 'select') return (item.option as Record<string, unknown> | null)?.title ?? null;
  if (type === 'status') return (item.status as Record<string, unknown> | null)?.title ?? null;
  if (type === 'record-reference') return item.target_record_id;
  if (type === 'actor-reference') return item.referenced_actor_id;
  if (type === 'interaction') return item.interacted_at;

  return value;
}

function normalizeRecord(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;

  if (!record.values || typeof record.values !== 'object' || Array.isArray(record.values)) {
    return value;
  }

  const values = Object.fromEntries(
    Object.entries(record.values as Record<string, unknown>).map(([key, raw]) => {
      if (!Array.isArray(raw) || raw.length === 0) return [key, null];

      const normalized = raw
        .map(attributeValue)
        .filter((item) => item !== null && item !== undefined);

      return [key, normalized.length <= 1 ? (normalized[0] ?? null) : normalized];
    }),
  );

  return { ...record, values };
}

async function paginatedData(client: AttioClient, request: Parameters<AttioClient['request']>[0]) {
  const results: unknown[] = [];

  for (let offset = 0; ; offset += 500) {
    const page = (await data(client, {
      ...request,
      query: { ...request.query, limit: 500, offset },
    })) as unknown[];

    results.push(...page);

    if (page.length < 500) return results;
  }
}

async function choices(client: AttioClient, path: string, label: string) {
  const items = z.array(jsonObject).parse(await data(client, { path }));

  return items.map((item) => {
    const id = jsonObject.safeParse(item.id);
    const identifiers = id.success ? id.data : {};

    return {
      label: String(item[label] ?? item.name ?? item.title ?? identifiers.object_id ?? item.id),
      value: String(
        identifiers.object_id ??
          identifiers.list_id ??
          identifiers.record_id ??
          identifiers.task_id ??
          identifiers.meeting_id ??
          identifiers.call_recording_id ??
          item.id,
      ),
    };
  });
}

const objectOptions = async ({ client }: { client: AttioClient }) =>
  choices(client, '/objects', 'singular_noun');
const listOptions = async ({ client }: { client: AttioClient }) =>
  choices(client, '/lists', 'name');

export const attioActions = [
  action({
    slug: 'createRecord',
    description: 'Create an Attio record',
    input: z.object({ objectId, attributes }),
    output: resource,
    idempotent: false,
    options: { objectId: objectOptions },
    async run({ input, client }) {
      return normalizeRecord(
        await data(client, {
          method: 'POST',
          path: `/objects/${input.objectId}/records`,
          body: { data: { values: input.attributes ?? {} } },
        }),
      );
    },
  }),
  action({
    slug: 'updateRecord',
    description: 'Update an Attio record',
    input: z.object({ objectId, recordId: z.string(), attributes }),
    output: resource,
    idempotent: true,
    options: { objectId: objectOptions },
    async run({ input, client }) {
      return normalizeRecord(
        await data(client, {
          method: 'PATCH',
          path: `/objects/${input.objectId}/records/${input.recordId}`,
          body: { data: { values: input.attributes ?? {} } },
        }),
      );
    },
  }),
  action({
    slug: 'findRecords',
    description: 'Find Attio records by ID or attributes',
    input: z.object({ objectId, recordId: z.string().optional(), attributes }),
    output: resultList,
    idempotent: true,
    options: { objectId: objectOptions },
    async run({ input, client }) {
      if (input.recordId) {
        const record = await data(client, {
          path: `/objects/${input.objectId}/records/${input.recordId}`,
        });

        return { found: true, result: [normalizeRecord(record)] };
      }

      const records = await paginatedData(client, {
        method: 'POST',
        path: `/objects/${input.objectId}/records/query`,
        body: { filter: input.attributes ?? {} },
      });

      return { found: records.length > 0, result: records.map(normalizeRecord) };
    },
  }),
  action({
    slug: 'getRecord',
    description: 'Get an Attio record',
    input: z.object({ objectId, recordId: z.string() }),
    output: resource,
    idempotent: true,
    options: { objectId: objectOptions },
    async run({ input, client }) {
      return normalizeRecord(
        await data(client, { path: `/objects/${input.objectId}/records/${input.recordId}` }),
      );
    },
  }),
  action({
    slug: 'createListEntry',
    description: 'Add a record to an Attio list',
    input: z.object({ listId, parentObjectId: z.string(), parentRecordId: z.string(), attributes }),
    output: resource,
    idempotent: false,
    options: { listId: listOptions, parentObjectId: objectOptions },
    run: ({ input, client }) =>
      data(client, {
        method: 'POST',
        path: `/lists/${input.listId}/entries`,
        body: {
          data: {
            parent_object: input.parentObjectId,
            parent_record_id: input.parentRecordId,
            entry_values: input.attributes ?? {},
          },
        },
      }),
  }),
  action({
    slug: 'updateListEntry',
    description: 'Update an Attio list entry',
    input: z.object({ listId, entryId: z.string(), attributes }),
    output: resource,
    idempotent: true,
    options: { listId: listOptions },
    run: ({ input, client }) =>
      data(client, {
        method: 'PATCH',
        path: `/lists/${input.listId}/entries/${input.entryId}`,
        body: { data: { entry_values: input.attributes ?? {} } },
      }),
  }),
  action({
    slug: 'findListEntries',
    description: 'Find entries in an Attio list',
    input: z.object({ listId, attributes }),
    output: resultList,
    idempotent: true,
    options: { listId: listOptions },
    async run({ input, client }) {
      const entries = await paginatedData(client, {
        method: 'POST',
        path: `/lists/${input.listId}/entries/query`,
        body: { filter: input.attributes ?? {} },
      });

      return { found: entries.length > 0, result: entries.map(normalizeRecord) };
    },
  }),
  action({
    slug: 'createNote',
    description: 'Create a note on an Attio record',
    input: z.object({
      parentObject: z.string(),
      parentRecordId: z.string(),
      title: z.string(),
      format: z.enum(['plaintext', 'markdown']).default('plaintext'),
      content: z.string(),
    }),
    output: resource,
    idempotent: false,
    options: { parentObject: objectOptions },
    run: ({ input, client }) =>
      data(client, {
        method: 'POST',
        path: '/notes',
        body: {
          data: {
            parent_object: input.parentObject,
            parent_record_id: input.parentRecordId,
            title: input.title,
            format: input.format,
            content: input.content,
          },
        },
      }),
  }),
  action({
    slug: 'getCallTranscript',
    description: 'Get an Attio call recording transcript',
    input: z.object({ meetingId: z.string(), callRecordingId: z.string() }),
    output: jsonObject,
    idempotent: true,
    run: ({ input, client }) =>
      client.request({
        path: `/meetings/${input.meetingId}/call_recordings/${input.callRecordingId}/transcript`,
      }),
  }),
  action({
    slug: 'createTask',
    description: 'Create an Attio task',
    input: z.object({
      content: z.string(),
      deadlineAt: z.string().optional(),
      isCompleted: z.boolean().optional(),
      linkedObject: z.string().optional(),
      linkedRecordId: z.string().optional(),
      assigneeEmail: z.string().optional(),
    }),
    output: resource,
    idempotent: false,
    options: { linkedObject: objectOptions },
    run: ({ input, client }) =>
      data(client, {
        method: 'POST',
        path: '/tasks',
        body: {
          data: {
            content: input.content,
            format: 'plaintext',
            deadline_at: input.deadlineAt ?? null,
            is_completed: input.isCompleted ?? false,
            linked_records:
              input.linkedObject && input.linkedRecordId
                ? [{ target_object: input.linkedObject, target_record_id: input.linkedRecordId }]
                : [],
            assignees: input.assigneeEmail
              ? [{ workspace_member_email_address: input.assigneeEmail }]
              : [],
          },
        },
      }),
  }),
  action({
    slug: 'listTasks',
    description: 'List Attio tasks',
    input: z.object({
      linkedObject: z.string().optional(),
      linkedRecordId: z.string().optional(),
      assignee: z.string().optional(),
      isCompleted: z.enum(['all', 'true', 'false']).optional(),
    }),
    output: resultList,
    idempotent: true,
    options: { linkedObject: objectOptions },
    async run({ input, client }) {
      const tasks = (await data(client, {
        path: '/tasks',
        query: {
          limit: 500,
          offset: 0,
          linked_object: input.linkedObject,
          linked_record_id: input.linkedRecordId,
          assignee: input.assignee,
          is_completed: input.isCompleted === 'all' ? undefined : input.isCompleted,
        },
      })) as unknown[];

      return { found: tasks.length > 0, result: tasks };
    },
  }),
  ...(['getTask', 'deleteTask'] as const).map((slug) =>
    action({
      slug,
      description: `${slug === 'getTask' ? 'Get' : 'Delete'} an Attio task`,
      input: z.object({ taskId: z.string() }),
      output: slug === 'getTask' ? resource : z.object({ success: z.literal(true) }),
      idempotent: true,
      options: { taskId: async ({ client }) => choices(client, '/tasks?limit=500', 'content') },
      async run({ input, client }) {
        if (slug === 'deleteTask') {
          await client.request({ method: 'DELETE', path: `/tasks/${input.taskId}` });

          return { success: true };
        }

        return data(client, { path: `/tasks/${input.taskId}` });
      },
    }),
  ),
  action({
    slug: 'updateTask',
    description: 'Update an Attio task',
    input: z.object({
      taskId: z.string(),
      content: z.string().optional(),
      deadlineAt: z.string().optional(),
      isCompleted: z.boolean().optional(),
      linkedObject: z.string().optional(),
      linkedRecordId: z.string().optional(),
      assigneeEmail: z.string().optional(),
    }),
    output: resource,
    idempotent: true,
    async run({ input, client }) {
      const values: Record<string, unknown> = {};

      if (input.content !== undefined) {
        Object.assign(values, { content: input.content, format: 'plaintext' });
      }
      if (input.deadlineAt !== undefined) values.deadline_at = input.deadlineAt;
      if (input.isCompleted !== undefined) values.is_completed = input.isCompleted;
      if (input.linkedObject && input.linkedRecordId) {
        values.linked_records = [
          { target_object: input.linkedObject, target_record_id: input.linkedRecordId },
        ];
      }
      if (input.assigneeEmail) {
        values.assignees = [{ workspace_member_email_address: input.assigneeEmail }];
      }

      if (Object.keys(values).length === 0) {
        throw new Error('At least one field must be provided to update the task.');
      }

      return data(client, {
        method: 'PATCH',
        path: `/tasks/${input.taskId}`,
        body: { data: values },
      });
    },
  }),
  action({
    slug: 'customApiCall',
    description: 'Make a custom Attio API call',
    input: z.object({
      method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']),
      path: z
        .string()
        .startsWith('/')
        .refine((path) => !path.split('/').includes('..'), {
          message: 'Path cannot contain parent segments.',
        }),
      headers: z.record(z.string(), z.string()).optional(),
      query: z.record(z.string(), z.unknown()).optional(),
      body: z.unknown().optional(),
    }),
    output: z.object({
      status: z.number(),
      headers: z.record(z.string(), z.string()),
      body: z.unknown(),
    }),
    run: ({ input, client, req }) => {
      if (!input.path) throw new Error('Path is required.');

      return client.request({
        method: input.method,
        path: input.path,
        headers: input.headers,
        query: input.query,
        body: input.body,
        rawResponse: true,
        signal: req.signal ?? undefined,
      });
    },
  }),
];

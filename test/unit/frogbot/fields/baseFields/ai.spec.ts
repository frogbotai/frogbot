import { describe, expect, it, vi } from 'vitest';

import {
  nextAIFieldError,
  nextAIFieldStatus,
} from '../../../../../packages/frogbot/src/fields/baseFields/ai/hooks.js';
import {
  aiField,
  type AIFieldArgs,
  type AISelectFieldArgs,
} from '../../../../../packages/frogbot/src/fields/baseFields/ai/index.js';
import type { AIKind } from '../../../../../packages/frogbot/src/fields/baseFields/ai/state.js';
import type { Field, TextField } from '../../../../../packages/frogbot/src/fields/config/types.js';

type Schema = Parameters<NonNullable<TextField['typescriptSchema']>[number]>[0]['jsonSchema'];

type AnyField = Field & {
  admin?: Record<string, unknown>;
  hooks?: Record<string, ((args: unknown) => unknown)[]>;
  typescriptSchema?: TextField['typescriptSchema'];
};

const base = { name: 'summary', inputs: ['title', 'notes'], prompt: 'Summarize.' };

const kind: AIKind = { type: 'ai', inputs: ['title', 'notes'], prompt: 'Summarize.' };

const valueText =
  'Generated automatically by AI from: title, notes. Writing a value keeps it and stops automatic updates';

function make(args: Partial<AIFieldArgs> = {}) {
  const row = aiField({ ...base, ...args } as AIFieldArgs);
  const [value, status, error] = row.fields as AnyField[];

  return { error, row, status, value };
}

const typeOptions: AISelectFieldArgs['options'] = [
  { label: 'Bug', value: 'bug', color: 'red' },
  { label: 'Feature', value: 'feature', color: 'green' },
  'question',
];

function makeSelect(args: Partial<AISelectFieldArgs> = {}) {
  const row = aiField({
    ...base,
    name: 'type',
    options: typeOptions,
    ...args,
  } as AISelectFieldArgs);
  const [value, status, error] = row.fields as AnyField[];

  return { error, row, status, value };
}

function runSchema(field: AnyField, jsonSchema: Schema) {
  return (field.typescriptSchema ?? []).reduce(
    (schema, entry) => entry({ jsonSchema: schema }),
    jsonSchema,
  );
}

function queueRequest({ locale, user }: { locale?: string; user?: object } = {}) {
  const queue = vi.fn();

  return { queue, req: { frogbot: { jobs: { queue } }, locale, user: user ?? null } };
}

function runQueueHook(
  field: AnyField,
  args: {
    context?: object;
    data?: object;
    doc: object;
    operation?: string;
    previousDoc?: object;
    req: object;
    value?: unknown;
  },
) {
  const { doc, ...rest } = args;
  const [hook] = field.hooks?.afterChange ?? [];

  return hook({
    collection: { slug: 'tasks' },
    context: {},
    operation: 'update',
    previousDoc: {},
    originalDoc: doc,
    ...rest,
  });
}

describe('aiField row', () => {
  it('returns a row holding the value field and the two state fields', () => {
    const { row } = make();

    expect(row.type).toBe('row');
    expect(row.fields.map((field) => ('name' in field ? field.name : undefined))).toEqual([
      'summary',
      '_summary_status',
      '_summary_error',
    ]);
  });

  it('puts admin.position on the row only', () => {
    const { row, value } = make({ admin: { position: 'sidebar', width: '50%' } });

    expect(row.admin).toEqual({ position: 'sidebar' });
    expect(value.admin).not.toHaveProperty('position');
    expect(value.admin?.width).toBe('50%');
  });

  it('leaves the row without admin when no position is given', () => {
    const { row } = make({ admin: { width: '50%' } });

    expect(row).not.toHaveProperty('admin');
  });

  it('keeps every other option on the value field', () => {
    const access = { update: () => false };
    const beforeChange = [() => 'x'];
    const condition = () => true;

    const { row, value } = make({
      access,
      admin: { className: 'ai', condition, readOnly: true, width: '50%' },
      hooks: { beforeChange },
      label: 'Summary',
      unique: true,
    });

    expect(value).toMatchObject({ access, label: 'Summary', unique: true });
    expect(value.hooks?.beforeChange?.[0]).toBe(beforeChange[0]);
    expect(value.admin).toMatchObject({ className: 'ai', condition, readOnly: true, width: '50%' });
    expect(row).not.toHaveProperty('label');
    expect(row).not.toHaveProperty('unique');
  });
});

describe('aiField value field', () => {
  it('is a text field with the AI marker', () => {
    const { value } = make();

    expect(value.type).toBe('text');
    expect(value.admin?.custom).toEqual({ frogbot: { kind } });
  });

  it('records the model in the marker when one is given', () => {
    const { value } = make({ model: 'openai/gpt-5-nano' });

    expect(value.admin?.custom).toEqual({
      frogbot: { kind: { ...kind, model: 'openai/gpt-5-nano' } },
    });
  });

  it('does not keep inputs, prompt or model on the field', () => {
    const { value } = make({ model: 'openai/gpt-5-nano' });

    expect(value).not.toHaveProperty('inputs');
    expect(value).not.toHaveProperty('prompt');
    expect(value).not.toHaveProperty('model');
  });

  it('uses FieldCell for the list cell and AIField for editing', () => {
    const { value } = make();

    expect(value.admin?.components).toEqual({
      Cell: '@frogbotai/next/client#FieldCell',
      Field: '@frogbotai/next/client#AIField',
    });
  });

  it('keeps a developer Cell and Field', () => {
    const { value } = make({ admin: { components: { Cell: './Cell#Cell', Field: './F#F' } } });

    expect(value.admin?.components).toEqual({ Cell: './Cell#Cell', Field: './F#F' });
  });

  it('gives agents the generated-by-AI text', () => {
    const { value } = make();

    expect(runSchema(value, { type: ['string', 'null'] }).description).toBe(valueText);
  });

  it('appends the generated-by-AI text to a developer description', () => {
    const { value } = make({ admin: { description: 'Short summary' } });

    expect(
      runSchema(value, { type: ['string', 'null'], description: 'Short summary' }).description,
    ).toBe(`Short summary (${valueText[0].toLowerCase()}${valueText.slice(1)})`);
  });
});

describe('aiField state fields', () => {
  it('are disabled in the admin', () => {
    const { error, status } = make();

    expect(status.admin).toEqual({ disabled: true });
    expect(error.admin).toEqual({ disabled: true });
  });

  it('are localized when the value is', () => {
    const { error, status } = make({ localized: true });

    expect(status).toMatchObject({ localized: true });
    expect(error).toMatchObject({ localized: true });
  });

  it('are not localized when the value is not', () => {
    const { error, status } = make();

    expect(status).not.toHaveProperty('localized');
    expect(error).not.toHaveProperty('localized');
  });

  it('stores the status as a select of the four states', () => {
    const { error, status } = make();

    expect(status).toMatchObject({
      type: 'select',
      options: ['pending', 'done', 'error', 'manual'],
    });
    expect(error.type).toBe('text');
  });

  it('describe themselves to agents', () => {
    const { error, status } = make();

    expect(runSchema(status, { type: ['string', 'null'] }).description).toBe(
      'Set by FrogBot: pending, done, error or manual. Write "pending" to regenerate the value',
    );
    expect(runSchema(error, { type: ['string', 'null'] }).description).toBe(
      'Set by FrogBot: the error message from the last failed run',
    );
  });
});

describe('aiField call-time errors', () => {
  it.each([
    [{ inputs: [] }, 'inputs must be a non-empty array of field names'],
    [{ inputs: 'title' }, 'inputs must be a non-empty array of field names'],
    [{ inputs: ['title', ''] }, 'inputs must be a non-empty array of field names'],
    [{ prompt: '' }, 'prompt must be a non-empty string'],
    [{ prompt: '  ' }, 'prompt must be a non-empty string'],
    [{ prompt: undefined }, 'prompt must be a non-empty string'],
    [{ model: '' }, 'model must be a non-empty string'],
    [{ model: 42 }, 'model must be a non-empty string'],
    [{ hasMany: true }, 'hasMany is not supported'],
    [{ required: true }, 'required is not supported'],
    [{ required: false }, 'required is not supported'],
    [{ virtual: true }, 'virtual is not supported'],
    [{ virtual: 'author.name' }, 'virtual is not supported'],
    [{ hidden: true }, 'hidden is not supported'],
  ])('rejects %o', (options, message) => {
    expect(() => aiField({ ...base, ...(options as object) } as AIFieldArgs)).toThrow(
      new Error(`aiField "summary": ${message}`),
    );
  });
});

describe('aiField select output', () => {
  it('makes a select value field that keeps the options unchanged', () => {
    const { value } = makeSelect();

    expect(value).toMatchObject({ name: 'type', type: 'select', options: typeOptions });
    expect(value).not.toHaveProperty('hasMany');
  });

  it('makes a multiple select with hasMany', () => {
    const { value } = makeSelect({ hasMany: true });

    expect(value).toMatchObject({ type: 'select', hasMany: true, options: typeOptions });
  });

  it('drops hasMany false from the value field', () => {
    const { value } = makeSelect({ hasMany: false });

    expect(value).not.toHaveProperty('hasMany');
  });

  it('carries the AI marker, FieldCell and AIField', () => {
    const { value } = makeSelect({ hasMany: true });

    expect(value.admin?.custom).toEqual({ frogbot: { kind } });
    expect(value.admin?.components).toEqual({
      Cell: '@frogbotai/next/client#FieldCell',
      Field: '@frogbotai/next/client#AIField',
    });
  });

  it('keeps the same state fields as a text AI field', () => {
    const { error, status } = makeSelect();

    expect(status).toMatchObject({
      name: '_type_status',
      type: 'select',
      admin: { disabled: true },
    });
    expect(error).toMatchObject({ name: '_type_error', type: 'text', admin: { disabled: true } });
  });

  it.each([
    [{ options: [] }, 'options must be a non-empty array'],
    [{ options: 'bug' }, 'options must be a non-empty array'],
    [{ options: ['bug', ''] }, 'option values must be non-empty strings'],
    [{ options: [{ label: 'None', value: '' }] }, 'option values must be non-empty strings'],
    [{ options: [{ label: 'Bug' }] }, 'option values must be non-empty strings'],
    [{ options: typeOptions, required: true }, 'required is not supported'],
    [{ options: typeOptions, hasMany: true, required: true }, 'required is not supported'],
    [{ options: typeOptions, virtual: true }, 'virtual is not supported'],
    [{ options: typeOptions, hidden: true }, 'hidden is not supported'],
  ])('rejects %o', (options, message) => {
    expect(() =>
      aiField({ ...base, name: 'type', ...(options as object) } as AISelectFieldArgs),
    ).toThrow(new Error(`aiField "type": ${message}`));
  });
});

describe('aiField status rules', () => {
  const run = { collection: 'tasks', id: 1, field: 'summary' };

  it.each([
    [
      'an own run keeps the incoming status',
      {
        data: { _summary_status: 'done' },
        originalDoc: { _summary_status: 'pending' },
        ownRun: true,
      },
      'done',
    ],
    [
      'Regenerate sets pending',
      { data: { _summary_status: 'pending' }, originalDoc: { _summary_status: 'manual' } },
      'pending',
    ],
    [
      'an incoming pending over a stored pending changes nothing',
      { data: { _summary_status: 'pending' }, originalDoc: { _summary_status: 'pending' } },
      'pending',
    ],
    [
      'an edited value is manual',
      { data: { summary: 'Mine' }, originalDoc: { summary: 'AI', _summary_status: 'done' } },
      'manual',
    ],
    [
      'clearing the value by hand is manual',
      { data: { summary: '' }, originalDoc: { summary: 'AI', _summary_status: 'done' } },
      'manual',
    ],
    [
      'an unchanged value is not an edit',
      { data: { summary: 'AI' }, originalDoc: { summary: 'AI', _summary_status: 'done' } },
      'done',
    ],
    [
      'an empty string over null is not an edit',
      { data: { summary: '' }, originalDoc: { summary: null, _summary_status: null } },
      null,
    ],
    [
      'a manual record stays manual when an input changes',
      { data: { notes: 'New' }, originalDoc: { notes: 'Old', _summary_status: 'manual' } },
      'manual',
    ],
    [
      'a changed input sets pending',
      { data: { notes: 'New' }, originalDoc: { notes: 'Old', _summary_status: 'done' } },
      'pending',
    ],
    [
      'an input that is not in the data is not a change',
      { data: { other: 'x' }, originalDoc: { notes: 'Old', _summary_status: 'done' } },
      'done',
    ],
    [
      'an input cleared to an empty string over null is not a change',
      { data: { notes: '' }, originalDoc: { notes: null, _summary_status: 'done' } },
      'done',
    ],
    [
      'an incoming non-pending status is ignored',
      { data: { _summary_status: 'done' }, originalDoc: { _summary_status: 'error' } },
      'error',
    ],
    ['a record never run keeps no status', { data: {}, originalDoc: {} }, null],
    [
      'an empty list over null is not an edit',
      { data: { summary: [] }, originalDoc: { summary: null, _summary_status: null } },
      null,
    ],
    [
      'clearing a list value by hand is manual',
      { data: { summary: [] }, originalDoc: { summary: ['ui'], _summary_status: 'done' } },
      'manual',
    ],
    [
      'an unchanged list value is not an edit',
      {
        data: { summary: ['ui', 'api'] },
        originalDoc: { summary: ['ui', 'api'], _summary_status: 'done' },
      },
      'done',
    ],
    [
      'a changed list input sets pending',
      { data: { notes: ['a', 'b'] }, originalDoc: { notes: ['a'], _summary_status: 'done' } },
      'pending',
    ],
    [
      'an empty list input over null is not a change',
      { data: { notes: [] }, originalDoc: { notes: null, _summary_status: 'done' } },
      'done',
    ],
  ])('on update, %s', (_name, args, expected) => {
    expect(
      nextAIFieldStatus({ kind, name: 'summary', operation: 'update', ownRun: false, ...args }),
    ).toBe(expected);
  });

  it.each([
    ['a set input sets pending', { notes: 'Hello' }, 'pending'],
    [
      'an admin form submitting empty strings is not manual',
      { summary: '', notes: 'Hi' },
      'pending',
    ],
    ['no input set keeps no status', { title: '', notes: null }, null],
    [
      'a value with the inputs, as from Duplicate, is manual',
      { summary: 'AI', notes: 'Hi' },
      'manual',
    ],
    ['an incoming pending sets pending', { _summary_status: 'pending' }, 'pending'],
    ['an empty list value and input are not set', { summary: [], notes: [] }, null],
    ['a set list input sets pending', { notes: ['a'] }, 'pending'],
  ])('on create, %s', (_name, data, expected) => {
    expect(
      nextAIFieldStatus({
        data,
        kind,
        name: 'summary',
        operation: 'create',
        originalDoc: undefined,
        ownRun: false,
      }),
    ).toBe(expected);
  });

  it.each([
    ['another collection', { ...run, collection: 'articles' }],
    ['another record', { ...run, id: 2 }],
    ['another field', { ...run, field: 'category' }],
  ])('a run context for %s is not the field own run', async (_name, context) => {
    const { status } = make();
    const [hook] = status.hooks?.beforeChange ?? [];

    expect(
      await hook({
        collection: { slug: 'tasks' },
        context: { frogbotAIFieldRun: context },
        data: { summary: 'AI', _summary_status: 'done' },
        operation: 'update',
        originalDoc: { id: 1, summary: 'Old', _summary_status: 'pending' },
      }),
    ).toBe('manual');
  });

  it('the status hook accepts its own run', async () => {
    const { status } = make();
    const [hook] = status.hooks?.beforeChange ?? [];

    expect(
      await hook({
        collection: { slug: 'tasks' },
        context: { frogbotAIFieldRun: run },
        data: { summary: 'AI', _summary_status: 'done' },
        operation: 'update',
        originalDoc: { id: 1, summary: 'Old', _summary_status: 'pending' },
      }),
    ).toBe('done');
  });

  it.each([
    ['value', 'summary', 'Mine'],
    ['status', '_summary_status', 'manual'],
    ['error', '_summary_error', 'Kept'],
  ])(
    'the %s guard of a run whose record changed since its read keeps the stored value',
    async (_, path, stored) => {
      const { error, status, value } = make();
      const field = { summary: value, _summary_status: status, _summary_error: error }[path];
      const hook = field?.hooks?.beforeValidate?.at(-1);

      expect(
        await hook?.({
          collection: { slug: 'tasks' },
          context: { frogbotAIFieldRun: { ...run, isCurrent: () => Promise.resolve(false) } },
          originalDoc: {
            id: 1,
            summary: 'Mine',
            _summary_status: 'manual',
            _summary_error: 'Kept',
          },
          value: 'From the run',
        }),
      ).toBe(stored);
    },
  );

  it('the guard of a run whose record is still current keeps the run value', async () => {
    const { value } = make();
    const hook = value.hooks?.beforeValidate?.at(-1);
    const isCurrent = vi.fn(() => Promise.resolve(true));

    expect(
      await hook?.({
        collection: { slug: 'tasks' },
        context: { frogbotAIFieldRun: { ...run, isCurrent } },
        originalDoc: { id: 1, summary: 'Old', _summary_status: 'pending' },
        value: 'AI',
      }),
    ).toBe('AI');
    expect(isCurrent).toHaveBeenCalledTimes(1);
  });

  it('the guard leaves a save that is not its own run alone', async () => {
    const { value } = make();
    const hook = value.hooks?.beforeValidate?.at(-1);
    const isCurrent = vi.fn(() => Promise.resolve(false));

    expect(
      await hook?.({
        collection: { slug: 'tasks' },
        context: { frogbotAIFieldRun: { ...run, id: 2, isCurrent } },
        originalDoc: { id: 1, summary: 'Old', _summary_status: 'done' },
        value: 'Mine',
      }),
    ).toBe('Mine');
    expect(isCurrent).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, null],
    [null, null],
    ['done', 'done'],
  ])('the status reads %s as %s', (stored, expected) => {
    const { status } = make();
    const [hook] = status.hooks?.afterRead ?? [];

    expect(hook({ value: stored })).toBe(expected);
  });
});

describe('aiField error rule', () => {
  const args = { kind, name: 'summary', operation: 'update' };

  it('keeps the incoming message on an own run that fails', () => {
    expect(
      nextAIFieldError({
        ...args,
        data: { _summary_status: 'error', _summary_error: 'Boom' },
        originalDoc: { _summary_status: 'pending', _summary_error: null },
        ownRun: true,
      }),
    ).toBe('Boom');
  });

  it('clears the message when the status changes', () => {
    expect(
      nextAIFieldError({
        ...args,
        data: { _summary_status: 'pending', _summary_error: 'Kept?' },
        originalDoc: { _summary_status: 'error', _summary_error: 'Boom' },
        ownRun: false,
      }),
    ).toBeNull();
  });

  it('keeps the stored message when the status does not change', () => {
    expect(
      nextAIFieldError({
        ...args,
        data: { _summary_error: 'Overwritten' },
        originalDoc: { _summary_status: 'error', _summary_error: 'Boom' },
        ownRun: false,
      }),
    ).toBe('Boom');
  });

  it('clears the message on an own run that succeeds', () => {
    expect(
      nextAIFieldError({
        ...args,
        data: { _summary_status: 'done', _summary_error: null },
        originalDoc: { _summary_status: 'pending', _summary_error: 'Old' },
        ownRun: true,
      }),
    ).toBeNull();
  });
});

describe('aiField queueing', () => {
  const pending = { id: 7, notes: 'New', _summary_status: 'pending' };

  it('queues a run with the save request and the full input', async () => {
    const { status } = make();
    const { queue, req } = queueRequest({
      locale: 'fr',
      user: { collection: 'users', id: 3, email: 'a@b.c' },
    });

    await runQueueHook(status, { doc: pending, previousDoc: { _summary_status: 'done' }, req });

    expect(queue).toHaveBeenCalledTimes(1);
    expect(queue).toHaveBeenCalledWith({
      task: 'frogbot-run-ai-field',
      input: {
        collection: 'tasks',
        id: 7,
        field: 'summary',
        locale: 'fr',
        user: { collection: 'users', id: 3 },
      },
      req,
    });
  });

  it('omits locale and user when the request has none', async () => {
    const { status } = make();
    const { queue, req } = queueRequest();

    await runQueueHook(status, { doc: pending, operation: 'create', req });

    expect(queue).toHaveBeenCalledWith({
      task: 'frogbot-run-ai-field',
      input: { collection: 'tasks', id: 7, field: 'summary' },
      req,
    });
  });

  it('does not queue on the field own run', async () => {
    const { status } = make();
    const { queue, req } = queueRequest();
    const context = { frogbotAIFieldRun: { collection: 'tasks', id: 7, field: 'summary' } };

    await runQueueHook(status, {
      context,
      doc: pending,
      previousDoc: { _summary_status: 'done' },
      req,
    });

    expect(queue).not.toHaveBeenCalled();
  });

  it('does not queue when the status was already pending and no input changed', async () => {
    const { status } = make();
    const { queue, req } = queueRequest();

    await runQueueHook(status, { doc: pending, previousDoc: { ...pending, title: 'x' }, req });

    expect(queue).not.toHaveBeenCalled();
  });

  it('queues again when an input changes while the status is pending', async () => {
    const { status } = make();
    const { queue, req } = queueRequest();

    await runQueueHook(status, { doc: pending, previousDoc: { ...pending, notes: 'Old' }, req });

    expect(queue).toHaveBeenCalledTimes(1);
  });

  it('does not queue when the saved status is not pending', async () => {
    const { status } = make();
    const { queue, req } = queueRequest();

    await runQueueHook(status, {
      doc: { ...pending, _summary_status: 'manual' },
      previousDoc: { _summary_status: 'done' },
      req,
    });

    expect(queue).not.toHaveBeenCalled();
  });

  it.each([
    ['an input edit', { notes: 'New' }, { ...pending, notes: 'Old', _summary_status: 'done' }],
    ['a Regenerate', { _summary_status: 'pending' }, { ...pending, _summary_status: 'done' }],
  ])('queues %s saved with a select that leaves out the status', async (_, data, previous) => {
    const { status } = make();
    const { queue, req } = queueRequest();

    await runQueueHook(status, { data, doc: { id: 7 }, previousDoc: previous, req });

    expect(queue).toHaveBeenCalledTimes(1);
  });

  it('does not queue a save with a select that leaves out the status of a manual value', async () => {
    const { status } = make();
    const { queue, req } = queueRequest();

    await runQueueHook(status, {
      data: { notes: 'New' },
      doc: { id: 7 },
      previousDoc: { ...pending, notes: 'Old', _summary_status: 'manual' },
      req,
    });

    expect(queue).not.toHaveBeenCalled();
  });

  it('returns the saved status unchanged', async () => {
    const { status } = make();
    const { req } = queueRequest();

    const result = await runQueueHook(status, { doc: pending, req, value: 'pending' });

    expect(result).toBe('pending');
  });
});

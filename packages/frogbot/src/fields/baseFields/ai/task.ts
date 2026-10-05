import { isDeepStrictEqual } from 'node:util';

import { jsonSchema, Output } from 'ai';
import type { FlattenedField, JobsConfig, PayloadRequest, TaskConfig } from 'payload';
import { flattenTopLevelFields } from 'payload/shared';

import { resolveSmallModel } from '../../../ai/models.js';
import type { AIConfig, ModelId, SanitizedAIConfig } from '../../../ai/types.js';
import type { CollectionConfig } from '../../../collections/config/types.js';
import type { FrogBot } from '../../../frogbot.js';
import { getFrogBotInstance } from '../../../instanceRegistry.js';
import type { FrogBotRequest } from '../../../types/request.js';
import type { Field } from '../../config/types.js';
import {
  AI_FIELD_RUN_CONTEXT,
  AI_FIELD_TASK_SLUG,
  type AIFieldRunInput,
  getAIKind,
} from './hooks.js';
import { aiFieldPaths, type AIKind } from './state.js';

type AIFieldTask = { input: AIFieldRunInput; output: Record<string, never> };

type AutorunCronConfig = Extract<NonNullable<JobsConfig['autoRun']>, unknown[]>[number];

type RunDoc = Record<string, unknown> & { _status?: unknown };

type AISelectOutput = { hasMany: boolean; values: string[] };

type AIFieldAnswer = { text: string; output: unknown };

const ERROR_LENGTH = 200;

const userMissing = 'The user who started this run no longer exists.';

const recordUnreadable = "The user who started this run can't read this record.";

export function resolveAIFieldModel(
  ai: AIConfig | SanitizedAIConfig | undefined,
  kind: Pick<AIKind, 'model'>,
): string | undefined {
  if (kind.model) return kind.model;

  const mainModel = ai?.defaultModel ?? ai?.smallModel;

  if (!ai || !mainModel) return undefined;

  return resolveSmallModel(ai, mainModel);
}

function concurrencyKey({ input }: { input: AIFieldRunInput }): string {
  const key = `${input.collection}:${input.id}:${input.field}`;

  return input.locale ? `${key}:${input.locale}` : key;
}

function pickInputs(kind: AIKind, doc: RunDoc): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const input of kind.inputs) {
    if (input in doc) values[input] = doc[input];
  }

  return values;
}

function getSelectOutput(field: FlattenedField): AISelectOutput | undefined {
  if (field.type !== 'select') return undefined;

  return {
    hasMany: field.hasMany === true,
    values: field.options.map((option) => (typeof option === 'string' ? option : option.value)),
  };
}

function selectRequest({ hasMany, values }: AISelectOutput) {
  if (hasMany) {
    return {
      allowed: `\n\nAllowed values (any number): ${values.join(', ')}`,
      output: Output.array({ element: jsonSchema<string>({ type: 'string', enum: values }) }),
    };
  }

  return {
    allowed: `\n\nAllowed values: ${values.join(', ')}`,
    output: Output.choice({ options: [...values, ''] }),
  };
}

function readAnswer(select: AISelectOutput | undefined, { output, text }: AIFieldAnswer) {
  if (!select) return text.trim();

  if (!select.hasMany) return output === '' ? null : output;

  const picked = output as string[];
  const invalid = picked.find((value) => !select.values.includes(value));

  if (invalid !== undefined) throw new Error(`Picked a value that isn't an option: ${invalid}`);

  return [...new Set(picked)];
}

async function loadUser({
  frogbot,
  user,
}: {
  frogbot: FrogBot;
  user: NonNullable<AIFieldRunInput['user']>;
}): Promise<FrogBotRequest['user']> {
  const doc = await frogbot.findByID({
    collection: user.collection as never,
    id: user.id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  });

  return doc ? ({ ...doc, collection: user.collection } as FrogBotRequest['user']) : null;
}

async function runAIField({ input, req }: { input: AIFieldRunInput; req: PayloadRequest }) {
  const frogbot = getFrogBotInstance(req.payload);
  const collection = req.payload.collections[input.collection]?.config;

  const field = collection?.flattenedFields.find(({ name }) => name === input.field);

  const kind = field && getAIKind(field as Field);

  if (!frogbot || !collection || !field || !kind) return;

  const paths = aiFieldPaths(input.field);
  const select = getSelectOutput(field);
  const request = select ? selectRequest(select) : undefined;

  const user = input.user ? await loadUser({ frogbot, user: input.user }) : null;

  const runReq = await frogbot.createRequest({
    user,
    context: { ...req.context, source: 'ai-field' },
    ...(input.locale ? { locale: input.locale } : {}),
  });

  const read = (overrideAccess: boolean) =>
    frogbot.findByID({
      collection: input.collection as never,
      id: input.id,
      depth: 0,
      disableErrors: true,
      draft: Boolean(collection.versions?.drafts),
      fallbackLocale: 'none',
      ...(input.locale ? { locale: input.locale as never } : {}),
      overrideAccess,
      req: runReq,
    }) as Promise<null | RunDoc>;

  const write = (latest: RunDoc, data: Record<string, unknown>) =>
    frogbot.update({
      collection: input.collection as never,
      id: input.id,
      data: data as never,
      depth: 0,
      draft: latest._status === 'draft',
      ...(input.locale ? { locale: input.locale as never } : {}),
      overrideAccess: true,
      req: runReq,
      context: {
        [AI_FIELD_RUN_CONTEXT]: { collection: input.collection, id: input.id, field: input.field },
      },
    });

  const fail = (latest: RunDoc, message: string) =>
    write(latest, {
      [paths.status]: 'error',
      [paths.error]: message.slice(0, ERROR_LENGTH),
    });

  if (input.user && !user) {
    const stored = await read(true);

    if (stored?.[paths.status] === 'pending') await fail(stored, userMissing);

    return;
  }

  const doc = await read(!user);

  if (!doc) {
    const stored = user ? await read(true) : null;

    if (stored?.[paths.status] === 'pending') await fail(stored, recordUnreadable);

    return;
  }

  if (doc[paths.status] !== 'pending') return;

  const values = pickInputs(kind, doc);

  const current = async () => {
    const latest = await read(!user);

    const unchanged =
      latest?.[paths.status] === 'pending' && isDeepStrictEqual(pickInputs(kind, latest), values);

    return unchanged ? latest : undefined;
  };

  try {
    const result = await frogbot.generateText({
      model: resolveAIFieldModel(frogbot.config.ai, kind) as ModelId,
      req: runReq,
      overrideAccess: !runReq.user,
      instructions: request ? `${kind.prompt}${request.allowed}` : kind.prompt,
      messages: [{ role: 'user', content: JSON.stringify(values) }],
      ...(request && { output: request.output }),
    });

    const answer = readAnswer(select, { output: request && result.output, text: result.text });

    const latest = await current();

    if (!latest) return;

    await write(latest, {
      [input.field]: answer,
      [paths.status]: 'done',
      [paths.error]: null,
    });
  } catch (error) {
    frogbot.logger.error(
      { err: error },
      `[frogbot] aiField "${input.field}" in collection "${input.collection}" failed for record ${input.id}`,
    );

    const latest = await current();

    if (!latest) return;

    await fail(latest, error instanceof Error ? error.message : String(error));
  }
}

function withAutoRun(autoRun: JobsConfig['autoRun']): JobsConfig['autoRun'] {
  const entry: AutorunCronConfig = { allQueues: true, cron: '* * * * *' };

  const append = (entries: AutorunCronConfig[]) =>
    entries.some((candidate) => isDeepStrictEqual(candidate, entry))
      ? entries
      : [...entries, entry];

  if (typeof autoRun === 'function') return async (payload) => append(await autoRun(payload));

  return append(autoRun ?? []);
}

export function resolveAIFieldTask<T extends JobsConfig>({
  collections,
  jobs,
}: {
  collections: CollectionConfig[];
  jobs: T;
}): T {
  const hasAIField = collections.some(({ fields }) =>
    flattenTopLevelFields(fields as never).some((field) => getAIKind(field as Field)),
  );

  if (!hasAIField) return jobs;

  if (jobs.tasks?.some(({ slug }) => slug === AI_FIELD_TASK_SLUG)) {
    throw new Error(`[frogbot] Job task slug '${AI_FIELD_TASK_SLUG}' is reserved for AI fields.`);
  }

  const task: TaskConfig<AIFieldTask> = {
    slug: AI_FIELD_TASK_SLUG,
    interfaceName: 'TaskFrogBotRunAIField',
    ...(jobs.enableConcurrencyControl === true && {
      concurrency: { key: concurrencyKey, supersedes: true },
    }),
    handler: async ({ input, req }) => {
      await runAIField({ input, req });

      return { output: {} };
    },
  };

  return {
    ...jobs,
    tasks: [...(jobs.tasks ?? []), task],
    autoRun: withAutoRun(jobs.autoRun),
  };
}

import type * as PayloadModule from 'payload';
import type { JobsConfig } from 'payload';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentConfig } from '../../../../../packages/frogbot/src/agents/types.js';
import { resolveSmallModel } from '../../../../../packages/frogbot/src/ai/models.js';
import type { AIConfig, ModelId } from '../../../../../packages/frogbot/src/ai/types.js';
import type { CollectionConfig } from '../../../../../packages/frogbot/src/collections/config/types.js';
import type { FrogBotConfig } from '../../../../../packages/frogbot/src/config/types.js';
import { aiField } from '../../../../../packages/frogbot/src/fields/baseFields/ai/index.js';
import { resolveAIFieldModel } from '../../../../../packages/frogbot/src/fields/baseFields/ai/task.js';
import type { Field } from '../../../../../packages/frogbot/src/fields/config/types.js';

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadModule>()),
  buildConfig: vi.fn((config: Record<string, unknown>) =>
    Promise.resolve({ globals: [], ...config }),
  ),
}));

const { sanitize } = await import('../../../../../packages/frogbot/src/config/sanitize.js');

const FAST = 'fast' as ModelId;

const ai: AIConfig = { providers: { openai: true }, defaultModel: 'openai/gpt-5-nano' };

const summary = aiField({ name: 'summary', inputs: ['title'], prompt: 'Summarize.' });

function tasks(fields: Field[], overrides: Partial<CollectionConfig> = {}): CollectionConfig {
  return { slug: 'tasks', fields: [{ name: 'title', type: 'text' }, ...fields], ...overrides };
}

function makeConfig(overrides: Partial<FrogBotConfig> = {}): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: {} as FrogBotConfig['db'],
    ai,
    collections: [tasks([summary])],
    ...overrides,
  };
}

function failure(name: string, problem: string): string {
  return `[frogbot] aiField "${name}" in collection "tasks": ${problem}`;
}

const nested = (name: string) =>
  `[frogbot] aiField "${name}" must be a top-level field of a collection; found in an array, blocks, group or named tab in collection "tasks"`;

describe('sanitizeAIFields models', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a model that is not configured', () => {
    const field = aiField({
      name: 'summary',
      inputs: ['title'],
      prompt: 'S',
      model: 'anthropic/claude-haiku-4-5',
    });

    expect(() => sanitize(makeConfig({ collections: [tasks([field])] }))).toThrow(
      failure('summary', "model 'anthropic/claude-haiku-4-5' is not configured"),
    );
  });

  it('rejects a model that is not a chat model', () => {
    const field = aiField({
      name: 'summary',
      inputs: ['title'],
      prompt: 'S',
      model: 'openai/whisper-1',
    });

    expect(() => sanitize(makeConfig({ collections: [tasks([field])] }))).toThrow(
      failure('summary', "model 'openai/whisper-1' is not a chat model"),
    );
  });

  it('warns about a non-chat model during codegen', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const field = aiField({
      name: 'summary',
      inputs: ['title'],
      prompt: 'S',
      model: 'openai/whisper-1',
    });

    sanitize(makeConfig({ collections: [tasks([field])] }), { mode: 'codegen' });

    expect(warn).toHaveBeenCalledWith(
      failure('summary', "model 'openai/whisper-1' is not a chat model"),
    );
  });

  it('rejects a field with no model and no ai config', () => {
    expect(() => sanitize(makeConfig({ ai: undefined }))).toThrow(
      failure(
        'summary',
        'no model. Set `model` on the field, or `ai.smallModel` or `ai.defaultModel`',
      ),
    );
  });

  it('rejects a field with no model when ai sets neither smallModel nor defaultModel', () => {
    expect(() => sanitize(makeConfig({ ai: { providers: { openai: true } } }))).toThrow(
      failure(
        'summary',
        'no model. Set `model` on the field, or `ai.smallModel` or `ai.defaultModel`',
      ),
    );
  });

  it('rejects a field with no model during codegen too', () => {
    expect(() => sanitize(makeConfig({ ai: undefined }), { mode: 'codegen' })).toThrow(
      failure(
        'summary',
        'no model. Set `model` on the field, or `ai.smallModel` or `ai.defaultModel`',
      ),
    );
  });

  it('accepts a router name as the model', () => {
    const field = aiField({ name: 'summary', inputs: ['title'], prompt: 'S', model: FAST });

    const config = makeConfig({
      ai: { providers: { openai: true }, routers: { fast: { model: 'openai/gpt-5-nano' } } },
      collections: [tasks([field])],
    });

    expect(() => sanitize(config)).not.toThrow();
  });

  it('accepts only ai.smallModel', () => {
    const config = makeConfig({
      ai: { providers: { openai: true }, smallModel: 'openai/gpt-5-nano' },
    });

    expect(() => sanitize(config)).not.toThrow();
  });

  it('accepts only ai.defaultModel', () => {
    expect(() => sanitize(makeConfig())).not.toThrow();
  });

  it('leaves configs without an AI field unchanged when ai is absent', () => {
    expect(() => sanitize(makeConfig({ ai: undefined, collections: [tasks([])] }))).not.toThrow();
  });
});

describe('sanitizeAIFields inputs', () => {
  it('rejects an input that is not a top-level field', () => {
    const field = aiField({ name: 'summary', inputs: ['title', 'missing'], prompt: 'S' });

    expect(() => sanitize(makeConfig({ collections: [tasks([field])] }))).toThrow(
      failure('summary', 'input "missing" is not a top-level field of the collection'),
    );
  });

  it('rejects an input inside a named group', () => {
    const field = aiField({ name: 'summary', inputs: ['street'], prompt: 'S' });
    const address: Field = {
      name: 'address',
      type: 'group',
      fields: [{ name: 'street', type: 'text' }],
    };

    expect(() => sanitize(makeConfig({ collections: [tasks([address, field])] }))).toThrow(
      failure('summary', 'input "street" is not a top-level field of the collection'),
    );
  });

  it('rejects a field that lists itself as an input', () => {
    const field = aiField({ name: 'summary', inputs: ['title', 'summary'], prompt: 'S' });

    expect(() => sanitize(makeConfig({ collections: [tasks([field])] }))).toThrow(
      failure('summary', 'it lists itself as an input'),
    );
  });

  it('rejects AI fields that form a cycle', () => {
    const a = aiField({ name: 'summary', inputs: ['category'], prompt: 'S' });
    const b = aiField({ name: 'category', inputs: ['summary'], prompt: 'C' });

    expect(() => sanitize(makeConfig({ collections: [tasks([a, b])] }))).toThrow(
      failure('summary', 'AI fields form a cycle: summary → category → summary'),
    );
  });

  it('accepts a chain of AI fields', () => {
    const a = aiField({ name: 'summary', inputs: ['title'], prompt: 'S' });
    const b = aiField({ name: 'category', inputs: ['summary'], prompt: 'C' });

    expect(() => sanitize(makeConfig({ collections: [tasks([a, b])] }))).not.toThrow();
  });

  it.each([
    ['a row', { type: 'row', fields: [{ name: 'notes', type: 'text' }] }],
    [
      'a collapsible',
      { type: 'collapsible', label: 'More', fields: [{ name: 'notes', type: 'text' }] },
    ],
    [
      'an unnamed tab',
      { type: 'tabs', tabs: [{ label: 'More', fields: [{ name: 'notes', type: 'text' }] }] },
    ],
  ])('accepts an input inside %s', (_name, layout) => {
    const field = aiField({ name: 'summary', inputs: ['notes'], prompt: 'S' });

    expect(() =>
      sanitize(makeConfig({ collections: [tasks([layout as Field, field])] })),
    ).not.toThrow();
  });
});

describe('sanitizeAIFields names', () => {
  it.each(['_summary_status', '_summary_error'])('rejects a field already named %s', (name) => {
    const taken: Field = { name, type: 'text' };

    expect(() => sanitize(makeConfig({ collections: [tasks([taken, summary])] }))).toThrow(
      failure('summary', `"${name}" is already used by another field`),
    );
  });

  it('accepts a field named status in a collection with drafts', () => {
    const field = aiField({ name: 'status', inputs: ['title'], prompt: 'S' });
    const collection = tasks([field], { versions: { drafts: true } });

    expect(() => sanitize(makeConfig({ collections: [collection] }))).not.toThrow();
  });
});

describe('sanitizeAIFields placement', () => {
  it.each([
    ['an array', { name: 'items', type: 'array', fields: [summary] }],
    ['blocks', { name: 'layout', type: 'blocks', blocks: [{ slug: 'hero', fields: [summary] }] }],
    ['a named group', { name: 'meta', type: 'group', fields: [summary] }],
    ['a named tab', { type: 'tabs', tabs: [{ name: 'meta', fields: [summary] }] }],
    [
      'a row inside an array',
      { name: 'items', type: 'array', fields: [{ type: 'row', fields: [summary] }] },
    ],
  ])('rejects an AI field inside %s', (_name, container) => {
    expect(() => sanitize(makeConfig({ collections: [tasks([container as Field])] }))).toThrow(
      nested('summary'),
    );
  });

  it('rejects an AI field inside a config block', () => {
    const config = makeConfig({
      blocks: [{ slug: 'hero', fields: [summary] }],
      collections: [tasks([])],
    });

    expect(() => sanitize(config)).toThrow(
      '[frogbot] aiField "summary" must be a top-level field of a collection; found in block "hero"',
    );
  });

  it.each([
    ['a row', { type: 'row', fields: [summary] }],
    ['an unnamed tab', { type: 'tabs', tabs: [{ label: 'AI', fields: [summary] }] }],
  ])('accepts an AI field inside %s', (_name, layout) => {
    expect(() => sanitize(makeConfig({ collections: [tasks([layout as Field])] }))).not.toThrow();
  });
});

describe('resolveAIFieldModel', () => {
  const both: AIConfig = {
    providers: { openai: true },
    defaultModel: 'openai/gpt-5',
    smallModel: 'openai/gpt-5-mini',
  };

  it('returns the field model first', () => {
    expect(resolveAIFieldModel(both, { model: 'openai/gpt-5-nano' })).toBe('openai/gpt-5-nano');
  });

  it('returns ai.smallModel when the field has no model', () => {
    expect(resolveAIFieldModel(both, {})).toBe('openai/gpt-5-mini');
  });

  it('returns the small model picked from ai.defaultModel', () => {
    const only: AIConfig = { providers: { openai: true }, defaultModel: 'openai/gpt-5' };

    expect(resolveAIFieldModel(only, {})).toBe(resolveSmallModel(only, 'openai/gpt-5'));
  });

  it('returns undefined with no model anywhere', () => {
    expect(resolveAIFieldModel(undefined, {})).toBeUndefined();
    expect(resolveAIFieldModel({ providers: { openai: true } }, {})).toBeUndefined();
  });
});

describe('AI field task', () => {
  const everyMinute = { allQueues: true, cron: '* * * * *' };

  async function jobsOf(config: FrogBotConfig) {
    const payloadConfig = await sanitize(config)._internal.payloadConfig;

    return payloadConfig.jobs;
  }

  function aiTask(jobs: JobsConfig) {
    return jobs.tasks?.find(({ slug }) => slug === 'frogbot-run-ai-field');
  }

  it('registers the task and the every-minute autoRun with an AI field', async () => {
    const jobs = await jobsOf(makeConfig());

    expect(aiTask(jobs)).toMatchObject({ interfaceName: 'TaskFrogBotRunAIField' });
    expect(jobs.autoRun).toEqual([everyMinute]);
  });

  it('registers no task and no autoRun without an AI field', async () => {
    const jobs = await jobsOf(makeConfig({ collections: [tasks([])] }));

    expect(aiTask(jobs)).toBeUndefined();
    expect(jobs.autoRun).toBeUndefined();
  });

  it('does not repeat the autoRun entry a schedule already added', async () => {
    const scheduled: AgentConfig = {
      slug: 'support',
      model: 'openai/gpt-5-nano',
      instructions: 'Help the user',
      triggers: [
        {
          type: 'schedule',
          slug: 'run',
          schedule: { every: '1h' },
          prompt: 'Run',
        },
      ],
    };

    const jobs = await jobsOf(makeConfig({ agents: [scheduled] }));

    expect(jobs.autoRun).toEqual([everyMinute]);
  });

  it('keeps an app autoRun function and adds the entry once', async () => {
    const jobs = await jobsOf(
      makeConfig({ jobs: { autoRun: () => Promise.resolve([everyMinute]) } }),
    );

    const autoRun = jobs.autoRun as (payload: never) => Promise<unknown[]>;

    expect(await autoRun({} as never)).toEqual([everyMinute]);
  });

  it('reserves the task slug', () => {
    const config = makeConfig({
      jobs: { tasks: [{ slug: 'frogbot-run-ai-field', handler: () => ({ output: {} }) }] },
    });

    expect(() => sanitize(config)).toThrow(
      "[frogbot] Job task slug 'frogbot-run-ai-field' is reserved for AI fields.",
    );
  });

  it('leaves the task slug to the app without an AI field', async () => {
    const config = makeConfig({
      collections: [tasks([])],
      jobs: { tasks: [{ slug: 'frogbot-run-ai-field', handler: () => ({ output: {} }) }] },
    });

    expect(aiTask(await jobsOf(config))).toBeDefined();
  });

  it('keys runs by record, field and locale when concurrency control is on', async () => {
    const jobs = await jobsOf(makeConfig());
    const concurrency = aiTask(jobs)?.concurrency as {
      key: (args: { input: unknown; queue: string }) => string;
      supersedes: boolean;
    };

    const key = (input: Record<string, unknown>) => concurrency.key({ input, queue: 'default' });

    expect(jobs.enableConcurrencyControl).toBe(true);
    expect(concurrency.supersedes).toBe(true);
    expect(key({ collection: 'tasks', id: 42, field: 'summary' })).toBe('tasks:42:summary');

    expect(key({ collection: 'articles', id: 7, field: 'summary', locale: 'fr' })).toBe(
      'articles:7:summary:fr',
    );
  });

  it('sets no concurrency when the app turns concurrency control off', async () => {
    const jobs = await jobsOf(makeConfig({ jobs: { enableConcurrencyControl: false } }));

    expect(jobs.enableConcurrencyControl).toBe(false);
    expect(aiTask(jobs)).toBeDefined();
    expect(aiTask(jobs)).not.toHaveProperty('concurrency');
  });
});

describe('AI select fields', () => {
  it('get option colours inside their row and keep the AI marker', async () => {
    const type = aiField({
      name: 'type',
      inputs: ['title'],
      prompt: 'Classify.',
      options: [{ label: 'Bug', value: 'bug', color: 'red' }, 'question'],
    });

    const payloadConfig = await sanitize(makeConfig({ collections: [tasks([type])] }))._internal
      .payloadConfig;

    const [, row] = payloadConfig.collections[0].fields as Array<{ fields?: Field[] }>;
    const value = row.fields?.[0] as Field & { admin?: { custom?: unknown } };

    expect(value.admin?.custom).toEqual({
      frogbot: {
        kind: { type: 'ai', inputs: ['title'], prompt: 'Classify.' },
        optionColors: { bug: 'red' },
      },
    });
  });
});

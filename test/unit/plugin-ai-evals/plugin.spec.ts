import type { CollectionAccess, FrogBotConfig, FrogBotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import {
  aiEvalsPlugin,
  checks,
  defineScorer,
  judge,
} from '../../../packages/plugins/plugin-ai-evals/src/index.js';
import type { AIEvalsPluginOptions } from '../../../packages/plugins/plugin-ai-evals/src/options.js';
import { runScorer } from '../../../packages/plugins/plugin-ai-evals/src/scorers.js';

function baseConfig(overrides: Partial<FrogBotConfig> = {}): FrogBotConfig {
  return {
    secret: 'test',
    db: {} as FrogBotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }],
    agents: [
      { slug: 'support', instructions: 'Help' },
      { slug: 'billing', instructions: 'Bill' },
    ],
    ai: { providers: {} },
    ...overrides,
  };
}

async function apply(options: AIEvalsPluginOptions, config = baseConfig()) {
  return aiEvalsPlugin(options)(config);
}

const usedLookup = checks.calledTool('findInvoices');

describe('aiEvalsPlugin options', () => {
  it.each([
    ['empty scorers', { scorers: {} }, 'scorers needs at least one scorer'],
    [
      'a plain function as a scorer',
      { scorers: { bad: (() => ({ score: 1 })) as never } },
      "Scorer 'bad' must come from defineScorer(), judge() or checks.",
    ],
    ['concurrency 0', { scorers: { usedLookup }, concurrency: 0 }, 'positive integer'],
    ['concurrency 1.5', { scorers: { usedLookup }, concurrency: 1.5 }, 'positive integer'],
  ] as const)('throws at creation on %s', (_, options, message) => {
    expect(() => aiEvalsPlugin(options as AIEvalsPluginOptions)).toThrow(message);
  });

  it('throws without config.ai', async () => {
    await expect(apply({ scorers: { usedLookup } }, baseConfig({ ai: undefined }))).rejects.toThrow(
      '[plugin-ai-evals] AI configuration is required.',
    );
  });

  it('throws for a judge with no model when ai.smallModel is unset', async () => {
    await expect(apply({ scorers: { grounded: judge({ rubric: 'Grounded' }) } })).rejects.toThrow(
      'judge() without a model needs ai.smallModel.',
    );
  });

  it('accepts a judge with no model when ai.smallModel is set, or with its own model', async () => {
    await expect(
      apply(
        { scorers: { grounded: judge({ rubric: 'Grounded' }) } },
        baseConfig({ ai: { providers: {}, smallModel: 'openai/gpt-4o-mini' } }),
      ),
    ).resolves.toBeDefined();
    await expect(
      apply({ scorers: { grounded: judge({ rubric: 'Grounded', model: 'openai/gpt-4o' }) } }),
    ).resolves.toBeDefined();
  });
});

describe('aiEvalsPlugin config', () => {
  it('adds the four collections with the given access and selects from agents and scorers', async () => {
    const access: CollectionAccess = { read: () => true };
    const config = await apply({
      scorers: { usedLookup, custom: defineScorer({ score: () => ({ score: 1 }) }) },
      access,
    });

    const added = config.collections.slice(1);

    expect(added.map(({ slug }) => slug)).toEqual([
      'eval-datasets',
      'eval-cases',
      'eval-runs',
      'eval-results',
    ]);
    expect(added.every((collection) => collection.access === access)).toBe(true);

    const fields = Object.fromEntries(
      added[0].fields.map((field) => ['name' in field ? field.name : '', field]),
    );

    expect(fields.agent).toMatchObject({ type: 'select', options: ['support', 'billing'] });
    expect(fields.scorers).toMatchObject({
      type: 'select',
      hasMany: true,
      options: ['usedLookup', 'custom'],
    });
  });

  it('sets no access by default', async () => {
    const config = await apply({ scorers: { usedLookup } });

    expect(config.collections.slice(1).every(({ access }) => access === undefined)).toBe(true);
  });

  it('adds the run workflow and the evals:run command', async () => {
    const config = await apply({ scorers: { usedLookup } });

    expect(config.jobs?.workflows?.map(({ slug }) => slug)).toEqual(['frogbot-eval-run']);
    expect(typeof config.cli?.commands?.['evals:run']).toBe('function');
  });
});

describe('judge', () => {
  function judgeReq(output: unknown, smallModel?: string) {
    const generateText = vi.fn(() => Promise.resolve({ output }));
    const req = {
      frogbot: { generateText, config: { ai: { smallModel } } },
    } as unknown as FrogBotRequest;

    return { req, generateText };
  }

  const toolCalls = [{ toolName: 'findInvoices', input: { customer: 7 }, output: [{ total: 42 }] }];

  it('sends the rubric, case, answer and tool calls in one call with output, req and overrideAccess', async () => {
    const { req, generateText } = judgeReq({ score: 0.8, reason: 'Mostly grounded.' });

    const outcome = await runScorer(
      judge({ rubric: 'Score 1 if every claim is backed.', model: 'test/judge' as never }),
      {
        input: 'What do I owe?',
        expected: '$42',
        output: 'You owe $42.',
        toolCalls,
        req,
        overrideAccess: true,
      },
    );

    expect(outcome).toEqual({ score: 0.8, reason: 'Mostly grounded.' });
    expect(generateText).toHaveBeenCalledOnce();

    const [call] = generateText.mock.calls[0] as unknown as [Record<string, unknown>];

    expect(call).toMatchObject({ model: 'test/judge', req, overrideAccess: true });
    expect(call.output).toBeDefined();

    for (const part of [
      'Score 1 if every claim is backed.',
      'What do I owe?',
      '$42',
      'You owe $42.',
      'findInvoices',
      '"total": 42',
    ]) {
      expect(call.prompt).toContain(part);
    }
  });

  it('uses ai.smallModel without a model of its own', async () => {
    const { req, generateText } = judgeReq({ score: 1, reason: 'Fine.' }, 'test/small');

    await runScorer(judge({ rubric: 'Polite' }), {
      input: 'Hi',
      output: 'Hello!',
      toolCalls: [],
      req,
      overrideAccess: false,
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'test/small', overrideAccess: false }),
    );
  });

  it('turns a failed model call into a scorer error', async () => {
    const req = {
      frogbot: {
        generateText: () => Promise.reject(new Error('AI access denied')),
        config: { ai: {} },
      },
    } as unknown as FrogBotRequest;

    expect(
      await runScorer(judge({ rubric: 'Polite', model: 'test/judge' as never }), {
        input: 'Hi',
        output: 'Hello!',
        toolCalls: [],
        req,
        overrideAccess: false,
      }),
    ).toEqual({ score: null, error: 'AI access denied' });
  });
});

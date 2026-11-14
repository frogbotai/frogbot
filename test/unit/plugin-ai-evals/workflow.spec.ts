import { describe, expect, it } from 'vitest';

import { parseEvalsRunArgs } from '../../../packages/plugins/plugin-ai-evals/src/cli.js';
import { toToolCalls } from '../../../packages/plugins/plugin-ai-evals/src/runCase.js';
import { summarize } from '../../../packages/plugins/plugin-ai-evals/src/workflow.js';

describe('summarize', () => {
  it('counts passes and errors and averages each scorer, a null or missing score as 0', () => {
    expect(
      summarize(
        [
          { result: 1, errored: false, scores: { a: 1, b: 1 } },
          { result: 2, errored: false, scores: { a: 0.5, b: null } },
          { result: 3, errored: true, scores: {} },
        ],
        ['a', 'b'],
      ),
    ).toEqual({
      total: 3,
      passed: 1,
      errored: 1,
      scorerMeans: { a: 0.5, b: 1 / 3 },
      score: (0.5 + 1 / 3) / 2,
    });
  });

  it('gives no score to an empty dataset', () => {
    expect(summarize([], ['a'])).toEqual({
      total: 0,
      passed: 0,
      errored: 0,
      scorerMeans: { a: 0 },
      score: null,
    });
  });
});

describe('toToolCalls', () => {
  it('pairs each call with its result or error, in step order', () => {
    expect(
      toToolCalls([
        {
          content: [
            { type: 'text', text: 'Looking' },
            { type: 'tool-call', toolCallId: '1', toolName: 'find', input: { q: 'a' } },
            { type: 'tool-call', toolCallId: '2', toolName: 'email', input: {} },
            { type: 'tool-result', toolCallId: '1', toolName: 'find', output: [1] },
            { type: 'tool-error', toolCallId: '2', toolName: 'email', error: new Error('down') },
          ],
        },
        { content: [{ type: 'tool-call', toolCallId: '3', toolName: 'find', input: { q: 'b' } }] },
      ]),
    ).toEqual([
      { toolName: 'find', input: { q: 'a' }, output: [1] },
      { toolName: 'email', input: {}, error: 'down' },
      { toolName: 'find', input: { q: 'b' } },
    ]);
  });
});

describe('parseEvalsRunArgs', () => {
  it('reads the dataset and both flag forms', () => {
    expect(parseEvalsRunArgs(['billing', '--model', 'openai/gpt-4o', '--min-score=0.8'])).toEqual({
      dataset: 'billing',
      model: 'openai/gpt-4o',
      minScore: 0.8,
    });
  });

  it.each([
    [[], 'Usage'],
    [['a', 'b'], 'Usage'],
    [['a', '--limit', '3'], 'Unknown flag --limit'],
    [['a', '--model'], '--model needs a value'],
    [['a', '--min-score', '2'], '--min-score must be a number from 0 to 1'],
    [['a', '--min-score', 'high'], '--min-score must be a number from 0 to 1'],
  ])('refuses %j', (args, message) => {
    expect(() => parseEvalsRunArgs(args)).toThrow(message);
  });
});

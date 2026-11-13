import type { FrogBotRequest } from 'frogbot';
import { describe, expect, it } from 'vitest';

import { checks } from '../../../packages/plugins/plugin-ai-evals/src/checks.js';
import type {
  EvalToolCall,
  Scorer,
  ScorerArgs,
} from '../../../packages/plugins/plugin-ai-evals/src/scorers.js';
import { defineScorer, runScorer } from '../../../packages/plugins/plugin-ai-evals/src/scorers.js';

function args(overrides: Partial<ScorerArgs> = {}): ScorerArgs {
  return {
    input: 'What do I owe?',
    output: 'You owe $42.',
    toolCalls: [],
    req: {} as FrogBotRequest,
    overrideAccess: false,
    ...overrides,
  };
}

const calls = (...names: string[]): EvalToolCall[] =>
  names.map((toolName) => ({ toolName, input: {} }));

async function score(scorer: Scorer, overrides: Partial<ScorerArgs> = {}) {
  return (await runScorer(scorer, args(overrides))).score;
}

describe('checks', () => {
  it.each([
    ['equals the expected answer', checks.equals(), { expected: ' You owe $42. ' }, 1],
    ['differs from the expected answer', checks.equals(), { expected: 'Nothing.' }, 0],
    ['equals given text', checks.equals('You owe $42.'), {}, 1],
    ['differs from given text', checks.equals('$41'), {}, 0],
    ['includes text', checks.includes('$42'), {}, 1],
    ['lacks text', checks.includes('$43'), {}, 0],
    ['includes every string', checks.includes(['owe', '$42']), {}, 1],
    ['lacks one string', checks.includes(['owe', 'refund']), {}, 0],
    ['matches a pattern', checks.matches(/\$\d+/g), {}, 1],
    ['misses a pattern', checks.matches(/€\d+/), {}, 0],
    ['called a tool', checks.calledTool('find'), { toolCalls: calls('find') }, 1],
    ['never called a tool', checks.calledTool('find'), { toolCalls: calls('email') }, 0],
    ['did not call a tool', checks.didNotCall('email'), { toolCalls: calls('find') }, 1],
    ['did call a tool', checks.didNotCall('email'), { toolCalls: calls('email') }, 0],
    ['called tools in order', checks.toolOrder(['a', 'c']), { toolCalls: calls('a', 'b', 'c') }, 1],
    ['called tools out of order', checks.toolOrder(['c', 'a']), { toolCalls: calls('a', 'c') }, 0],
    ['made few tool calls', checks.maxToolCalls(2), { toolCalls: calls('a', 'b') }, 1],
    ['made too many tool calls', checks.maxToolCalls(1), { toolCalls: calls('a', 'b') }, 0],
    ['had no tool errors', checks.noToolErrors(), { toolCalls: calls('a') }, 1],
    [
      'had a tool error',
      checks.noToolErrors(),
      { toolCalls: [{ toolName: 'a', input: {}, error: 'boom' }] },
      0,
    ],
    [
      'called every expected tool',
      checks.expectedTools(),
      { expectedTools: ['a', 'b'], toolCalls: calls('b', 'a') },
      1,
    ],
    [
      'missed an expected tool',
      checks.expectedTools(),
      { expectedTools: ['a', 'b'], toolCalls: calls('a') },
      0,
    ],
  ] as const)('scores a case that %s', async (_, scorer, overrides, expected) => {
    expect(await score(scorer, overrides as Partial<ScorerArgs>)).toBe(expected);
  });

  it('gives a reason when a check fails', async () => {
    expect(await runScorer(checks.calledTool('find'), args())).toEqual({
      score: 0,
      reason: 'Never called find.',
    });
  });

  it('errors equals() and expectedTools() on a case without what they compare to', async () => {
    expect(await runScorer(checks.equals(), args())).toEqual({
      score: null,
      error: 'equals() needs `expected` on the case.',
    });
    expect(await runScorer(checks.expectedTools(), args())).toEqual({
      score: null,
      error: 'expectedTools() needs `expectedTools` on the case.',
    });
  });
});

describe('runScorer', () => {
  it('keeps a score from 0 to 1 and its reason, sync or async', async () => {
    expect(
      await runScorer(defineScorer({ score: () => ({ score: 0.5, reason: 'half' }) }), args()),
    ).toEqual({ score: 0.5, reason: 'half' });
    expect(
      await runScorer(defineScorer({ score: () => Promise.resolve({ score: 1 }) }), args()),
    ).toEqual({
      score: 1,
    });
  });

  it.each([Number.NaN, -0.1, 1.1, Infinity])('turns a score of %s into an error', async (bad) => {
    expect(await runScorer(defineScorer({ score: () => ({ score: bad }) }), args())).toEqual({
      score: null,
      error: `Scorer returned ${String(bad)}, not a number from 0 to 1.`,
    });
  });

  it('turns a throwing scorer into an error', async () => {
    const throwing = defineScorer({
      score: () => {
        throw new Error('no network');
      },
    });

    expect(await runScorer(throwing, args())).toEqual({ score: null, error: 'no network' });
  });

  it('passes the case to the scorer', async () => {
    let seen: ScorerArgs | undefined;
    const spy = defineScorer({
      score: (received) => {
        seen = received;

        return { score: 1 };
      },
    });

    const given = args({ expected: 'x', expectedTools: ['a'], metadata: { tag: 1 } });

    await runScorer(spy, given);

    expect(seen).toBe(given);
  });
});

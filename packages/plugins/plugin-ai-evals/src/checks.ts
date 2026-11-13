import type { Scorer, ScoreResult } from './scorers.js';
import { defineScorer } from './scorers.js';

function pass(ok: boolean, reason: string): ScoreResult {
  return ok ? { score: 1 } : { score: 0, reason };
}

function names(calls: readonly { toolName: string }[]): string[] {
  return calls.map(({ toolName }) => toolName);
}

/** Plain checks that score 0 or 1. */
export const checks = {
  /** The answer, trimmed, equals `text`, or the case's `expected` when `text` is unset. */
  equals: (text?: string): Scorer =>
    defineScorer({
      score: ({ output, expected }) => {
        const want = text ?? expected;

        if (want === undefined) throw new Error('equals() needs `expected` on the case.');

        return pass(output.trim() === want.trim(), `Expected "${want.trim()}".`);
      },
    }),

  /** The answer contains `text`, or every string in it. */
  includes: (text: string | readonly string[]): Scorer =>
    defineScorer({
      score: ({ output }) => {
        const missing = (typeof text === 'string' ? [text] : text).filter(
          (part) => !output.includes(part),
        );

        return pass(missing.length === 0, `Missing "${missing.join('", "')}".`);
      },
    }),

  /** The answer matches `pattern`. */
  matches: (pattern: RegExp): Scorer =>
    defineScorer({
      score: ({ output }) => {
        pattern.lastIndex = 0;

        return pass(pattern.test(output), `Doesn't match ${String(pattern)}.`);
      },
    }),

  /** The agent called `tool` at least once. */
  calledTool: (tool: string): Scorer =>
    defineScorer({
      score: ({ toolCalls }) => pass(names(toolCalls).includes(tool), `Never called ${tool}.`),
    }),

  /** The agent never called `tool`. */
  didNotCall: (tool: string): Scorer =>
    defineScorer({
      score: ({ toolCalls }) => pass(!names(toolCalls).includes(tool), `Called ${tool}.`),
    }),

  /** The agent called `tools` in this order; other calls may come between them. */
  toolOrder: (tools: readonly string[]): Scorer =>
    defineScorer({
      score: ({ toolCalls }) => {
        let next = 0;

        for (const name of names(toolCalls)) {
          if (name === tools[next]) next++;
        }

        return pass(
          next === tools.length,
          `Called ${names(toolCalls).join(', ') || 'no tools'}, not ${tools.join(' then ')}.`,
        );
      },
    }),

  /** The agent made at most `max` tool calls. */
  maxToolCalls: (max: number): Scorer =>
    defineScorer({
      score: ({ toolCalls }) =>
        pass(toolCalls.length <= max, `Made ${toolCalls.length} tool calls, more than ${max}.`),
    }),

  /** No tool call failed. */
  noToolErrors: (): Scorer =>
    defineScorer({
      score: ({ toolCalls }) => {
        const failed = toolCalls.filter((call) => call.error !== undefined);

        return pass(failed.length === 0, `${names(failed).join(', ')} failed.`);
      },
    }),

  /** The agent called every tool in the case's `expectedTools`. */
  expectedTools: (): Scorer =>
    defineScorer({
      score: ({ toolCalls, expectedTools }) => {
        if (!expectedTools?.length) {
          throw new Error('expectedTools() needs `expectedTools` on the case.');
        }

        const called = names(toolCalls);
        const missing = expectedTools.filter((tool) => !called.includes(tool));

        return pass(missing.length === 0, `Never called ${missing.join(', ')}.`);
      },
    }),
};

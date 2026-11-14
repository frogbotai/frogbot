import type { ModelId } from 'frogbot';
import { Output } from 'frogbot';
import { z } from 'zod';

import type { Scorer, ScorerArgs } from './scorers.js';
import { defineScorer } from './scorers.js';

const verdict = z.object({
  score: z.number().min(0).max(1),
  reason: z.string(),
});

const instructions = [
  "You grade an AI agent's answer against a rubric.",
  'Give a score from 0 (fails the rubric) to 1 (fully meets it) and a one-sentence reason.',
].join(' ');

export function judgePrompt({
  rubric,
  input,
  expected,
  output,
  toolCalls,
}: Pick<ScorerArgs, 'input' | 'expected' | 'output' | 'toolCalls'> & { rubric: string }): string {
  return [
    `<rubric>\n${rubric}\n</rubric>`,
    `<question>\n${input}\n</question>`,
    ...(expected === undefined ? [] : [`<expected>\n${expected}\n</expected>`]),
    `<tool-calls>\n${JSON.stringify(toolCalls, null, 2)}\n</tool-calls>`,
    `<answer>\n${output}\n</answer>`,
  ].join('\n\n');
}

/** Scores each case with one model call against `rubric`, on `model` or else `ai.smallModel`. */
export function judge({ rubric, model }: { rubric: string; model?: ModelId }): Scorer {
  const scorer = defineScorer({
    score: async (args) => {
      const { req, overrideAccess } = args;
      const judgeModel = model ?? req.frogbot.config.ai?.smallModel;

      if (judgeModel === undefined) throw new Error('judge() needs a model or ai.smallModel.');

      const { output } = await req.frogbot.generateText({
        model: judgeModel,
        instructions,
        prompt: judgePrompt({ rubric, ...args }),
        output: Output.object({ schema: verdict }),
        req,
        overrideAccess,
      });

      return output;
    },
  });

  return model === undefined ? { ...scorer, usesSmallModel: true } : scorer;
}

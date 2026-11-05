import type { FrogBotRequest } from 'frogbot';

const scorerTag = Symbol.for('@frogbotai/plugin-evals/scorer');

/** One tool call an agent made in a case, in step order. */
export type EvalToolCall = {
  toolName: string;
  input: unknown;
  output?: unknown;
  error?: unknown;
};

export type ScorerArgs = {
  input: string;
  expected?: string;
  expectedTools?: string[];
  output: string;
  toolCalls: EvalToolCall[];
  metadata?: unknown;
  req: FrogBotRequest;
  /** `false` on a run started by a user, `true` on one with no user. Pass it to Local API and AI calls. */
  overrideAccess: boolean;
};

/** A score from 0 to 1. */
export type ScoreResult = { score: number; reason?: string };

export type ScorerFunction = (args: ScorerArgs) => ScoreResult | Promise<ScoreResult>;

export type Scorer = {
  readonly [scorerTag]: true;
  readonly score: ScorerFunction;
  /** Set by `judge()` without a `model`: it uses `ai.smallModel`. */
  readonly usesSmallModel?: boolean;
};

/** What a scorer gave one case: `score` is `null` when it threw or returned a bad score. */
export type ScorerOutcome = {
  score: number | null;
  reason?: string;
  error?: string;
};

export function defineScorer({ score }: { score: ScorerFunction }): Scorer {
  return { [scorerTag]: true, score };
}

export function isScorer(value: unknown): value is Scorer {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[scorerTag] === true
  );
}

export async function runScorer(scorer: Scorer, args: ScorerArgs): Promise<ScorerOutcome> {
  try {
    const result = await scorer.score(args);
    const score = (result as Partial<ScoreResult> | undefined)?.score;

    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
      return { score: null, error: `Scorer returned ${String(score)}, not a number from 0 to 1.` };
    }

    return { score, ...(result.reason === undefined ? {} : { reason: result.reason }) };
  } catch (error) {
    return { score: null, error: error instanceof Error ? error.message : String(error) };
  }
}

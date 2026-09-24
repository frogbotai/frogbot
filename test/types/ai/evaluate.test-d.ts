import type {
  AIConfig,
  CatalogModelId,
  EvaluateOpts,
  EvaluateResult,
  EvaluationQuestion,
  FrogbotInstance,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const frogbot: FrogbotInstance;

declare module 'frogbot' {
  export interface GeneratedTypes {
    models: CatalogModelId | 'judge';
  }
}

const evaluation = frogbot.evaluate({
  model: 'typesafe-ai/jev',
  state: { transcript: ['The support agent issued a refund.'] },
  questions: {
    refunded: {
      type: 'boolean',
      instructions: 'Was a refund issued?',
      criteria: { true: 'Refunded', false: 'Not refunded' },
    },
    team: {
      type: 'choice',
      instructions: { task: 'Route the ticket' },
      criteria: { support: 'Support team', billing: 'Billing team' },
    },
    severity: {
      type: 'score',
      instructions: 'How severe?',
      criteria: ['Low', 'Medium', 'High'],
    },
  },
  maxRetries: 1,
  providerOptions: { typesafe: { context: 'test' } },
});

type Result = Awaited<typeof evaluation>;

expectTypeOf(evaluation).toMatchTypeOf<Promise<Result>>();

type EnrichSpan = NonNullable<NonNullable<AIConfig['telemetry']>['enrichSpan']>;

expectTypeOf<'experimental_evaluation'>().toMatchTypeOf<Parameters<EnrichSpan>[0]['spanType']>();

expectTypeOf<Result['answers']['refunded']['probability']>().toEqualTypeOf<number>();
expectTypeOf<Result['answers']['team']['choice']>().toEqualTypeOf<'support' | 'billing'>();
expectTypeOf<Result['answers']['severity']['score']>().toEqualTypeOf<number>();
expectTypeOf<Result['answers']>().not.toHaveProperty('missing');
expectTypeOf<Result['answers']['team']>().not.toHaveProperty('probability');
expectTypeOf<Result['usage']['inputTokens']>().toEqualTypeOf<number | undefined>();
expectTypeOf<Result['response']['timestamp']>().toEqualTypeOf<Date>();
expectTypeOf<Result['response']['modelId']>().toEqualTypeOf<string>();
expectTypeOf<Result['rounding']>().toEqualTypeOf<
  EvaluateResult<{
    refunded: { type: 'boolean'; instructions: string };
  }>['rounding']
>();
expectTypeOf<Result['providerMetadata']>().toEqualTypeOf<
  EvaluateResult<{
    refunded: { type: 'boolean'; instructions: string };
  }>['providerMetadata']
>();

expectTypeOf(
  frogbot.evaluate({
    model: 'judge',
    state: 'A refund was issued.',
    questions: { refunded: { type: 'boolean', instructions: 'Was a refund issued?' } },
  }),
).toEqualTypeOf<
  Promise<
    EvaluateResult<{
      readonly refunded: {
        readonly type: 'boolean';
        readonly instructions: 'Was a refund issued?';
      };
    }>
  >
>();

expectTypeOf<'typesafe-ai/jev'>().toMatchTypeOf<CatalogModelId>();
expectTypeOf<'typesafe-ai/jev-latest'>().toMatchTypeOf<CatalogModelId>();
expectTypeOf<{
  model: 'typesafe-ai/jev';
  state: 'Transcript';
  questions: { routed: { type: 'choice'; instructions: string; criteria: { billing: string } } };
}>().toMatchTypeOf<
  EvaluateOpts<{
    routed: { type: 'choice'; instructions: string; criteria: { billing: string } };
  }>
>();

expectTypeOf<'invalid/model'>().not.toMatchTypeOf<
  EvaluateOpts<Record<string, EvaluationQuestion>>['model']
>();
expectTypeOf<{ type: 'choice'; instructions: string }>().not.toMatchTypeOf<EvaluationQuestion>();
expectTypeOf<{ type: 'score'; instructions: string }>().not.toMatchTypeOf<EvaluationQuestion>();
expectTypeOf<{ type: 'unknown'; instructions: string }>().not.toMatchTypeOf<EvaluationQuestion>();
expectTypeOf<{
  type: 'boolean';
  instructions: string;
  criteria: { maybe: string };
}>().not.toMatchTypeOf<EvaluationQuestion>();
expectTypeOf<{
  model: 'typesafe-ai/jev';
  state: 'Transcript';
  questions: Record<string, never>;
}>().not.toMatchTypeOf<EvaluateOpts<{ refunded: { type: 'boolean'; instructions: string } }>>();
expectTypeOf<{
  model: 'typesafe-ai/jev';
  state: true;
  questions: { refunded: { type: 'boolean'; instructions: string } };
}>().not.toMatchTypeOf<EvaluateOpts<{ refunded: { type: 'boolean'; instructions: string } }>>();

import type { Experimental_EvaluationModelV4CallOptions } from '@ai-sdk/provider';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { z } from 'zod';

import { parseWithSchema } from '../../shared/parseWithSchema.js';

const evaluateRequestSchema = z.object({
  model: z.string().min(1, 'model must be a non-empty string'),
  state: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
  questions: z
    .record(z.string(), z.unknown())
    .refine(
      (questions) => Object.keys(questions).length > 0,
      'questions must contain at least one question',
    ),
  providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});

export type EvaluateRequest = {
  model: string;
  state: Experimental_EvaluationModelV4CallOptions['state'];
  questions: Experimental_EvaluationModelV4CallOptions['questions'];
  providerOptions?: ProviderOptions;
};

export function parseEvaluateRequest(input: unknown): EvaluateRequest {
  return parseWithSchema(evaluateRequestSchema, input) as EvaluateRequest;
}

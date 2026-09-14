import type { PieceActionDefinition, PiecePollingTrigger } from 'frogbot/pieces';
import type { z } from 'zod';

import type { AirtableClient } from './client.js';

export function defineAirtableAction<
  const TSlug extends string,
  TInput extends z.ZodType,
  TOutput extends z.ZodType | undefined,
>(definition: PieceActionDefinition<TInput, TOutput, object, AirtableClient> & { slug: TSlug }) {
  return definition;
}

export function defineAirtablePollingTrigger<
  const TSlug extends string,
  TInput extends z.ZodType,
  TOutput extends z.ZodType | undefined,
  const TSample extends (TOutput extends z.ZodType ? z.output<TOutput> : never),
>(
  definition: Omit<
    PiecePollingTrigger<TInput, TOutput, object, AirtableClient, number>,
    'sample' | 'slug'
  > & {
    sample: TSample;
    slug: TSlug;
  },
) {
  return definition;
}

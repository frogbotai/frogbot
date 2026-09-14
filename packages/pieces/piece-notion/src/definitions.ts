import type { PieceActionDefinition, PiecePollingTrigger } from 'frogbot/pieces';
import type { z } from 'zod';

import type { NotionClient } from './client.js';

export function defineNotionAction<
  const TSlug extends string,
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
>(definition: PieceActionDefinition<TInput, TOutput, object, NotionClient> & { slug: TSlug }) {
  return definition;
}

export function defineNotionTrigger<
  const TSlug extends string,
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
>(
  definition: PiecePollingTrigger<TInput, TOutput, object, NotionClient, number> & { slug: TSlug },
) {
  return definition;
}

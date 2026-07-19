import { z } from 'zod';

import { parseWithSchema } from '../../shared/parseWithSchema.js';

const rerankDocumentSchema = z.union([
  z.string(),
  z.record(z.string(), z.unknown()),
]);

const rerankRequestSchema = z.object({
  model: z.string().min(1, 'model must be a non-empty string'),
  query: z.string().min(1, 'query must be a non-empty string'),
  documents: z.array(rerankDocumentSchema)
    .min(1, 'documents must contain at least one document')
    .refine(documents => documents.every(document => typeof document === typeof documents[0]), 'documents must be all strings or all objects'),
  top_n: z.number().int().positive().nullish(),
  return_documents: z.boolean().nullish(),
}).loose();

export type RerankRequest = z.infer<typeof rerankRequestSchema>;

export function parseRerankRequest(input: unknown): RerankRequest {
  return parseWithSchema(rerankRequestSchema, input);
}

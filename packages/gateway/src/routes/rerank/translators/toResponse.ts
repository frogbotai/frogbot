import type { RerankResult } from 'ai';

import type { RerankRequest } from '../schema.js';

type RerankDocument = RerankRequest['documents'][number];

export type OpenAIRerankResponse = {
  id: string;
  results: Array<{
    index: number;
    relevance_score: number;
    document?: RerankDocument | { text: string };
  }>;
  meta: Record<string, unknown>;
};

export function toOpenAIRerankResponse(
  result: RerankResult<RerankDocument>,
  options: { returnDocuments: boolean; requestId: string },
): OpenAIRerankResponse {
  return {
    id: result.response.id ?? options.requestId,
    results: result.ranking.map((item) => ({
      index: item.originalIndex,
      relevance_score: item.score,
      ...(options.returnDocuments && { document: toDocument(item.document) }),
    })),
    meta: getResponseMeta(result),
  };
}

function toDocument(document: RerankDocument): RerankDocument | { text: string } {
  return typeof document === 'string' ? { text: document } : document;
}

function getResponseMeta(result: RerankResult<RerankDocument>): Record<string, unknown> {
  const providerMeta = result.providerMetadata?.cohere?.meta;
  if (isRecord(providerMeta)) return providerMeta;

  const responseMeta = (result.response.body as { meta?: unknown } | undefined)?.meta;
  return isRecord(responseMeta) ? responseMeta : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import type { JSONObject } from '@ai-sdk/provider';
import type { JSONValue } from 'ai';

import type { RerankRequest } from '../schema.js';

export type RerankParams = {
  query: string;
  documents: Array<string | JSONObject>;
  topN?: number;
  providerOptions: Record<string, Record<string, JSONValue>>;
};

export function toRerankParams(body: RerankRequest): RerankParams {
  return {
    query: body.query,
    documents: body.documents as Array<string | JSONObject>,
    ...(body.top_n != null && { topN: body.top_n }),
    providerOptions: {},
  };
}

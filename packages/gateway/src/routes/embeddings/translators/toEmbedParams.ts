import type { JSONValue } from 'ai';

import type { EmbeddingsRequest } from '../schema.js';

export type EmbedParams = {
  values: Array<string | number[]>;
  providerOptions: Record<string, Record<string, JSONValue>>;
};

export function toEmbedParams(body: EmbeddingsRequest): EmbedParams {
  const unknown: Record<string, JSONValue> = {};
  if (body.dimensions != null) {
    unknown.dimensions = body.dimensions;
  }

  if (body.user != null) {
    unknown.user = body.user;
  }

  return {
    values: isBatchInput(body.input) ? body.input : [body.input],
    providerOptions: Object.keys(unknown).length > 0 ? { unknown } : {},
  };
}

function isBatchInput(input: EmbeddingsRequest['input']): input is string[] | number[][] {
  return (
    Array.isArray(input) &&
    (input.length === 0 || typeof input[0] === 'string' || Array.isArray(input[0]))
  );
}

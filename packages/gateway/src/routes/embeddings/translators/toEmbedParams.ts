import type { JSONValue } from 'ai';

import type { EmbeddingsRequest } from '../schema.js';

export type EmbedParams = {
  values: Array<string | number[]>;
  providerOptions: Record<string, Record<string, JSONValue>>;
};

export function toEmbedParams(body: EmbeddingsRequest): EmbedParams {
  // Stage cross-provider knobs in the neutral `unknown` namespace. Each
  // provider's `beforeUpstream` middleware re-homes them into its own namespace
  // (cohere.outputDimension, google.outputDimensionality, etc.). `user` is an
  // OpenAI-only concept, so only the OpenAI hook re-homes it; other providers
  // leave it in `unknown`, where they never read it (silent no-op).
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
  return Array.isArray(input) && (input.length === 0 || typeof input[0] === 'string' || Array.isArray(input[0]));
}

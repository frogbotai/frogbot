// Converts a reasoning part to the OpenAI `reasoning_details` wire format.
//
// Two variants:
//   - `reasoning.encrypted` — when `redactedData` is present (Anthropic redacted thinking)
//   - `reasoning.text` — normal reasoning text with optional signature
//
// Used by both OpenAI and Anthropic response translators for cross-provider parity.

import { extractReasoningMetadata } from './extractReasoningMetadata.js';

export type ReasoningDetailEncrypted = {
  type: 'reasoning.encrypted';
  id: string;
  index: number;
  data: string;
  format: 'unknown';
};

export type ReasoningDetailText = {
  type: 'reasoning.text';
  id: string;
  index: number;
  text: string;
  signature?: string;
  format: 'unknown';
};

export type ReasoningDetail = ReasoningDetailEncrypted | ReasoningDetailText;

export function toReasoningDetail(args: {
  text: string;
  providerMetadata?: Record<string, Record<string, unknown>>;
  id: string;
  index: number;
}): ReasoningDetail {
  const { text, providerMetadata, id, index } = args;
  const { redactedData, signature } = extractReasoningMetadata(providerMetadata);

  if (redactedData) {
    return {
      type: 'reasoning.encrypted',
      id,
      index,
      data: redactedData,
      format: 'unknown',
    };
  }

  return {
    type: 'reasoning.text',
    id,
    index,
    text,
    signature,
    format: 'unknown',
  };
}

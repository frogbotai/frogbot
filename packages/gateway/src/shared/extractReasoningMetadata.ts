// Extracts reasoning metadata (signature / redactedData) from AI SDK provider metadata.
//
// Two branches:
//   1. "encrypted" — `redactedData` present (Anthropic redacted thinking)
//   2. "text+signature" — `signature` present (Anthropic extended thinking / o-series)
//
// Iterates all provider-metadata namespaces (`anthropic`, `unknown`, etc.) so
// it works for both direct Anthropic and Bedrock-via-unknown adapters.

// Iterates all provider-metadata namespaces (`anthropic`, `unknown`, etc.) so
// it works for both direct Anthropic and Bedrock-via-unknown adapters.

export type ReasoningMetadata = {
  redactedData?: string;
  signature?: string;
};

export function extractReasoningMetadata(providerMetadata?: Record<string, Record<string, unknown>>  ): ReasoningMetadata {
  if (!providerMetadata) return {};

  for (const metadata of Object.values(providerMetadata)) {
    if (metadata && typeof metadata === 'object') {
      let redactedData: string | undefined;
      let signature: string | undefined;
      let found = false;

      if ('redactedData' in metadata && typeof metadata.redactedData === 'string') {
        redactedData = metadata.redactedData;
        found = true;
      }
      if ('signature' in metadata && typeof metadata.signature === 'string') {
        signature = metadata.signature;
        found = true;
      }

      if (found) {
        return { redactedData, signature };
      }
    }
  }

  return {};
}

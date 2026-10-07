export type ReasoningMetadata = {
  redactedData?: string;
  signature?: string;
};

export function extractReasoningMetadata(
  providerMetadata?: Record<string, Record<string, unknown>>,
): ReasoningMetadata {
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

import { describe, expect, it } from 'vitest';

import { extractReasoningMetadata } from './extractReasoningMetadata.js';

describe('extractReasoningMetadata', () => {
  it('returns empty object for undefined input', () => {
    expect(extractReasoningMetadata(undefined)).toEqual({});
  });

  it('returns empty object when no relevant fields', () => {
    expect(extractReasoningMetadata({ openai: { logprobs: null } })).toEqual({});
  });

  it('extracts signature from anthropic namespace', () => {
    const result = extractReasoningMetadata({
      anthropic: { signature: 'sig_abc123' },
    });
    expect(result).toEqual({ signature: 'sig_abc123' });
  });

  it('extracts redactedData from anthropic namespace', () => {
    const result = extractReasoningMetadata({
      anthropic: { redactedData: 'encrypted_blob_xyz' },
    });
    expect(result).toEqual({ redactedData: 'encrypted_blob_xyz' });
  });

  it('extracts from unknown namespace (Bedrock adapter)', () => {
    const result = extractReasoningMetadata({
      unknown: { signature: 'sig_bedrock', redactedData: 'blob' },
    });
    expect(result).toEqual({ signature: 'sig_bedrock', redactedData: 'blob' });
  });

  it('returns first namespace with relevant fields', () => {
    const result = extractReasoningMetadata({
      openai: { logprobs: null },
      anthropic: { signature: 'sig_first' },
    });
    expect(result).toEqual({ signature: 'sig_first' });
  });

  it('ignores non-string values for signature/redactedData', () => {
    const result = extractReasoningMetadata({
      anthropic: { signature: 123, redactedData: null },
    } as unknown as Record<string, Record<string, unknown>>);
    expect(result).toEqual({});
  });
});

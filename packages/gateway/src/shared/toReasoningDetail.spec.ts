import { describe, expect, it } from 'vitest';

import { toReasoningDetail } from './toReasoningDetail.js';

describe('toReasoningDetail', () => {
  it('produces text detail when no redactedData present', () => {
    const result = toReasoningDetail({
      text: 'Let me think about this...',
      providerMetadata: { anthropic: { signature: 'sig_abc' } },
      id: 'reason-0',
      index: 0,
    });
    expect(result).toEqual({
      type: 'reasoning.text',
      id: 'reason-0',
      index: 0,
      text: 'Let me think about this...',
      signature: 'sig_abc',
      format: 'unknown',
    });
  });

  it('produces encrypted detail when redactedData present', () => {
    const result = toReasoningDetail({
      text: '',
      providerMetadata: { anthropic: { redactedData: 'encrypted_blob' } },
      id: 'reason-1',
      index: 1,
    });
    expect(result).toEqual({
      type: 'reasoning.encrypted',
      id: 'reason-1',
      index: 1,
      data: 'encrypted_blob',
      format: 'unknown',
    });
  });

  it('produces text detail with no signature when metadata absent', () => {
    const result = toReasoningDetail({
      text: 'thinking...',
      providerMetadata: undefined,
      id: 'reason-2',
      index: 2,
    });
    expect(result).toEqual({
      type: 'reasoning.text',
      id: 'reason-2',
      index: 2,
      text: 'thinking...',
      signature: undefined,
      format: 'unknown',
    });
  });

  it('extracts from unknown namespace (Bedrock)', () => {
    const result = toReasoningDetail({
      text: '',
      providerMetadata: { unknown: { redactedData: 'bedrock_blob' } },
      id: 'reason-3',
      index: 3,
    });
    expect(result).toEqual({
      type: 'reasoning.encrypted',
      id: 'reason-3',
      index: 3,
      data: 'bedrock_blob',
      format: 'unknown',
    });
  });
});

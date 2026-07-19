import { describe, expect, it } from 'vitest';

import { peekRawValue } from './rawPeek.js';

describe('peekRawValue', () => {
  it('returns undefined for non-object input', () => {
    expect(peekRawValue(null)).toBeUndefined();
    expect(peekRawValue(undefined)).toBeUndefined();
    expect(peekRawValue('string')).toBeUndefined();
    expect(peekRawValue(42)).toBeUndefined();
  });

  it('returns undefined when no relevant fields present', () => {
    expect(peekRawValue({ id: 'chatcmpl-1', object: 'chat.completion.chunk' })).toBeUndefined();
  });

  it('extracts system_fingerprint from top level', () => {
    const result = peekRawValue({ system_fingerprint: 'fp_abc123' });
    expect(result).toEqual({ systemFingerprint: 'fp_abc123' });
  });

  it('extracts service_tier from top level', () => {
    const result = peekRawValue({ service_tier: 'scale' });
    expect(result).toEqual({ serviceTier: 'scale' });
  });

  it('extracts delta.refusal from choices[0].delta', () => {
    const result = peekRawValue({
      choices: [{ delta: { refusal: 'I cannot help with that.' } }],
    });
    expect(result).toEqual({ refusal: 'I cannot help with that.' });
  });

  it('ignores empty refusal string', () => {
    const result = peekRawValue({
      choices: [{ delta: { refusal: '' } }],
    });
    expect(result).toBeUndefined();
  });

  it('extracts content_filter_results from top level', () => {
    const cfr = { hate: { filtered: false, severity: 'safe' } };
    const result = peekRawValue({ content_filter_results: cfr });
    expect(result).toEqual({ contentFilterResults: cfr });
  });

  it('extracts content_filter_results from choices[0]', () => {
    const cfr = { violence: { filtered: true, severity: 'high' } };
    const result = peekRawValue({
      choices: [{ content_filter_results: cfr, delta: {} }],
    });
    expect(result).toEqual({ contentFilterResults: cfr });
  });

  it('extracts multiple fields simultaneously', () => {
    const result = peekRawValue({
      system_fingerprint: 'fp_xyz',
      service_tier: 'default',
      choices: [{ delta: { refusal: 'No.' } }],
    });
    expect(result).toEqual({
      systemFingerprint: 'fp_xyz',
      serviceTier: 'default',
      refusal: 'No.',
    });
  });
});

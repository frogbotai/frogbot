import { describe, expect, it } from 'vitest';
import {
  FORWARD_HEADER_ALLOWLIST,
  prepareForwardHeaders,
} from './headers.js';

describe('FORWARD_HEADER_ALLOWLIST', () => {
  it('contains 40+ entries', () => {
    expect(FORWARD_HEADER_ALLOWLIST.length).toBeGreaterThanOrEqual(25);
  });

  it('includes key vendor headers', () => {
    expect(FORWARD_HEADER_ALLOWLIST).toContain('openai-beta');
    expect(FORWARD_HEADER_ALLOWLIST).toContain('anthropic-beta');
    expect(FORWARD_HEADER_ALLOWLIST).toContain('anthropic-version');
    expect(FORWARD_HEADER_ALLOWLIST).toContain('x-amzn-bedrock-*');
    expect(FORWARD_HEADER_ALLOWLIST).toContain('x-ms-client-*');
  });
});

describe('prepareForwardHeaders', () => {
  it('forwards allowlisted headers', () => {
    const incoming = new Headers({
      'anthropic-beta': 'interleaved-thinking-2025-05-14',
      'openai-beta': 'assistants=v2',
      'x-request-id': 'req-abc',
    });

    const result = prepareForwardHeaders(incoming);

    expect(result.get('anthropic-beta')).toBe('interleaved-thinking-2025-05-14');
    expect(result.get('openai-beta')).toBe('assistants=v2');
    expect(result.get('x-request-id')).toBe('req-abc');
  });

  it('strips non-allowlisted headers', () => {
    const incoming = new Headers({
      'authorization': 'Bearer sk-xxx',
      'host': 'api.example.com',
      'x-internal-routing': 'shard-3',
      'cookie': 'session=abc',
      'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15',
    });

    const result = prepareForwardHeaders(incoming);

    expect(result.get('authorization')).toBeNull();
    expect(result.get('host')).toBeNull();
    expect(result.get('x-internal-routing')).toBeNull();
    expect(result.get('cookie')).toBeNull();
    expect(result.get('anthropic-beta')).toBe('max-tokens-3-5-sonnet-2024-07-15');
  });

  it('strips credential/attribution headers (G107)', () => {
    const incoming = new Headers({
      'api-key': 'sk-attacker',
      'openai-organization': 'org-attacker',
      'openai-project': 'proj-attacker',
      'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15',
    });

    const result = prepareForwardHeaders(incoming);

    expect(result.get('api-key')).toBeNull();
    expect(result.get('openai-organization')).toBeNull();
    expect(result.get('openai-project')).toBeNull();
    expect(result.get('anthropic-beta')).toBe('max-tokens-3-5-sonnet-2024-07-15');
  });

  it('matches glob patterns (prefix-*)', () => {
    const incoming = new Headers({
      'x-amzn-bedrock-guardrailidentifier': 'guard-123',
      'x-amzn-bedrock-guardrailversion': '1',
      'x-ms-client-request-id': 'uuid-456',
      'x-goog-request-params': 'project=my-project',
    });

    const result = prepareForwardHeaders(incoming);

    expect(result.get('x-amzn-bedrock-guardrailidentifier')).toBe('guard-123');
    expect(result.get('x-amzn-bedrock-guardrailversion')).toBe('1');
    expect(result.get('x-ms-client-request-id')).toBe('uuid-456');
    expect(result.get('x-goog-request-params')).toBe('project=my-project');
  });

  it('appends gateway user-agent', () => {
    const incoming = new Headers();
    const result = prepareForwardHeaders(incoming);

    expect(result.get('user-agent')).toBe('@frogbotai/gateway/0.0.0');
  });

  it('accepts custom user-agent', () => {
    const incoming = new Headers();
    const result = prepareForwardHeaders(incoming, {
      userAgent: '@frogbotai/gateway/1.2.3',
    });

    expect(result.get('user-agent')).toBe('@frogbotai/gateway/1.2.3');
  });

  it('is case-insensitive', () => {
    const incoming = new Headers({
      'Anthropic-Beta': 'prompt-caching-2024-07-31',
      'OpenAI-Beta': 'assistants=v2',
    });

    const result = prepareForwardHeaders(incoming);

    // Headers API normalizes to lowercase
    expect(result.get('anthropic-beta')).toBe('prompt-caching-2024-07-31');
    expect(result.get('openai-beta')).toBe('assistants=v2');
  });

  it('forwards tracing headers', () => {
    const incoming = new Headers({
      'traceparent': '00-trace-span-01',
      'tracestate': 'vendor=value',
      'x-correlation-id': 'corr-789',
    });

    const result = prepareForwardHeaders(incoming);

    expect(result.get('traceparent')).toBe('00-trace-span-01');
    expect(result.get('tracestate')).toBe('vendor=value');
    expect(result.get('x-correlation-id')).toBe('corr-789');
  });
});

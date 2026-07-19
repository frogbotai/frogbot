import { describe, expect, it } from 'vitest';

import { maybeMaskMessage, redactKeyFragments } from './maskMessage.js';

describe('maybeMaskMessage', () => {
  it('passes through in non-production', () => {
    expect(
      maybeMaskMessage('boom', { status: 500, production: false }),
    ).toBe('boom');
  });

  it('passes through 4xx in production (client-actionable)', () => {
    expect(
      maybeMaskMessage('bad key', { status: 401, production: true }),
    ).toBe('bad key');
  });

  it('masks 5xx in production', () => {
    expect(
      maybeMaskMessage('internal boom', { status: 500, production: true }),
    ).toBe('Internal server error.');
  });

  it('includes request id when provided', () => {
    expect(
      maybeMaskMessage('internal boom', {
        status: 502,
        production: true,
        requestId: 'req_abc',
      }),
    ).toBe('Internal server error (request_id: req_abc).');
  });
});

describe('redactKeyFragments (G34)', () => {
  it('redacts an OpenAI 401 key fragment, keeping the actionable text', () => {
    const message =
      'Incorrect API key provided: sk-proj-abcd1234efgh5678. You can find your API key at https://platform.openai.com/account/api-keys.';
    const redacted = redactKeyFragments(message);
    expect(redacted).not.toContain('sk-proj-abcd1234efgh5678');
    expect(redacted).toContain('Incorrect API key provided: [REDACTED_KEY].');
    expect(redacted).toContain('https://platform.openai.com/account/api-keys');
  });

  it('redacts the masked-fragment shape OpenAI actually emits', () => {
    expect(
      redactKeyFragments('Incorrect API key provided: sk-proj-********abc1.'),
    ).toBe('Incorrect API key provided: [REDACTED_KEY].');
  });

  it('redacts underscore-separated key tokens (Anthropic / generic)', () => {
    expect(redactKeyFragments('invalid x-api-key: sk_ant_abcdef123456')).not.toContain(
      'sk_ant_abcdef123456',
    );
  });

  it('redacts Bearer tokens', () => {
    expect(redactKeyFragments('Authorization failed for Bearer eyJhbGciOi.abc')).toBe(
      'Authorization failed for Bearer [REDACTED]',
    );
  });

  it('leaves ordinary provider messages untouched', () => {
    const messages = [
      'Rate limit reached for gpt-4o-mini on tokens per min. Limit: 200000, Used: 199999.',
      "The model `gpt-5-ultra` does not exist or you do not have access to it.",
      'max_tokens must be greater than 0',
      'Your credit balance is too low to access the Anthropic API.',
    ];
    for (const message of messages) {
      expect(redactKeyFragments(message)).toBe(message);
    }
  });
});

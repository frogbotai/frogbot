import { BudgetExceededError } from '@frogbotai/gateway/errors';
import { APICallError, RetryError } from 'ai';
import { describe, expect, it } from 'vitest';

import { aiErrorMessage } from '../../../../packages/frogbot/src/ai/errorMessage.js';
import type { SanitizedAIConfig } from '../../../../packages/frogbot/src/ai/types.js';

const keyFragment = 'sk-inval*****-key';

const config = {
  providers: { openai: true, anthropic: { apiKey: 'sk-ant-test' }, bedrock: true },
  routers: {},
} as unknown as SanitizedAIConfig;

function providerError(statusCode?: number) {
  return new APICallError({
    message: `Incorrect API key provided: ${keyFragment}.`,
    url: 'https://api.openai.com/v1/responses',
    requestBodyValues: {},
    statusCode,
    responseBody: JSON.stringify({
      error: { message: `Incorrect API key provided: ${keyFragment}.` },
    }),
    isRetryable: statusCode === undefined || statusCode === 429 || statusCode >= 500,
  });
}

describe('aiErrorMessage', () => {
  it.each([
    [401, 'The AI provider rejected the API key. Check OPENAI_API_KEY in .env.'],
    [403, 'The AI provider rejected the API key. Check OPENAI_API_KEY in .env.'],
    [
      429,
      'The AI provider is rate limiting requests or your quota is used up. Try again shortly, or check your plan and billing.',
    ],
    [
      404,
      "The model openai/gpt-4o-mini isn't available from the AI provider. Check the model ID and your provider account.",
    ],
    [500, 'The AI provider is unavailable right now. Try again in a moment.'],
    [503, 'The AI provider is unavailable right now. Try again in a moment.'],
    [400, 'The AI provider returned an error. Check the terminal for details.'],
    [
      undefined,
      "FrogBot couldn't reach the AI provider. Check the network connection and try again.",
    ],
  ])('maps provider status %s to a safe message', (statusCode, message) => {
    const text = aiErrorMessage({
      error: providerError(statusCode),
      model: 'openai/gpt-4o-mini',
      config,
    });

    expect(text).toBe(message);
    expect(text).not.toContain(keyFragment);
  });

  it('names the provider instead of an env var when the key is configured explicitly', () => {
    expect(
      aiErrorMessage({ error: providerError(401), model: 'anthropic/claude-sonnet-4-5', config }),
    ).toBe(
      'The AI provider rejected the API key. Check the API key configured for the anthropic provider.',
    );
  });

  it('names the provider when its credentials are not a single env var', () => {
    expect(
      aiErrorMessage({ error: providerError(403), model: 'bedrock/claude-4-sonnet', config }),
    ).toBe(
      'The AI provider rejected the API key. Check the API key configured for the bedrock provider.',
    );
  });

  it('falls back to a generic key hint without a model', () => {
    expect(aiErrorMessage({ error: providerError(401) })).toBe(
      "The AI provider rejected the API key. Check your AI provider's API key.",
    );
  });

  it('unwraps retry-exhausted provider errors', () => {
    const error = new RetryError({
      message: 'Failed after 3 attempts.',
      reason: 'maxRetriesExceeded',
      errors: [providerError(429), providerError(429)],
    });

    expect(aiErrorMessage({ error })).toBe(
      'The AI provider is rate limiting requests or your quota is used up. Try again shortly, or check your plan and billing.',
    );
  });

  it('passes gateway error messages through', () => {
    expect(aiErrorMessage({ error: new BudgetExceededError() })).toBe(
      'The configured budget has been exhausted.',
    );
  });

  it('ignores errors that did not come from the AI provider', () => {
    expect(aiErrorMessage({ error: new Error(`Database failed ${keyFragment}`) })).toBeUndefined();
  });
});

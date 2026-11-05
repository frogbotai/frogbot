import { createGateway } from '@frogbotai/gateway';
import { BudgetExceededError, CallCredentialError } from '@frogbotai/gateway/errors';
import { APICallError, generateText, RetryError } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { aiErrorMessage } from '../../../../packages/frogbot/src/ai/errorMessage.js';
import type { SanitizedAIConfig } from '../../../../packages/frogbot/src/ai/types.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';

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

  it('says the chat is too long for the model on a context overflow', () => {
    const error = new APICallError({
      message: "This model's maximum context length is 128000 tokens.",
      url: 'https://api.openai.com/v1/responses',
      requestBodyValues: {},
      statusCode: 400,
      isRetryable: false,
    });

    expect(aiErrorMessage({ error, model: 'openai/gpt-4o-mini', config })).toBe(
      'This chat is too long for openai/gpt-4o-mini.',
    );
  });
});

describe('aiErrorMessage on a linked account', () => {
  const MODEL = 'openai/gpt-4o-mini';
  const linkedConfig = {
    ...config,
    linkedProviders: {
      openai: definePiece({
        slug: 'openai',
        label: 'OpenAI',
        auth: z.object({ apiKey: z.string() }),
        client: ({ auth }: { auth: unknown }) => auth,
        provider: {
          name: 'openai',
          billingUrl: 'https://platform.openai.com/settings/organization/billing',
          credential: () => ({}),
        },
        actions: [],
      })(),
    },
  } as SanitizedAIConfig;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function upstreamError({
    status,
    code,
    linked = true,
  }: {
    status: number;
    code?: string;
    linked?: boolean;
  }) {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({ error: { message: 'upstream', type: code, code } }, { status }),
        ),
      ),
    );

    const gateway = createGateway({
      providers: {
        openai: {
          apiKey: 'sk-app',
          credential: () => (linked ? { settings: { apiKey: 'sk-user' } } : undefined),
        },
      },
    });

    try {
      await generateText({ model: gateway.chatModel(MODEL), prompt: 'hi', maxRetries: 0 });
    } catch (error) {
      return error;
    }

    throw new Error('expected the call to fail');
  }

  const message = async (args: Parameters<typeof upstreamError>[0]) =>
    aiErrorMessage({ error: await upstreamError(args), model: MODEL, config: linkedConfig });

  it.each([401, 403])("says the user's own key was rejected on %i", async (status) => {
    await expect(message({ status })).resolves.toBe(
      'OpenAI rejected your API key. Update it in Settings → Linked accounts.',
    );
  });

  it('says the account is out of credit on a 429 insufficient_quota', async () => {
    await expect(message({ status: 429, code: 'insufficient_quota' })).resolves.toBe(
      'Your OpenAI account is out of credit. Check billing at platform.openai.com.',
    );
  });

  it('keeps the app-key messages when the call used the app key', async () => {
    await expect(message({ status: 401, linked: false })).resolves.toBe(
      'The AI provider rejected the API key. Check OPENAI_API_KEY in .env.',
    );
    await expect(message({ status: 429, code: 'insufficient_quota', linked: false })).resolves.toBe(
      'The AI provider is rate limiting requests or your quota is used up. Try again shortly, or check your plan and billing.',
    );
  });

  it("says the user's own key was rejected when the model is a router", async () => {
    const routed = {
      ...linkedConfig,
      routers: { fast: { model: MODEL } },
    } as unknown as SanitizedAIConfig;

    expect(
      aiErrorMessage({
        error: await upstreamError({ status: 401 }),
        model: 'fast',
        config: routed,
      }),
    ).toBe('OpenAI rejected your API key. Update it in Settings → Linked accounts.');
  });

  it('passes the setup and reconnect messages through', () => {
    for (const text of [
      "OpenAI isn't set up. Add your OpenAI key in Settings → Linked accounts.",
      'Reconnect OpenAI in Settings → Linked accounts.',
    ]) {
      expect(aiErrorMessage({ error: new CallCredentialError(text), model: MODEL })).toBe(text);
    }
  });
});

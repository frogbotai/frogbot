import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import type { StubChatModel } from '../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../__helpers/shared/StubChatModel';
import { modelPort, questionAgentSlug, readerAgentSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const keyFragment = 'sk-inval*****-key';

const rejectedKey = {
  status: 401,
  body: {
    error: {
      message: `Incorrect API key provided: ${keyFragment}. You can find your API key at https://platform.openai.com/account/api-keys.`,
      type: 'invalid_request_error',
      code: 'invalid_api_key',
    },
  },
};

const keyMessage =
  'The AI provider rejected the API key. Check the API key configured for the test provider.';

describe('chat turns: provider errors', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'chat-turn-errors');
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterEach(() => {
    model.reset();
  });

  afterAll(async () => {
    await booted.shutdown();
    await model.close();
  });

  it('refuses a signed-out agent call with a 401 Problem that says to sign in', async () => {
    const response = await fetch(`${booted.baseUrl}/api/agents/${readerAgentSlug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'req_signed_out' },
      body: JSON.stringify({ prompt: 'Summarise.' }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(response.headers.get('x-request-id')).toBe('req_signed_out');
    expect(await response.json()).toMatchObject({
      type: 'https://docs.frogbot.ai/errors#auth.unauthenticated',
      code: 'auth.unauthenticated',
      status: 401,
      detail: `Agent '${readerAgentSlug}' needs a signed-in user.`,
      hint: expect.stringContaining('Sign in'),
      retryable: false,
      requestId: 'req_signed_out',
    });
    expect(model.requests).toEqual([]);
  });

  function post(accept: string) {
    return fetch(`${booted.baseUrl}/api/agents/${questionAgentSlug}`, {
      method: 'POST',
      headers: { accept, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Paint the fence.' }),
    });
  }

  it('SSE turns report a rejected provider key as an actionable error chunk', async () => {
    model.respond({ error: rejectedKey });

    const response = await post('text/event-stream');
    const stream = await response.text();

    expect(response.status).toBe(200);
    expect(stream).toContain(JSON.stringify({ type: 'error', errorText: keyMessage }));
    expect(stream).not.toContain(keyFragment);
  });

  it('JSON turns report a rejected provider key without the provider message', async () => {
    model.respond({ error: rejectedKey });

    const response = await post('application/json');
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(body)).toMatchObject({
      code: 'ai.key-rejected',
      detail: 'The AI provider rejected the API key.',
      hint: 'Check the API key configured for the test provider.',
    });
    expect(body).not.toContain(keyFragment);
  });
});

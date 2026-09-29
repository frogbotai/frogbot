import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import type { StubChatModel } from '../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../__helpers/shared/StubChatModel';
import { questionAgentSlug } from './shared.js';

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
    model = await startStubChatModel(3988);
    booted = await bootFrogBot(dirname, 'chat-turn-errors');
  });

  afterEach(() => {
    model.reset();
  });

  afterAll(async () => {
    await booted.shutdown();
    await model.close();
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
    expect(JSON.parse(body)).toEqual({
      error: "The AI provider rejected the API key. Check your AI provider's API key.",
    });
    expect(body).not.toContain(keyFragment);
  });
});

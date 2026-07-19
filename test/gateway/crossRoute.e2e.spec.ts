// Gateway E2E — cross-route fidelity. The SAME logical question, sent through
// all three wire surfaces (/v1/chat/completions, /v1/messages, /v1/responses)
// on the SAME model, must:
//   1. all return 200,
//   2. each come back in ITS OWN correct wire envelope (the three shapes
//      differ — chatcmpl vs Anthropic message vs Responses response),
//   3. all contain the same correct answer.
// Divergence in status or shape between routes = a translation bug. This is
// high-value fidelity coverage: it catches a route that silently mistranslates
// a request the other two handle.
//
// Run: RUN_E2E=1 pnpm vitest run --project=gateway-e2e test/gateway/crossRoute.e2e.spec.ts
// Skips cleanly (does not fail) when RUN_E2E !== '1'.

import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { buildProviderRegistry, type ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY ?? 'public';
const RUN_E2E = process.env.RUN_E2E === '1';

const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
const MODEL = 'zen/deepseek-v4-flash-free';

const TEST_TIMEOUT = 90_000;

function makeZenApp() {
  const registry = buildProviderRegistry({}, [
    { name: 'zen', baseURL: ZEN_BASE_URL, apiKey: OPENCODE_API_KEY },
  ]) as ProviderRegistry;
  return createApp({ registry });
}

// The one prompt, with a deterministic single-token answer.
const QUESTION = 'What is 17*23? Reply with just the number.';
const EXPECTED = '391';

type ChatBody = {
  object?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
};

type MessagesBody = {
  type?: string;
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type ResponsesBody = {
  object?: string;
  status?: string;
  output_text?: string;
  output?: Array<{ type?: string; role?: string; content?: Array<{ type?: string; text?: string }> }>;
};

describe.skipIf(!RUN_E2E)('gateway E2E — cross-route fidelity (same question, three wires)', () => {
  const app = makeZenApp();

  it(
    'the same arithmetic question returns 200 + correct answer in each route\'s own envelope',
    async () => {
      const [chat, messages, responses] = await Promise.all([
        postJson<ChatBody>(app, '/v1/chat/completions', {
          model: MODEL,
          messages: [{ role: 'user', content: QUESTION }],
          max_tokens: 1024,
        }),
        postJson<MessagesBody>(app, '/v1/messages', {
          model: MODEL,
          messages: [{ role: 'user', content: QUESTION }],
          max_tokens: 1024,
        }),
        postJson<ResponsesBody>(app, '/v1/responses', {
          model: MODEL,
          input: QUESTION,
          max_output_tokens: 1024,
        }),
      ]);

      // 1. All three succeed.
      expect(chat.status, `chat body: ${JSON.stringify(chat.body)}`).toBe(200);
      expect(messages.status, `messages body: ${JSON.stringify(messages.body)}`).toBe(200);
      expect(responses.status, `responses body: ${JSON.stringify(responses.body)}`).toBe(200);

      // 2. Each in ITS OWN correct wire envelope — the shapes must differ.
      // chat.completions — OpenAI chatcmpl envelope.
      expect(chat.body.object).toBe('chat.completion');
      const chatText = chat.body.choices?.[0]?.message?.content ?? '';
      expect(typeof chatText).toBe('string');

      // messages — Anthropic message envelope.
      expect(messages.body.type).toBe('message');
      expect(messages.body.role).toBe('assistant');
      expect(Array.isArray(messages.body.content)).toBe(true);
      const messagesText = (messages.body.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');

      // responses — OpenAI Responses envelope.
      expect(responses.body.object).toBe('response');
      expect(responses.body.status).toBe('completed');
      expect(typeof responses.body.output_text).toBe('string');
      const responsesText = responses.body.output_text ?? '';

      // The three envelopes are genuinely distinct surfaces (no route leaking
      // another route's shape).
      expect(chat.body.object).not.toBe(responses.body.object);
      expect((messages.body as { object?: string }).object).toBeUndefined();

      // 3. All three arrive at the same correct answer.
      expect(chatText).toContain(EXPECTED);
      expect(messagesText).toContain(EXPECTED);
      expect(responsesText).toContain(EXPECTED);
    },
    TEST_TIMEOUT,
  );
});

// P2 security finding — G107. P1 security finding — G33.
//
// G107 — The header forward allowlist includes `api-key` (Azure OpenAI header)
//        and `openai-organization` / `openai-project`. A client who can set
//        these headers on an outbound request can override the upstream
//        credentials the gateway operator configured. This is a credential
//        takeover vector: the client substitutes their own Azure `api-key` or
//        OpenAI org/project, bypassing the operator's access control and
//        potentially billing a different account.
//
// G33  — SSRF: `/v1/messages` (Anthropic `source: { type: 'url' }`) and
//        `/v1/responses` (`input_image` / `input_file` URLs) accepted any
//        user-supplied URL. When the resolved provider does not natively
//        support URL file parts, the AI SDK's default download function
//        fetched the URL from inside the gateway process — SSRF against
//        IMDS (169.254.169.254), loopback, and internal services. Fixed by
//        passing an SSRF-guarded `experimental_download` (utils/downloadGuard).
//
// G107 tests assert the CORRECT behavior (override is blocked), which the
// gateway now enforces by removing the credential headers from the allowlist.

import { describe, expect, it } from 'vitest';
import type { LanguageModelV4 } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';

// ---------------------------------------------------------------------------
// Recording model — captures the exact headers the AI SDK hands to doGenerate.
// ---------------------------------------------------------------------------

type RecordedCall = { headers?: Record<string, string> | undefined };

function createHeaderCapturingModel(): { model: LanguageModelV4; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const model = {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate(options: { headers?: unknown }) {
      calls.push({ headers: options.headers as Record<string, string> | undefined });
      return Promise.resolve({
        content: [{ type: 'text', text: 'ok' }],
        finishReason: 'stop',
        usage: {
          inputTokens: { total: 5, noCache: 5 },
          outputTokens: { total: 3, text: 3 },
        },
        warnings: [],
        response: { id: 'r1', modelId: 'mock-model', timestamp: new Date('2026-01-01') },
      });
    },
    doStream(options: { headers?: unknown }) {
      calls.push({ headers: options.headers as Record<string, string> | undefined });
      return Promise.resolve({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 't0' });
            controller.enqueue({ type: 'text-delta', id: 't0', delta: 'ok' });
            controller.enqueue({ type: 'text-end', id: 't0' });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: { total: 5, noCache: 5 },
                outputTokens: { total: 3, text: 3 },
              },
            });
            controller.close();
          },
        }),
      });
    },
  } as unknown as LanguageModelV4;

  return { model, calls };
}

function makeApp(capturer: ReturnType<typeof createHeaderCapturingModel>) {
  const registry = { openai: { languageModel: () => capturer.model } } as unknown as ProviderRegistry;
  return createApp({ registry });
}

// ---------------------------------------------------------------------------
// G107 — client can inject api-key / openai-organization / openai-project
// ---------------------------------------------------------------------------

describe('G107 — credential header injection via allowlist', () => {
  // The Azure `api-key` header is in the forward allowlist. A client who adds
  // `api-key: <attacker-key>` to their request will have that header forwarded
  // to the upstream, potentially overriding the operator's configured credential.
  it('strips inbound api-key header before forwarding to upstream', async () => {
    const capturer = createHeaderCapturingModel();
    const app = makeApp(capturer);

    await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': 'sk-attacker-override',
      },
      body: JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] }),
    });

    // G107: the attacker-supplied api-key must NOT reach the upstream model.
    expect(capturer.calls).toHaveLength(1);
    const forwarded = capturer.calls[0]?.headers ?? {};
    expect(Object.keys(forwarded).map((k) => k.toLowerCase())).not.toContain('api-key');
  });

  // The `openai-organization` header allows switching the billing org on OpenAI.
  // A client who sets it can redirect charges to a different organisation.
  it('strips inbound openai-organization header before forwarding to upstream', async () => {
    const capturer = createHeaderCapturingModel();
    const app = makeApp(capturer);

    await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'openai-organization': 'org-attacker-billing',
      },
      body: JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] }),
    });

    expect(capturer.calls).toHaveLength(1);
    const forwarded = capturer.calls[0]?.headers ?? {};
    expect(Object.keys(forwarded).map((k) => k.toLowerCase())).not.toContain('openai-organization');
  });

  // The `openai-project` header selects the active project on OpenAI (affects
  // rate limits, billing, and access control). Same injection vector.
  it('strips inbound openai-project header before forwarding to upstream', async () => {
    const capturer = createHeaderCapturingModel();
    const app = makeApp(capturer);

    await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'openai-project': 'proj-attacker-project',
      },
      body: JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] }),
    });

    expect(capturer.calls).toHaveLength(1);
    const forwarded = capturer.calls[0]?.headers ?? {};
    expect(Object.keys(forwarded).map((k) => k.toLowerCase())).not.toContain('openai-project');
  });
});

// ---------------------------------------------------------------------------
// G33 — SSRF via user-supplied remote media URLs
//
// The mock model declares `supportedUrls: {}`, so the AI SDK plans an
// in-process download for every URL file part — exactly the vulnerable path.
// The guard must reject the URL (400) before any network fetch and before the
// request ever reaches the model.
// ---------------------------------------------------------------------------

describe('G33 — SSRF via remote URL fetch', () => {
  it('rejects /v1/messages url source pointing at loopback with a 400', async () => {
    const capturer = createHeaderCapturingModel();
    const app = makeApp(capturer);

    const res = await app.request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        max_tokens: 16,
        messages: [{
          role: 'user',
          content: [{ type: 'image', source: { type: 'url', url: 'http://127.0.0.1:8080/' } }],
        }],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { type: string; error: { type: string; message: string } };
    expect(body.error.type).toBe('invalid_request_error');
    expect(body.error.message).toContain('scheme "http:" is not allowed');
    // The request must never reach the provider.
    expect(capturer.calls).toHaveLength(0);
  });

  it('rejects /v1/messages https url source resolving to a private literal IP', async () => {
    const capturer = createHeaderCapturingModel();
    const app = makeApp(capturer);

    const res = await app.request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        max_tokens: 16,
        messages: [{
          role: 'user',
          content: [{ type: 'image', source: { type: 'url', url: 'https://169.254.169.254/latest/meta-data/' } }],
        }],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: { type: string; message: string } };
    expect(body.error.type).toBe('invalid_request_error');
    expect(body.error.message).toContain('private, loopback, or link-local');
    expect(capturer.calls).toHaveLength(0);
  });

  it('rejects /v1/responses input_image pointing at the IMDS endpoint with a 400', async () => {
    const capturer = createHeaderCapturingModel();
    const app = makeApp(capturer);

    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        input: [{
          role: 'user',
          content: [{ type: 'input_image', image_url: 'http://169.254.169.254/latest/meta-data/' }],
        }],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: { type: string; message: string } };
    expect(body.error.type).toBe('invalid_request_error');
    expect(capturer.calls).toHaveLength(0);
  });

  it('rejects /v1/responses input_file file_url pointing at the IMDS endpoint with a 400', async () => {
    const capturer = createHeaderCapturingModel();
    const app = makeApp(capturer);

    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        input: [{
          role: 'user',
          content: [{ type: 'input_file', file_url: 'http://169.254.169.254/latest/meta-data/' }],
        }],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: { type: string; message: string } };
    expect(body.error.type).toBe('invalid_request_error');
    expect(capturer.calls).toHaveLength(0);
  });

  // Regression guard: the chat route already rejects remote URLs at the
  // translator layer ("Inline data URLs only") — keep it that way.
  it('rejects /v1/chat/completions remote image_url with a 400 (pre-existing posture)', async () => {
    const capturer = createHeaderCapturingModel();
    const app = makeApp(capturer);

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [{
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'http://169.254.169.254/latest/meta-data/' } }],
        }],
      }),
    });

    expect(res.status).toBe(400);
    expect(capturer.calls).toHaveLength(0);
  });
});

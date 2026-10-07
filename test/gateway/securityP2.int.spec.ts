import type { LanguageModelV4 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';

type RecordedCall = { headers?: Record<string, string> | undefined };

function createHeaderCapturingModel(): { model: LanguageModelV4; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const model = {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
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
  const registry = {
    openai: { languageModel: () => capturer.model },
  } as unknown as ProviderRegistry;

  return createApp({ registry });
}

describe('G107 — credential header injection via allowlist', () => {
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

    expect(capturer.calls).toHaveLength(1);

    const forwarded = capturer.calls[0]?.headers ?? {};

    expect(Object.keys(forwarded).map((k) => k.toLowerCase())).not.toContain('api-key');
  });

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
        messages: [
          {
            role: 'user',
            content: [{ type: 'image', source: { type: 'url', url: 'http://127.0.0.1:8080/' } }],
          },
        ],
      }),
    });

    expect(res.status).toBe(400);

    const body = (await res.json()) as { type: string; error: { type: string; message: string } };

    expect(body.error.type).toBe('invalid_request_error');
    expect(body.error.message).toContain('scheme "http:" is not allowed');
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
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'url', url: 'https://169.254.169.254/latest/meta-data/' },
              },
            ],
          },
        ],
      }),
    });

    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: { type: string; message: string } };

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
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_image', image_url: 'http://169.254.169.254/latest/meta-data/' },
            ],
          },
        ],
      }),
    });

    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: { type: string; message: string } };

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
        input: [
          {
            role: 'user',
            content: [{ type: 'input_file', file_url: 'http://169.254.169.254/latest/meta-data/' }],
          },
        ],
      }),
    });

    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: { type: string; message: string } };

    expect(body.error.type).toBe('invalid_request_error');
    expect(capturer.calls).toHaveLength(0);
  });

  it('rejects /v1/chat/completions remote image_url with a 400 (pre-existing posture)', async () => {
    const capturer = createHeaderCapturingModel();
    const app = makeApp(capturer);

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: 'http://169.254.169.254/latest/meta-data/' } },
            ],
          },
        ],
      }),
    });

    expect(res.status).toBe(400);
    expect(capturer.calls).toHaveLength(0);
  });
});

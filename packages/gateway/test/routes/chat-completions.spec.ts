// Route-level integration tests for POST /v1/chat/completions.
//
// These tests hit the real Hono app via `app.request()` and exercise the
// full validation → error envelope round-trip. They specifically guard the
// class of failures that previously surfaced as 500 server_errors and now
// should be clean 400s with `param` pointing at the exact field.
//
// Note: these tests deliberately do NOT exercise the upstream provider call
// path — they all fail at validation or at gateway-internal checks before
// registry resolution hands off to `generateText`. That keeps them deterministic
// and dependency-free.

import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { buildProviderRegistry } from '../../src/providers/registry.js';

// ---------------------------------------------------------------------------
// Test harness — an app with a single configured (but never called) provider
// ---------------------------------------------------------------------------

function makeApp() {
  return createApp({
    registry: buildProviderRegistry({ openai: { apiKey: 'sk-test-never-called' } }),
  });
}

async function post(body: unknown): Promise<{ status: number; body: { error: { message: string; type: string; code: string | null; param: string | null } } }> {
  const app = makeApp();
  const res = await app.request('http://localhost/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { error: { message: string; type: string; code: string | null; param: string | null } };
  return { status: res.status, body: data };
}

// ---------------------------------------------------------------------------
// Schema validation — top-level fields
// ---------------------------------------------------------------------------

describe('chat-completions route — top-level validation', () => {
  it('rejects empty body with 400 and param=model', async () => {
    const { status, body } = await post({});
    expect(status).toBe(400);
    expect(body.error.type).toBe('invalid_request_error');
    expect(body.error.code).toBe('invalid_request_body');
    expect(body.error.param).toBe('model');
  });

  it('rejects missing messages with 400 and param=messages', async () => {
    const { status, body } = await post({ model: 'openai/gpt-4o-mini' });
    expect(status).toBe(400);
    expect(body.error.param).toBe('messages');
  });

  it('rejects empty messages array with 400 and param=messages', async () => {
    const { status, body } = await post({ model: 'openai/gpt-4o-mini', messages: [] });
    expect(status).toBe(400);
    expect(body.error.param).toBe('messages');
    expect(body.error.message).toMatch(/at least one message/);
  });

  it('rejects non-string model with 400 and param=model', async () => {
    const { status, body } = await post({
      model: 42,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(400);
    expect(body.error.param).toBe('model');
  });

  it('rejects bare-name model with 400 invalid_model_id (registry layer)', async () => {
    // Passes schema validation (model is a non-empty string) but the
    // registry rejects bare names.
    const { status, body } = await post({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('invalid_model_id');
    expect(body.error.param).toBe('model');
  });

  it('rejects unconfigured provider with 404 not_found_error', async () => {
    const { status, body } = await post({
      model: 'anthropic/claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(status).toBe(404);
    expect(body.error.code).toBe('provider_not_configured');
    expect(body.error.param).toBe('model');
  });

  it('passes stream:true through schema and resolves the provider', async () => {
    const { status, body } = await post({
      model: 'anthropic/claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });
    expect(status).toBe(404);
    expect(body.error.code).toBe('provider_not_configured');
    expect(body.error.param).toBe('model');
  });
});

// ---------------------------------------------------------------------------
// Schema validation — per-message field paths
// ---------------------------------------------------------------------------

describe('chat-completions route — per-message validation', () => {
  it('passes unknown role through schema (no invalid_request_body) — translator forwards it', async () => {
    // Unknown roles (e.g. legacy `function`, vendor-specific) no longer 400
    // at the schema boundary — they reach the translator and are forwarded as
    // system messages. The request may still fail (e.g. provider auth), but
    // the failure code is NOT invalid_request_body.
    const { body } = await post({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'wizard', content: 'hi' }],
    });
    expect(body.error.code).not.toBe('invalid_request_body');
  });

  it('passes extra fields on known messages through schema without error', async () => {
    // Extra fields (e.g. Google `thinking`, OpenRouter `reasoning_signature`)
    // must not cause schema validation failures.
    const { body } = await post({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi', thinking: 'blah', vendor_field: 123 }],
    });
    expect(body.error.code).not.toBe('invalid_request_body');
  });

  it('passes extended response_format shapes through without error', async () => {
    // Providers send { type: 'json_schema', json_schema: {...} } which our old
    // strict enum would reject. Must reach translator/provider level now.
    const { body } = await post({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      response_format: { type: 'json_schema', json_schema: { name: 'Foo', schema: {} } },
    });
    expect(body.error.code).not.toBe('invalid_request_body');
  });

  it('passes unknown audio format through schema — translator rejects with unsupported_modality', async () => {
    const { status, body } = await post({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [{ type: 'input_audio', input_audio: { data: 'AAAA', format: 'aac' } }],
        },
      ],
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('unsupported_modality');
    expect(body.error.param).toBe('messages[0].content[0].input_audio.format');
  });

  it('rejects user message without content with param=messages[0].content', async () => {
    const { status, body } = await post({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user' }],
    });
    expect(status).toBe(400);
    expect(body.error.param).toBe('messages[0].content');
  });

  it('rejects tool message without tool_call_id with precise param', async () => {
    const { status, body } = await post({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'tool', content: 'result' }],
    });
    expect(status).toBe(400);
    expect(body.error.param).toBe('messages[0].tool_call_id');
  });

  it('rejects assistant tool_call without function.name with precise param', async () => {
    const { status, body } = await post({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'c1', type: 'function', function: { arguments: '{}' } }],
        },
      ],
    });
    expect(status).toBe(400);
    expect(body.error.param).toBe('messages[0].tool_calls[0].function.name');
  });

  it('rejects user content part with unknown type with unsupported_modality from translator', async () => {
    const { status, body } = await post({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [{ type: 'video_url', video_url: { url: 'https://x' } }],
        },
      ],
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('unsupported_modality');
    expect(body.error.param).toMatch(/messages\[0\]\.content/);
  });
});

// ---------------------------------------------------------------------------
// Translator-level rejections (semantic, post-schema)
// ---------------------------------------------------------------------------

describe('chat-completions route — translator semantic rejections', () => {
  it('rejects remote image URL with 400 unsupported_modality and image_url.url param', async () => {
    const { status, body } = await post({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'https://example.com/cat.png' } }],
        },
      ],
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('unsupported_modality');
    expect(body.error.param).toBe('messages[0].content[0].image_url.url');
  });

  it('rejects malformed tool-call JSON with 400 invalid_tool_arguments and precise param', async () => {
    const { status, body } = await post({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'doit', arguments: '{not valid json' },
            },
          ],
        },
      ],
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('invalid_tool_arguments');
    expect(body.error.param).toBe('messages[0].tool_calls[0].function.arguments');
  });

  it('rejects file_id references with 400 unsupported_modality and file_id param', async () => {
    const { status, body } = await post({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [{ type: 'file', file: { file_id: 'file-abc123' } }],
        },
      ],
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('unsupported_modality');
    expect(body.error.param).toBe('messages[0].content[0].file.file_id');
  });
});

// ---------------------------------------------------------------------------
// Regression: things that used to be 500 server_error are now 400 invalid_request_error
// ---------------------------------------------------------------------------

describe('chat-completions route — regression: 500→400 conversion', () => {
  it.each([
    ['empty body', {}],
    ['null messages', { model: 'openai/gpt-4o-mini', messages: null }],
    ['messages as string', { model: 'openai/gpt-4o-mini', messages: 'oops' }],
    ['user message with null content', { model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: null }] }],
    ['tool_calls without id', {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'assistant', content: null, tool_calls: [{ type: 'function', function: { name: 'x', arguments: '{}' } }] },
      ],
    }],
  ])('%s produces 400, not 500', async (_, payload) => {
    const { status, body } = await post(payload);
    expect(status).toBe(400);
    expect(body.error.type).toBe('invalid_request_error');
  });
});

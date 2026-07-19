// Review 056 B2 triage — reproduction tests for G19 (RS3) from
// dev/plans/frogbot_gateway/056_full_gateway_review/00_SUMMARY.md §3 /
// findings/04_responses_wire.md.
//
// G19: /v1/responses built-in (hosted) tools — web_search, file_search,
// code_interpreter, mcp, image_generation — and hosted tool_choice shapes are
// silently stripped by the responses tools translation
// (translators/tools.ts:13 `if (t.type !== 'function') continue;` and
// tools.ts:38-39 returning undefined), while schema.ts:66 claims hosted tool
// types are "passed through untouched". The request proceeds tool-less with
// HTTP 200 and no warning.
//
// Expected (compliant) behavior asserted here, verified against the AI SDK
// source (/Users/colbygilbert/Documents/Code/ai):
// - Hosted tools must reach the model as LanguageModelV4ProviderTool entries
//   `{ type: 'provider', id: 'openai.<tool>', name, args }`
//   (packages/provider/src/language-model/v4/language-model-v4-provider-tool.ts,
//   ai-core prepare-tools.ts:63-70). openai-responses then maps
//   `openai.web_search` → `{ type: 'web_search', ... }` on the wire
//   (packages/openai/src/responses/openai-responses-prepare-tools.ts:186-202)
//   and `openai.mcp` → `{ type: 'mcp', server_label, server_url, ... }`
//   (prepare-tools.ts:246-292).
// - Hosted tool_choice `{ type: 'web_search' }` must reach the model as
//   `{ type: 'tool', toolName: 'web_search' }` (ai-core
//   prepare-tool-choice.ts:14), which openai-responses maps back to
//   `{ type: 'web_search' }` (openai-responses-prepare-tools.ts:363-383).
// - For non-OpenAI upstreams hosted OpenAI tools cannot work; the honest
//   behavior is a typed 400 (invalid_request_error), not a silent tool-less
//   200 (REASSESSMENT_2 §1.4 "forward or 400").
//
// Each test asserts the CORRECT behavior at the composed-app seam. Confirmed
// findings are wrapped as `it.fails(...)` so the suite stays green; flip to
// `it()` when the fix lands.

import { describe, expect, it } from 'vitest';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

/**
 * Recording mock LanguageModelV4 — captures the exact callOptions the AI SDK
 * hands to `doGenerate`/`doStream`. Mirrors paramForwarding.int.spec.ts.
 */
function createRecordingModel(opts?: {
  text?: string;
  onCall?: (options: LanguageModelV4CallOptions) => void;
}): LanguageModelV4 {
  const { text = 'Hello from mock!', onCall } = opts ?? {};
  const usage = {
    inputTokens: { total: 5, noCache: 5 },
    outputTokens: { total: 4, text: 4 },
  };
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: async (options: LanguageModelV4CallOptions) => {
      onCall?.(options);
      return {
        content: [{ type: 'text' as const, text }],
        finishReason: 'stop',
        usage,
        warnings: [],
        response: {
          id: 'mock-resp-1',
          modelId: 'mock-model',
          timestamp: new Date('2026-01-01T00:00:00Z'),
        },
      };
    },
    doStream: async (options: LanguageModelV4CallOptions) => {
      onCall?.(options);
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 'text-0' });
            controller.enqueue({ type: 'text-delta', id: 'text-0', delta: text });
            controller.enqueue({ type: 'text-end', id: 'text-0' });
            controller.enqueue({ type: 'finish', finishReason: 'stop', usage });
            controller.close();
          },
        }),
      };
    },
  } as unknown as LanguageModelV4;
}

function makeAppWithModel(providerName: string, model: LanguageModelV4) {
  const fakeProvider = { languageModel: () => model };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

// ---------------------------------------------------------------------------
// G19a (RS3) — hosted tools must be forwarded to the model as
// provider-defined tools ({ type: 'provider', id: 'openai.*' }) on an OpenAI
// upstream; today translators/tools.ts:13 drops every non-'function' tool and
// the request proceeds tool-less with 200.
// ---------------------------------------------------------------------------

// G19a
describe('responses hosted tools forwarded upstream (openai)', () => {
  // G19 — tools:[{type:'web_search'}] silently stripped (callOptions.tools undefined, 200); flip to it() when fixed. See 056_full_gateway_review.
  it('forwards tools:[{type: web_search}] as provider-defined tool id openai.web_search', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status, body } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'what happened in the news today?',
      tools: [{ type: 'web_search' }],
    });

    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
    // AI SDK seam: LanguageModelV4ProviderTool (prepare-tools.ts maps ToolSet
    // provider tools to { type: 'provider', id, name, args }).
    expect(callOptions?.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'provider', id: 'openai.web_search' }),
    ]));
  });

  // G19 — tools:[{type:'mcp',...}] silently stripped including server config; flip to it() when fixed. See 056_full_gateway_review.
  it('forwards tools:[{type: mcp, server_label, server_url}] as provider-defined tool id openai.mcp with server args', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status, body } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'use the deepwiki server',
      tools: [{
        type: 'mcp',
        server_label: 'deepwiki',
        server_url: 'https://mcp.deepwiki.com/mcp',
        require_approval: 'never',
      }],
    });

    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
    expect(callOptions?.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'provider', id: 'openai.mcp' }),
    ]));
    // The server connection config must survive translation (openai-responses
    // mcpArgsSchema: serverLabel/serverUrl/requireApproval).
    const serialized = JSON.stringify(callOptions?.tools ?? []);
    expect(serialized).toContain('deepwiki');
    expect(serialized).toContain('https://mcp.deepwiki.com/mcp');
  });

  // G19 — hosted tool dropped even alongside a surviving function tool (partial toolset, no warning); flip to it() when fixed. See 056_full_gateway_review.
  it('keeps hosted tools when mixed with function tools', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'search then compute',
      tools: [
        { type: 'web_search' },
        {
          type: 'function',
          name: 'get_weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      ],
    });

    expect(status).toBe(200);
    expect(callOptions?.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'function', name: 'get_weather' }),
      expect.objectContaining({ type: 'provider', id: 'openai.web_search' }),
    ]));
  });
});

// ---------------------------------------------------------------------------
// G19b (RS3) — hosted tool_choice ({ type: 'web_search' }) must be forwarded
// as { type: 'tool', toolName: 'web_search' } at the AI SDK seam (ai-core
// prepare-tool-choice.ts; openai-responses maps it back to
// { type: 'web_search' } on the wire); today translators/tools.ts:38-39
// silently degrades every hosted shape to undefined (upstream default 'auto').
// ---------------------------------------------------------------------------

// G19b
describe('responses hosted tool_choice forwarded upstream', () => {
  // G19 — tool_choice {type:'web_search'} silently degraded to undefined/auto; flip to it() when fixed. See 056_full_gateway_review.
  it('forwards tool_choice {type: web_search} as {type: tool, toolName: web_search}', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel('openai', createRecordingModel({
      onCall: (options) => { callOptions = options; },
    }));

    const { status, body } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'search the web for this',
      tools: [{ type: 'web_search' }],
      tool_choice: { type: 'web_search' },
    });

    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
    expect(callOptions?.toolChoice).toEqual({ type: 'tool', toolName: 'web_search' });
  });
});

// ---------------------------------------------------------------------------
// G19c (RS3) — cross-provider honesty: hosted OpenAI tools cannot work on a
// non-OpenAI upstream, so the correct behavior is a typed 400
// (invalid_request_error), not silent stripping. Today: the hosted tool is
// dropped on the floor, the model is called tool-less, and the client gets a
// clean 200 — the model "answers" a web-search request with zero tools.
// ---------------------------------------------------------------------------

// G19c
describe('responses hosted tools on non-OpenAI upstream', () => {
  // G19 — non-OpenAI upstream: hosted tool silently stripped → tool-less 200 (documented actual: status 200, callOptions.tools undefined, model invoked); flip to it() when fixed. See 056_full_gateway_review.
  it('rejects hosted tools with a typed 400 instead of silently degrading', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    let modelCalled = false;
    const app = makeAppWithModel('anthropic', createRecordingModel({
      onCall: (options) => { modelCalled = true; callOptions = options; },
    }));

    const { status, body } = await postJson<{ error?: { type?: string; message?: string } }>(
      app,
      '/v1/responses',
      {
        model: 'anthropic/claude-sonnet-4-20250514',
        input: 'what happened in the news today?',
        tools: [{ type: 'web_search' }],
      },
    );

    expect(
      status,
      `expected typed 400, got ${status}: ${JSON.stringify(body)} ` +
      `(modelCalled=${modelCalled}, tools=${JSON.stringify(callOptions?.tools)})`,
    ).toBe(400);
    expect(body).toHaveProperty('error.type', 'invalid_request_error');
    // The upstream must never be invoked with the hosted tool silently removed.
    expect(modelCalled).toBe(false);
  });
});

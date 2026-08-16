import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { createGateway } from '../../packages/gateway/src/gateway.js';
import {
  type BedrockConfig,
  bedrockProvider,
} from '../../packages/gateway/src/providers/bedrock/index.js';
import { DEFAULT_MODEL_CATALOG } from '../../packages/gateway/src/providers/catalog.data.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const PDF = 'JVBERi0xLjQKJUVPRg==';
const STANDARD_MODEL = 'anthropic.claude-sonnet-4-6';
const MANTLE_CHAT_MODEL = 'openai.gpt-oss-120b-1:0';
const MANTLE_RESPONSES_MODEL = 'openai.gpt-5.6-luna';
const upstreamBodies: unknown[] = [];

function upstreamResponse(input: RequestInfo | URL, init?: RequestInit) {
  upstreamBodies.push(JSON.parse(String(init?.body)));
  const url = String(input);
  if (url.includes('bedrock-mantle')) {
    if (url.endsWith('/responses')) {
      return new Response(
        JSON.stringify({
          id: 'response-1',
          object: 'response',
          created_at: 1,
          model: MANTLE_RESPONSES_MODEL,
          output: [
            {
              id: 'message-1',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'ok', annotations: [] }],
            },
          ],
          status: 'completed',
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({
        id: 'chat-1',
        object: 'chat.completion',
        created: 1,
        model: MANTLE_CHAT_MODEL,
        choices: [
          { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  }
  return new Response(
    JSON.stringify({
      output: { message: { role: 'assistant', content: [{ text: 'ok' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      metrics: { latencyMs: 1 },
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

function makeBedrock() {
  return bedrockProvider.build({
    apiKey: 'test',
    region: 'us-east-1',
    fetch: vi.fn(upstreamResponse),
  } as BedrockConfig);
}

function makeApp() {
  return createApp({
    registry: { 'amazon-bedrock': makeBedrock() } as unknown as ProviderRegistry,
  });
}

function imageContent() {
  return (upstreamBodies[0] as any).messages[0].content[0].image;
}

beforeEach(() => {
  upstreamBodies.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Bedrock file content wire contract', () => {
  it('sends chat completion inline image bytes as base64', async () => {
    await postJson(makeApp(), '/v1/chat/completions', {
      model: `amazon-bedrock/${STANDARD_MODEL}`,
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG}` } }],
        },
      ],
    });

    expect(imageContent()).toEqual({ format: 'png', source: { bytes: PNG } });
  });

  it('sends messages inline image bytes as base64', async () => {
    await postJson(makeApp(), '/v1/messages', {
      model: `amazon-bedrock/${STANDARD_MODEL}`,
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
          ],
        },
      ],
    });

    expect(imageContent()).toEqual({ format: 'png', source: { bytes: PNG } });
  });

  it('sends messages inline PDF bytes as base64', async () => {
    await postJson(makeApp(), '/v1/messages', {
      model: `amazon-bedrock/${STANDARD_MODEL}`,
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: PDF },
            },
          ],
        },
      ],
    });

    expect((upstreamBodies[0] as any).messages[0].content[0].document.source.bytes).toBe(PDF);
  });

  it('sends tool-result image bytes without throwing', async () => {
    const { status } = await postJson(makeApp(), '/v1/messages', {
      model: `amazon-bedrock/${STANDARD_MODEL}`,
      max_tokens: 10,
      tools: [
        { name: 'look', description: 'Look', input_schema: { type: 'object', properties: {} } },
      ],
      messages: [
        { role: 'user', content: 'Look' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tool-1', name: 'look', input: {} }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
              ],
            },
          ],
        },
      ],
    });

    expect(status).toBe(200);
    expect(
      (upstreamBodies[0] as any).messages[2].content[0].toolResult.content[0].image.source.bytes,
    ).toBe(PNG);
  });

  it('sends Mantle chat image data as a valid data URL', async () => {
    const key = `amazon-bedrock/${MANTLE_CHAT_MODEL}`;
    const get = DEFAULT_MODEL_CATALOG.get.bind(DEFAULT_MODEL_CATALOG);
    vi.spyOn(DEFAULT_MODEL_CATALOG, 'get').mockImplementation((id) =>
      id === key
        ? {
            ...get(id)!,
            sdk: {
              npm: '@ai-sdk/amazon-bedrock/mantle',
              api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
              shape: 'chat',
            },
          }
        : get(id),
    );
    await postJson(makeApp(), '/v1/chat/completions', {
      model: `amazon-bedrock/${MANTLE_CHAT_MODEL}`,
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG}` } }],
        },
      ],
    });

    expect((upstreamBodies[0] as any).messages[0].content[0].image_url.url).toBe(
      `data:image/png;base64,${PNG}`,
    );
  });

  it('sends Mantle responses image data as a valid data URL', async () => {
    await postJson(makeApp(), '/v1/chat/completions', {
      model: `amazon-bedrock/${MANTLE_RESPONSES_MODEL}`,
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG}` } }],
        },
      ],
    });

    expect((upstreamBodies[0] as any).input[0].content[0].image_url).toBe(
      `data:image/png;base64,${PNG}`,
    );
  });

  it('sends streaming chat completion image bytes as base64', async () => {
    const response = await makeApp().request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: `amazon-bedrock/${STANDARD_MODEL}`,
        stream: true,
        messages: [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG}` } }],
          },
        ],
      }),
    });
    await response.text();

    expect(imageContent()).toEqual({ format: 'png', source: { bytes: PNG } });
  });

  it('sends in-process gateway image bytes as base64', async () => {
    const provider = Object.assign({}, makeBedrock(), { embeddingModel: vi.fn() });
    const gateway = createGateway({ providers: { 'amazon-bedrock': provider } });
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'user',
        content: [{ type: 'file', mediaType: 'image/png', data: { type: 'data', data: PNG } }],
      },
    ];
    await gateway.chatModel(`amazon-bedrock/${STANDARD_MODEL}`).doGenerate({ prompt });

    expect(imageContent()).toEqual({ format: 'png', source: { bytes: PNG } });
  });
});

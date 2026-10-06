// Shared route runners for the live matrix suite. Each runner sends one
// real request through the gateway app and asserts the wire envelope a real
// client would depend on. Assertions are deliberately envelope-level (shape,
// non-empty content, real usage) — model-behavior detail lives in the
// dedicated zen.*.e2e suites.

import type { Hono } from 'hono';
import { expect } from 'vitest';

import { createApp } from '../../../packages/gateway/src/app.js';
import {
  buildProviderRegistry,
  type ProviderConfigMap,
  providers,
} from '../../../packages/gateway/src/providers/registry.js';
import { parseSse } from '../../__helpers/gateway/parse-sse.js';
import { type JsonResponse, postJson } from '../../__helpers/gateway/post-json.js';
import { FIXTURE_FACTS, fixtureFile } from '../../live/live.js';
import type { LiveProviderEntry } from './matrix.js';

export type LiveApp = Hono;

// ---------------------------------------------------------------------------
// App builder — one gateway app per matrix entry, from env keys.
// ---------------------------------------------------------------------------

export function makeLiveApp(entry: LiveProviderEntry): LiveApp {
  if (entry.compat) {
    const apiKey = process.env[entry.compat.apiKeyEnv];
    const registry = buildProviderRegistry({
      [entry.label]: { baseURL: entry.compat.baseURL, apiKey },
    });
    return createApp({ registry });
  }

  const name = entry.provider;
  if (!name) {
    throw new Error(`matrix entry "${entry.label}" has neither provider nor compat`);
  }
  const cfg = providers[name].fromEnv(process.env);
  if (!cfg) {
    throw new Error(
      `matrix entry "${entry.label}": env not configured (${providers[name].envVars[0]})`,
    );
  }
  const cfgMap: ProviderConfigMap = {};
  (cfgMap as Record<string, unknown>)[name] = cfg;
  const registry = buildProviderRegistry(cfgMap);
  return createApp({ registry });
}

// ---------------------------------------------------------------------------
// Backoff for rate limits and transient upstream overload.
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T extends { status: number; headers: Headers }>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let last: T | undefined;
  for (let i = 0; i < attempts; i++) {
    last = await fn();
    const retryAfter = Number(last.headers.get('retry-after'));
    const rateLimited = last.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0;
    if (!rateLimited && ![503, 529].includes(last.status)) {
      return last;
    }
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (i + 1);
    await sleep(Math.min(waitMs, 30_000));
  }
  return last!;
}

export async function post<T>(app: LiveApp, path: string, body: unknown): Promise<JsonResponse<T>> {
  return withRetry(() => postJson<T>(app, path, body));
}

export async function postRaw(app: LiveApp, path: string, body: unknown): Promise<Response> {
  return withRetry(async () =>
    app.request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

// ---------------------------------------------------------------------------
// Text wires — chat / messages / responses, non-stream + stream.
// ---------------------------------------------------------------------------

const PROMPT = 'Say hi';
const MAX_TOKENS = 1024; // reasoning models: budget covers thinking + text

type ChatBody = {
  id?: string;
  object?: string;
  choices?: Array<{
    message?: { role?: string; content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export async function expectChat(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<ChatBody>(app, '/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: PROMPT }],
    max_tokens: MAX_TOKENS,
  });

  expect(status).toBe(200);
  expect(body.object).toBe('chat.completion');
  expect(typeof body.id).toBe('string');
  const choice = body.choices?.[0];
  expect(typeof choice?.message?.content).toBe('string');
  expect(choice!.message!.content!.length).toBeGreaterThan(0);
  expect(choice!.finish_reason).toBeTruthy();
  expect(body.usage?.prompt_tokens).toBeGreaterThan(0);
  expect(body.usage?.completion_tokens).toBeGreaterThan(0);
}

type ChatChunk = {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
};

export async function expectChatStream(app: LiveApp, model: string): Promise<void> {
  const res = await postRaw(app, '/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: PROMPT }],
    max_tokens: MAX_TOKENS,
    stream: true,
  });

  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');

  const frames = parseSse(await res.text());
  expect(frames.length).toBeGreaterThan(0);
  expect(frames[frames.length - 1].data).toBe('[DONE]');

  const chunks = frames
    .filter((f) => f.data !== '[DONE]')
    .map((f) => JSON.parse(f.data) as ChatChunk);
  const text = chunks.map((c) => c.choices?.[0]?.delta?.content ?? '').join('');
  expect(text.length).toBeGreaterThan(0);
  expect(chunks.some((c) => c.choices?.[0]?.finish_reason)).toBe(true);
}

type MessagesBody = {
  type?: string;
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export async function expectMessages(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<MessagesBody>(app, '/v1/messages', {
    model,
    messages: [{ role: 'user', content: PROMPT }],
    max_tokens: MAX_TOKENS,
  });

  expect(status).toBe(200);
  expect(body.type).toBe('message');
  expect(body.role).toBe('assistant');
  const text = (body.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  expect(text.length).toBeGreaterThan(0);
  expect(body.stop_reason).toBeTruthy();
  expect(body.usage?.output_tokens).toBeGreaterThan(0);
}

type AnthropicEventData = {
  type?: string;
  delta?: { type?: string; text?: string };
};

export async function expectMessagesStream(app: LiveApp, model: string): Promise<void> {
  const res = await postRaw(app, '/v1/messages', {
    model,
    messages: [{ role: 'user', content: PROMPT }],
    max_tokens: MAX_TOKENS,
    stream: true,
  });

  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');

  const events = parseSse(await res.text()).map((f) => JSON.parse(f.data) as AnthropicEventData);
  const types = events.map((e) => e.type);
  expect(types[0]).toBe('message_start');
  expect(types[types.length - 1]).toBe('message_stop');

  const text = events
    .filter((e) => e.type === 'content_block_delta' && e.delta?.type === 'text_delta')
    .map((e) => e.delta?.text ?? '')
    .join('');
  expect(text.length).toBeGreaterThan(0);
}

type ResponsesBody = {
  object?: string;
  status?: string;
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export async function expectResponses(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<ResponsesBody>(app, '/v1/responses', {
    model,
    input: PROMPT,
    max_output_tokens: MAX_TOKENS,
  });

  expect(status).toBe(200);
  expect(body.object).toBe('response');
  expect(body.status).toBe('completed');
  expect(typeof body.output_text).toBe('string');
  expect(body.output_text!.length).toBeGreaterThan(0);
  expect(body.usage?.output_tokens).toBeGreaterThan(0);
}

export async function expectResponsesStream(app: LiveApp, model: string): Promise<void> {
  const res = await postRaw(app, '/v1/responses', {
    model,
    input: PROMPT,
    max_output_tokens: MAX_TOKENS,
    stream: true,
  });

  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');

  const frames = parseSse(await res.text()).filter((f) => f.data !== '[DONE]');
  const names = frames.map((f) => f.event);
  expect(names[0]).toBe('response.created');
  expect(names[names.length - 1]).toBe('response.completed');

  const text = frames
    .filter((f) => f.event === 'response.output_text.delta')
    .map((f) => (JSON.parse(f.data) as { delta?: string }).delta ?? '')
    .join('');
  expect(text.length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Embeddings + rerank.
// ---------------------------------------------------------------------------

type EmbeddingsBody = {
  object?: string;
  data?: Array<{ object?: string; embedding?: number[]; index?: number }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

export async function expectEmbeddings(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<EmbeddingsBody>(app, '/v1/embeddings', {
    model,
    input: [
      'How do I reset my password?',
      'To change your password, open Settings and choose Reset password.',
      'Our office is closed on public holidays.',
    ],
  });

  expect(status).toBe(200);
  expect(body.object).toBe('list');
  expect(body.data?.map((item) => item.index)).toEqual([0, 1, 2]);

  const [query, answer, unrelated] = body.data!.map((item) => item.embedding!);

  expect(query.length).toBeGreaterThan(10);
  expect(answer.length).toBe(query.length);
  expect(cosine(query, answer)).toBeGreaterThan(cosine(query, unrelated));
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  a.forEach((value, index) => {
    dot += value * b[index];
    normA += value * value;
    normB += b[index] * b[index];
  });

  return dot / Math.sqrt(normA * normB);
}

type RerankBody = {
  results?: Array<{ index?: number; relevance_score?: number }>;
};

export async function expectRerank(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<RerankBody>(app, '/v1/rerank', {
    model,
    query: 'What sound does a frog make?',
    documents: [
      'The stock market rose by two percent today.',
      'Frogs croak, especially at night near water.',
      'Recipes for sourdough bread require patience.',
    ],
    top_n: 2,
  });

  expect(status).toBe(200);
  expect(Array.isArray(body.results)).toBe(true);
  expect(body.results!.length).toBe(2);
  for (const result of body.results!) {
    expect(typeof result.index).toBe('number');
    expect(typeof result.relevance_score).toBe('number');
  }
  // The frog document must win.
  expect(body.results![0].index).toBe(1);
}

// ---------------------------------------------------------------------------
// Audio — transcriptions (multipart WAV upload) + speech (audio bytes back).
// ---------------------------------------------------------------------------

type TranscriptionBody = { text?: string };

export async function expectTranscription(app: LiveApp, model: string): Promise<void> {
  const res = await withRetry(async () => {
    const form = new FormData();
    form.set('model', model);
    form.set('file', fixtureFile('speech.wav'));
    return app.request('http://localhost/v1/audio/transcriptions', {
      method: 'POST',
      body: form,
    });
  });

  expect(res.status).toBe(200);
  const body = (await res.json()) as TranscriptionBody;
  expect(body.text).toMatch(FIXTURE_FACTS.speech);
}

export async function expectSpeech(app: LiveApp, model: string, voice: string): Promise<void> {
  const res = await postRaw(app, '/v1/audio/speech', {
    model,
    voice,
    input: 'The frog gateway is alive.',
    response_format: 'mp3',
  });

  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('audio');
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect(bytes.length).toBeGreaterThan(500);
}

// ---------------------------------------------------------------------------
// Images + videos.
// ---------------------------------------------------------------------------

type ImagesBody = { data?: Array<{ b64_json?: string }> };

export async function expectImages(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<ImagesBody>(app, '/v1/images/generations', {
    model,
    prompt: 'A minimalist line drawing of a frog',
    n: 1,
    response_format: 'b64_json',
  });

  expect(status).toBe(200);
  expect(body.data?.length).toBe(1);
  const image = body.data?.[0];
  expect(typeof image?.b64_json).toBe('string');
  expect(image!.b64_json!.length).toBeGreaterThan(1000);
}

type VideosBody = { id?: string; data?: Array<{ b64_json?: string }> };

export async function expectVideos(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<VideosBody>(app, '/v1/videos/generations', {
    model,
    prompt: 'A frog hopping across a lily pad, 2 seconds',
    response_format: 'b64_json',
  });

  expect(status).toBe(200);
  expect(typeof body.id).toBe('string');
  expect(body.data?.length).toBeGreaterThan(0);
  const video = body.data?.[0];
  expect(typeof video?.b64_json).toBe('string');
  expect(video!.b64_json!.length).toBeGreaterThan(1000);
}

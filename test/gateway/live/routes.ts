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
  providers,
  type ProviderConfigMap,
} from '../../../packages/gateway/src/providers/registry.js';
import { parseSse } from '../../__helpers/gateway/parse-sse.js';
import { postJson, type JsonResponse } from '../../__helpers/gateway/post-json.js';
import type { LiveProviderEntry } from './matrix.js';

export type LiveApp = Hono;

// ---------------------------------------------------------------------------
// App builder — one gateway app per matrix entry, from env keys.
// ---------------------------------------------------------------------------

export function makeLiveApp(entry: LiveProviderEntry): LiveApp {
  if (entry.compat) {
    const apiKey =
      (entry.compat.apiKeyEnv ? process.env[entry.compat.apiKeyEnv] : undefined) ??
      entry.compat.apiKeyFallback ??
      'public';
    const registry = buildProviderRegistry({}, [
      { name: entry.label, baseURL: entry.compat.baseURL, apiKey },
    ]);
    return createApp({ registry });
  }

  const name = entry.provider;
  if (!name) {
    throw new Error(`matrix entry "${entry.label}" has neither provider nor compat`);
  }
  const cfg = providers[name].fromEnv(process.env);
  if (!cfg) {
    throw new Error(`matrix entry "${entry.label}": env not configured (${providers[name].envVars[0]})`);
  }
  const cfgMap: ProviderConfigMap = {};
  (cfgMap as Record<string, unknown>)[name] = cfg;
  const registry = buildProviderRegistry(cfgMap);
  return createApp({ registry });
}

// ---------------------------------------------------------------------------
// 429 backoff — free tiers throttle; retrying keeps looped runs green.
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T extends { status: number; headers: Headers }>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let last: T | undefined;
  for (let i = 0; i < attempts; i++) {
    last = await fn();
    if (last.status !== 429) {
      return last;
    }
    const retryAfter = Number(last.headers.get('retry-after'));
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
  return withRetry(() =>
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

export async function runChat(app: LiveApp, model: string): Promise<void> {
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

export async function runChatStream(app: LiveApp, model: string): Promise<void> {
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

export async function runMessages(app: LiveApp, model: string): Promise<void> {
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

export async function runMessagesStream(app: LiveApp, model: string): Promise<void> {
  const res = await postRaw(app, '/v1/messages', {
    model,
    messages: [{ role: 'user', content: PROMPT }],
    max_tokens: MAX_TOKENS,
    stream: true,
  });

  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');

  const events = parseSse(await res.text()).map(
    (f) => JSON.parse(f.data) as AnthropicEventData,
  );
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

export async function runResponses(app: LiveApp, model: string): Promise<void> {
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

export async function runResponsesStream(app: LiveApp, model: string): Promise<void> {
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

export async function runEmbeddings(app: LiveApp, model: string): Promise<void> {
  const { status, body } = await post<EmbeddingsBody>(app, '/v1/embeddings', {
    model,
    input: ['The frog jumped over the gateway.', 'A second document.'],
  });

  expect(status).toBe(200);
  expect(body.object).toBe('list');
  expect(body.data?.length).toBe(2);
  for (const item of body.data!) {
    expect(Array.isArray(item.embedding)).toBe(true);
    expect(item.embedding!.length).toBeGreaterThan(10);
    expect(typeof item.embedding![0]).toBe('number');
  }
}

type RerankBody = {
  results?: Array<{ index?: number; relevance_score?: number }>;
};

export async function runRerank(app: LiveApp, model: string): Promise<void> {
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

/** 0.5s 440Hz sine, 16kHz 16-bit mono PCM WAV — a valid, tiny audio fixture. */
export function makeWavFixture(): File {
  const sampleRate = 16_000;
  const seconds = 0.5;
  const sampleCount = Math.floor(sampleRate * seconds);
  const dataBytes = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < sampleCount; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.3;
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }

  return new File([buffer], 'fixture.wav', { type: 'audio/wav' });
}

type TranscriptionBody = { text?: string };

export async function runTranscription(app: LiveApp, model: string): Promise<void> {
  const res = await withRetry(() => {
    const form = new FormData();
    form.set('model', model);
    form.set('file', makeWavFixture());
    return app.request('http://localhost/v1/audio/transcriptions', {
      method: 'POST',
      body: form,
    });
  });

  expect(res.status).toBe(200);
  const body = (await res.json()) as TranscriptionBody;
  // A sine tone transcribes to empty/near-empty text — the contract under
  // test is the envelope, not ASR quality.
  expect(typeof body.text).toBe('string');
}

export async function runSpeech(app: LiveApp, model: string, voice: string): Promise<void> {
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

export async function runImages(app: LiveApp, model: string): Promise<void> {
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

export async function runVideos(app: LiveApp, model: string): Promise<void> {
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

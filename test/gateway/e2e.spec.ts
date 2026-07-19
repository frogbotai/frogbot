// Gateway E2E tests — real provider calls.
//
// Gated by RUN_E2E=1. Expensive modalities have additional RUN_E2E_* gates.
// Requires provider API keys in environment.

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { createApp } from '../../packages/gateway/src/app.js';
import { cohereProvider } from '../../packages/gateway/src/providers/cohere/index.js';
import { falProvider } from '../../packages/gateway/src/providers/fal/index.js';
import { openaiProvider } from '../../packages/gateway/src/providers/openai/index.js';
import { replicateProvider } from '../../packages/gateway/src/providers/replicate/index.js';
import { buildProviderRegistry, type ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { createProviderFixtureFetch, shouldUpdateFixtures } from '../__helpers/gateway/provider-http-fixtures.js';
import { postJson } from '../__helpers/gateway/post-json.js';

const RUN_E2E = process.env.RUN_E2E === '1';
const RUN_E2E_IMAGES = process.env.RUN_E2E_IMAGES === '1';
const RUN_E2E_VIDEO = process.env.RUN_E2E_VIDEO === '1';
const RUN_E2E_SPEECH = process.env.RUN_E2E_SPEECH === '1';
const RUN_E2E_TRANSCRIBE = process.env.RUN_E2E_TRANSCRIBE === '1';
const RUN_E2E_RERANK = process.env.RUN_E2E_RERANK === '1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION;
const GOOGLE_VERTEX_PROJECT = process.env.GOOGLE_VERTEX_PROJECT;
const GOOGLE_VERTEX_LOCATION = process.env.GOOGLE_VERTEX_LOCATION;
const AZURE_API_KEY = process.env.AZURE_API_KEY;
const AZURE_RESOURCE_NAME = process.env.AZURE_RESOURCE_NAME;
const COHERE_API_KEY = process.env.COHERE_API_KEY;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const FAL_API_KEY = process.env.FAL_API_KEY;
const FIXTURES_DIR = join(import.meta.dirname, '__fixtures__');

const describeE2E = RUN_E2E ? describe : describe.skip;

function makeE2EApp(recordScenario?: string) {
  const providers: Record<string, any> = {};
  if (OPENAI_API_KEY) providers.openai = { apiKey: OPENAI_API_KEY };
  if (ANTHROPIC_API_KEY) providers.anthropic = { apiKey: ANTHROPIC_API_KEY };
  if (GROQ_API_KEY) providers.groq = { apiKey: GROQ_API_KEY };
  if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_REGION) {
    providers['amazon-bedrock'] = {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: AWS_REGION,
    };
  }
  if (GOOGLE_VERTEX_PROJECT && GOOGLE_VERTEX_LOCATION) {
    providers.vertex = {
      project: GOOGLE_VERTEX_PROJECT,
      location: GOOGLE_VERTEX_LOCATION,
    };
  }
  if (AZURE_API_KEY && AZURE_RESOURCE_NAME) {
    providers.azure = {
      apiKey: AZURE_API_KEY,
      resourceName: AZURE_RESOURCE_NAME,
    };
  }
  if (COHERE_API_KEY) providers.cohere = { apiKey: COHERE_API_KEY };
  if (VOYAGE_API_KEY) providers.voyage = { apiKey: VOYAGE_API_KEY };
  if (REPLICATE_API_TOKEN) providers.replicate = { apiToken: REPLICATE_API_TOKEN };
  if (FAL_API_KEY) providers.fal = { apiKey: FAL_API_KEY };
  const registry = buildProviderRegistry(providers) as ProviderRegistry;
  if (recordScenario && shouldUpdateFixtures()) {
    const fetch = createProviderFixtureFetch({
      fixturePath: join(FIXTURES_DIR, recordScenario, 'provider-http.json'),
      update: true,
    });
    if (recordScenario.startsWith('openai-') && OPENAI_API_KEY) {
      registry.openai = openaiProvider.build({ apiKey: OPENAI_API_KEY, fetch } as never);
    }
    if (recordScenario.startsWith('cohere-') && COHERE_API_KEY) {
      registry.cohere = cohereProvider.build({ apiKey: COHERE_API_KEY, fetch } as never);
    }
    if (recordScenario.startsWith('replicate-') && REPLICATE_API_TOKEN) {
      registry.replicate = replicateProvider.build({ apiToken: REPLICATE_API_TOKEN, fetch } as never);
    }
    if (recordScenario.startsWith('fal-') && FAL_API_KEY) {
      registry.fal = falProvider.build({ apiKey: FAL_API_KEY, fetch } as never);
    }
  }
  return createApp({ registry });
}

describeE2E('gateway E2E — real providers', () => {
  const app = makeE2EApp();

  if (OPENAI_API_KEY) {
    it('OpenAI non-streaming round-trip', async () => {
      const { status, body } = await postJson(app, '/v1/chat/completions', {
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('choices[0].message.content');
      expect(body).toHaveProperty('usage.prompt_tokens');
    });
  }

  if (ANTHROPIC_API_KEY) {
    it('Anthropic non-streaming round-trip', async () => {
      const { status, body } = await postJson(app, '/v1/messages', {
        model: 'anthropic/claude-haiku-3',
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
        max_tokens: 50,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('content');
      expect(body).toHaveProperty('usage.input_tokens');
    });
  }

  if (OPENAI_API_KEY) {
    it('cross-provider: Anthropic endpoint → OpenAI upstream', async () => {
      const { status, body } = await postJson(app, '/v1/messages', {
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
        max_tokens: 50,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('content');
    });
  }

  // --- M2 Provider sprawl E2E tests ---

  if (GROQ_API_KEY) {
    it('Groq non-streaming round-trip', async () => {
      const { status, body } = await postJson(app, '/v1/chat/completions', {
        model: 'groq/llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('choices[0].message.content');
      expect(body).toHaveProperty('usage');
    });

    it('Groq streaming round-trip', async () => {
      const res = await app.request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'groq/llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Say "hi".' }],
          stream: true,
        }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const text = await res.text();
      expect(text).toContain('data: ');
      expect(text).toContain('[DONE]');
    });
  }

  if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_REGION) {
    it('Bedrock (Claude) non-streaming round-trip', async () => {
      const { status, body } = await postJson(app, '/v1/chat/completions', {
        model: 'amazon-bedrock/anthropic.claude-3-5-haiku-20241022-v1:0',
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('choices[0].message.content');
    });
  }

  if (GOOGLE_VERTEX_PROJECT && GOOGLE_VERTEX_LOCATION) {
    it('Vertex (Gemini) non-streaming round-trip', async () => {
      const { status, body } = await postJson(app, '/v1/chat/completions', {
        model: 'vertex/gemini-2.0-flash',
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('choices[0].message.content');
    });
  }

  if (AZURE_API_KEY && AZURE_RESOURCE_NAME) {
    it('Azure OpenAI non-streaming round-trip', async () => {
      const { status, body } = await postJson(app, '/v1/chat/completions', {
        model: 'azure/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('choices[0].message.content');
    });
  }

  if (OPENAI_API_KEY) {
    it('OpenAI embeddings round-trip', async () => {
      const { status, body } = await postJson(app, '/v1/embeddings', {
        model: 'openai/text-embedding-3-small',
        input: 'hello',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('data[0].embedding');
      expect(body).toHaveProperty('usage.prompt_tokens');
    });
  }

  if (COHERE_API_KEY) {
    it('Cohere embeddings round-trip', async () => {
      const { status, body } = await postJson(app, '/v1/embeddings', {
        model: 'cohere/embed-english-v3.0',
        input: 'hello',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('data[0].embedding');
    });
  }

  if (VOYAGE_API_KEY) {
    it('Voyage embeddings round-trip', async () => {
      const { status, body } = await postJson(app, '/v1/embeddings', {
        model: 'voyage/voyage-3-large',
        input: 'hello',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('data[0].embedding');
    });
  }

  if (RUN_E2E_IMAGES && OPENAI_API_KEY) {
    it('OpenAI image generation round-trip', async () => {
      const app = makeE2EApp('openai-image');
      const { status, body } = await postJson(app, '/v1/images/generations', {
        model: 'openai/dall-e-3',
        prompt: 'a tiny green robot frog icon on a plain white background',
        n: 1,
        response_format: 'b64_json',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('data[0].b64_json');
    });
  }

  if (RUN_E2E_IMAGES && REPLICATE_API_TOKEN) {
    it('Replicate image generation round-trip', async () => {
      const app = makeE2EApp('replicate-image');
      const { status, body } = await postJson(app, '/v1/images/generations', {
        model: 'replicate/black-forest-labs/flux-schnell',
        prompt: 'a tiny green robot frog icon',
        n: 1,
        response_format: 'b64_json',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('data[0].b64_json');
    });
  }

  if (RUN_E2E_IMAGES && FAL_API_KEY) {
    it('Fal image generation round-trip', async () => {
      const app = makeE2EApp('fal-image');
      const { status, body } = await postJson(app, '/v1/images/generations', {
        model: 'fal/imagen4/preview',
        prompt: 'a tiny green robot frog icon',
        n: 1,
        response_format: 'b64_json',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('data[0].b64_json');
    });
  }

  if (RUN_E2E_VIDEO && REPLICATE_API_TOKEN) {
    it('Replicate video generation round-trip', async () => {
      const app = makeE2EApp('replicate-video');
      const { status, body } = await postJson(app, '/v1/videos/generations', {
        model: 'replicate/wan-2.5',
        prompt: 'a tiny green robot frog icon animation',
        response_format: 'url',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('data[0].url');
    });
  }

  if (RUN_E2E_SPEECH && OPENAI_API_KEY) {
    it('OpenAI speech round-trip', async () => {
      const app = makeE2EApp('openai-speech');
      const res = await app.request('/v1/audio/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'openai/tts-1', input: 'hello', voice: 'alloy', response_format: 'mp3' }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('audio/mpeg');
      expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
    });
  }

  if (RUN_E2E_TRANSCRIBE && OPENAI_API_KEY) {
    it('OpenAI transcription round-trip', async () => {
      const app = makeE2EApp('openai-transcription');
      const form = new FormData();
      form.set('model', 'openai/whisper-1');
      form.set('file', new File([new Uint8Array([82, 73, 70, 70])], 'tiny.wav', { type: 'audio/wav' }));
      const res = await app.request('/v1/audio/transcriptions', { method: 'POST', body: form });
      expect(res.status).toBe(200);
      expect(await res.json()).toHaveProperty('text');
    });
  }

  if (RUN_E2E_RERANK && COHERE_API_KEY) {
    it('Cohere rerank round-trip', async () => {
      const app = makeE2EApp('cohere-rerank');
      const { status, body } = await postJson(app, '/v1/rerank', {
        model: 'cohere/rerank-v3.5',
        query: 'frog robot',
        documents: ['frog', 'robot', 'frog robot'],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('results[0].relevance_score');
    });
  }
});

// Gateway golden tests — replay committed SSE fixtures byte-exact through translators.
//
// Each fixture folder under __fixtures__/<scenario>/ contains:
//   - request.json — inbound wire body
//   - provider-http.json — recorded provider HTTP responses replayed through @ai-sdk/* packages
//   - chunks.txt — legacy newline-delimited AI SDK stream parts for pre-M4 fixtures
//   - expected-openai.txt — expected OpenAI SSE output
//   - expected-anthropic.txt — expected Anthropic SSE output
//
// Golden tests verify that translator output exactly matches the committed fixtures.
// When upstream wire formats change, re-record gated E2E fixtures with `RUN_E2E=1 ... --update`.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { createApp } from '../../packages/gateway/src/app.js';
import { cohereProvider } from '../../packages/gateway/src/providers/cohere/index.js';
import { openaiProvider } from '../../packages/gateway/src/providers/openai/index.js';
import { createOpenAIStreamTransform } from '../../packages/gateway/src/routes/chatCompletions/translators/stream.js';
import { createAnthropicStreamTransform } from '../../packages/gateway/src/routes/messages/translators/stream.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { createProviderFixtureFetch, shouldUpdateFixtures } from '../__helpers/gateway/provider-http-fixtures.js';
import { postJson } from '../__helpers/gateway/post-json.js';

import type { TextStreamPart, ToolSet } from 'ai';

const FIXTURES_DIR = join(import.meta.dirname, '__fixtures__');

function loadFixture(scenario: string) {
  const dir = join(FIXTURES_DIR, scenario);
  if (!existsSync(dir)) return null;

  const chunksPath = join(dir, 'chunks.txt');
  const expectedOpenAIPath = join(dir, 'expected-openai.txt');
  const expectedAnthropicPath = join(dir, 'expected-anthropic.txt');

  return {
    chunks: existsSync(chunksPath)
      ? readFileSync(chunksPath, 'utf-8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as TextStreamPart<ToolSet>)
      : [],
    expectedOpenAI: existsSync(expectedOpenAIPath)
      ? readFileSync(expectedOpenAIPath, 'utf-8')
      : null,
    expectedAnthropic: existsSync(expectedAnthropicPath)
      ? readFileSync(expectedAnthropicPath, 'utf-8')
      : null,
  };
}

function loadJsonFixture<T>(scenario: string, filename: string): T {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, scenario, filename), 'utf-8')) as T;
}

function makeOpenAIHttpFixtureApp(scenario: string) {
  const openai = openaiProvider.build({
    apiKey: 'sk-test-golden',
    fetch: createProviderFixtureFetch({
      fixturePath: join(FIXTURES_DIR, scenario, 'provider-http.json'),
      update: shouldUpdateFixtures(),
    }),
  } as never);
  return createApp({ registry: { openai } as ProviderRegistry });
}

function makeCohereHttpFixtureApp(scenario: string) {
  const cohere = cohereProvider.build({
    apiKey: 'co-test-golden',
    fetch: createProviderFixtureFetch({
      fixturePath: join(FIXTURES_DIR, scenario, 'provider-http.json'),
      update: shouldUpdateFixtures(),
    }),
  } as never);
  return createApp({ registry: { cohere } as ProviderRegistry });
}

function getScenarios(): string[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

async function runThroughTransform(
  parts: TextStreamPart<ToolSet>[],
  transform: TransformStream<TextStreamPart<ToolSet>, string>,
): Promise<string> {
  const readable = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });

  const reader = readable.pipeThrough(transform).getReader();
  let output = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += value;
  }
  return output;
}

const scenarios = getScenarios();
const embeddingFixtureProviders = ['openai-embedding', 'cohere-embedding', 'voyage-embedding'];
const imageFixtureProviders = ['openai-image', 'replicate-image', 'fal-image'];
const m4FixtureProviders = {
  video: ['replicate-video', 'fal-video'],
  speech: ['openai-speech', 'elevenlabs-speech'],
  transcription: ['openai-transcription', 'deepgram-transcription'],
  rerank: ['cohere-rerank', 'voyage-rerank'],
};

describe('gateway golden tests', () => {
  if (scenarios.length === 0) {
    it.skip('no fixtures found — add fixtures to test/gateway/__fixtures__/', () => {});
    return;
  }

  for (const scenario of scenarios) {
    describe(scenario, () => {
      const fixture = loadFixture(scenario);
      if (!fixture || fixture.chunks.length === 0) {
        it.skip('fixture missing chunks.txt', () => {});
        return;
      }

      if (fixture.expectedOpenAI) {
        it('OpenAI SSE output matches fixture', async () => {
          const transform = createOpenAIStreamTransform({ model: 'test-model' });
          const output = await runThroughTransform(fixture!.chunks, transform);
          expect(output).toBe(fixture!.expectedOpenAI);
        });
      } else {
        it.skip('OpenAI expected fixture not yet recorded', () => {});
      }

      if (fixture.expectedAnthropic) {
        it('Anthropic SSE output matches fixture', async () => {
          const transform = createAnthropicStreamTransform({ model: 'test-model' });
          const output = await runThroughTransform(fixture!.chunks, transform);
          expect(output).toBe(fixture!.expectedAnthropic);
        });
      } else {
        it.skip('Anthropic expected fixture not yet recorded', () => {});
      }
    });
  }
});

describe('gateway M3 golden fixture coverage', () => {
  it('has embedding golden fixtures for OpenAI, Cohere, and Voyage', () => {
    for (const scenario of embeddingFixtureProviders) {
      expect(existsSync(join(FIXTURES_DIR, scenario, 'request.json'))).toBe(true);
      expect(existsSync(join(FIXTURES_DIR, scenario, 'expected-response.json'))).toBe(true);
    }
  });

  it('has image golden fixtures for OpenAI, Replicate, and Fal', () => {
    for (const scenario of imageFixtureProviders) {
      expect(existsSync(join(FIXTURES_DIR, scenario, 'request.json'))).toBe(true);
      expect(existsSync(join(FIXTURES_DIR, scenario, 'expected-response.json'))).toBe(true);
    }
  });
});

describe('gateway M4 golden fixture coverage', () => {
  for (const [modality, scenarios] of Object.entries(m4FixtureProviders)) {
    it(`has ${modality} golden fixtures for at least two providers`, () => {
      for (const scenario of scenarios) {
        expect(existsSync(join(FIXTURES_DIR, scenario, 'request.json'))).toBe(true);
        expect(existsSync(join(FIXTURES_DIR, scenario, 'expected-response.json'))).toBe(true);
      }
    });
  }

  it('has a public-domain tiny audio transcription fixture', () => {
    expect(existsSync(join(FIXTURES_DIR, 'audio', 'public-domain-tiny.wav'))).toBe(true);
    expect(existsSync(join(FIXTURES_DIR, 'audio', 'LICENSE.txt'))).toBe(true);
  });
});

describe('gateway provider HTTP golden replay', () => {
  it('replays OpenAI embeddings through the real provider package', async () => {
    const scenario = 'openai-embedding';
    const app = makeOpenAIHttpFixtureApp(scenario);
    const { status, body } = await postJson(
      app,
      '/v1/embeddings',
      loadJsonFixture(scenario, 'request.json'),
    );

    expect(status).toBe(200);
    expect(body).toEqual(loadJsonFixture(scenario, 'expected-response.json'));
  });

  it('replays OpenAI images through the real provider package', async () => {
    const scenario = 'openai-image';
    const app = makeOpenAIHttpFixtureApp(scenario);
    const { status, body } = await postJson(
      app,
      '/v1/images/generations',
      loadJsonFixture(scenario, 'request.json'),
    );

    expect(status).toBe(200);
    expect(body).toMatchObject(loadJsonFixture(scenario, 'expected-response.json'));
  });

  it('replays OpenAI speech through the real provider package', async () => {
    const scenario = 'openai-speech';
    const app = makeOpenAIHttpFixtureApp(scenario);
    const res = await app.request('/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(loadJsonFixture(scenario, 'request.json')),
    });
    const expected = loadJsonFixture<{ contentType: string; bytes: number[] }>(scenario, 'expected-response.json');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(expected.contentType);
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual(expected.bytes);
  });

  it('replays OpenAI transcriptions through the real provider package', async () => {
    const scenario = 'openai-transcription';
    const app = makeOpenAIHttpFixtureApp(scenario);
    const request = loadJsonFixture<{ model: string; response_format: string }>(scenario, 'request.json');
    const form = new FormData();
    form.set('model', request.model);
    form.set('response_format', request.response_format);
    form.set(
      'file',
      new File([readFileSync(join(FIXTURES_DIR, 'audio', 'public-domain-tiny.wav'))], 'tiny.wav', {
        type: 'audio/wav',
      }),
    );

    const res = await app.request('/v1/audio/transcriptions', { method: 'POST', body: form });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(loadJsonFixture(scenario, 'expected-response.json'));
  });

  it('replays Cohere rerank through the real provider package', async () => {
    const scenario = 'cohere-rerank';
    const app = makeCohereHttpFixtureApp(scenario);
    const { status, body } = await postJson(
      app,
      '/v1/rerank',
      loadJsonFixture(scenario, 'request.json'),
    );

    expect(status).toBe(200);
    expect(body).toEqual(loadJsonFixture(scenario, 'expected-response.json'));
  });
});

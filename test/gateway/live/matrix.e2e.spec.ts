// Gateway E2E — live provider × route matrix against REAL upstreams.
//
// One declarative table (`matrix.ts`) drives real-model coverage of every
// gateway route: each entry's chat-capable models run through ALL THREE text
// wires (chat/messages/responses, non-stream + stream), plus embeddings,
// rerank, transcriptions, speech, images, and (opt-in) videos where the
// provider supports them.
//
// Key-gated: a provider's suite runs only when its API key env var is set;
// everything else skips cleanly. Zen needs no key.
//
// Run everything you have keys for:
//   RUN_E2E=1 pnpm vitest run --project=gateway-e2e test/gateway/live/matrix.e2e.spec.ts
//
// Filters:
//   E2E_TIER=free|paid        only that tier (default: all)
//   E2E_PROVIDERS=groq,google only those matrix labels
//   E2E_ROUTES=chat,rerank    only those routes
//                             (chat|messages|responses|embeddings|rerank|
//                              transcriptions|speech|images|videos)
//   E2E_VIDEOS=1              enable video generation (costs real money)
//
// Free tiers throttle hard — the runners retry 429s with backoff, and this
// file runs tests sequentially, so it is safe to run on a loop.

import { describe, it } from 'vitest';

import { LIVE_MATRIX, type LiveProviderEntry, type LiveRoute } from './matrix.js';
import {
  makeLiveApp,
  runChat,
  runChatStream,
  runEmbeddings,
  runImages,
  runMessages,
  runMessagesStream,
  runRerank,
  runResponses,
  runResponsesStream,
  runSpeech,
  runTranscription,
  runVideos,
  type LiveApp,
} from './routes.js';

const RUN_E2E = process.env.RUN_E2E === '1';
const TEST_TIMEOUT = 120_000;

function csvFilter(envVar: string): Set<string> | undefined {
  const raw = process.env[envVar];
  if (!raw) {
    return undefined;
  }
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

const tierFilter = process.env.E2E_TIER; // 'free' | 'paid' | undefined
const providerFilter = csvFilter('E2E_PROVIDERS');
const routeFilter = csvFilter('E2E_ROUTES');
const videosEnabled = process.env.E2E_VIDEOS === '1';

function entryEnabled(entry: LiveProviderEntry): boolean {
  if (!RUN_E2E) {
    return false;
  }
  if (entry.envKey && !process.env[entry.envKey]) {
    return false;
  }
  if (tierFilter && entry.tier !== tierFilter) {
    return false;
  }
  if (providerFilter && !providerFilter.has(entry.label)) {
    return false;
  }
  return true;
}

function routeEnabled(route: LiveRoute): boolean {
  if (routeFilter && !routeFilter.has(route)) {
    return false;
  }
  if (route === 'videos' && !videosEnabled) {
    return false;
  }
  return true;
}

for (const entry of LIVE_MATRIX) {
  const enabled = entryEnabled(entry);

  describe.skipIf(!enabled)(`live matrix — ${entry.label} (${entry.tier})`, () => {
    // Lazy: building the app reads env keys, which only exist when enabled.
    let app: LiveApp | undefined;
    const getApp = () => (app ??= makeLiveApp(entry));

    for (const model of entry.text ?? []) {
      const id = `${entry.label}/${model}`;

      describe.skipIf(!routeEnabled('chat'))(`${model} — /v1/chat/completions`, () => {
        it('non-streaming', () => runChat(getApp(), id), TEST_TIMEOUT);
        it('streaming', () => runChatStream(getApp(), id), TEST_TIMEOUT);
      });

      describe.skipIf(!routeEnabled('messages'))(`${model} — /v1/messages`, () => {
        it('non-streaming', () => runMessages(getApp(), id), TEST_TIMEOUT);
        it('streaming', () => runMessagesStream(getApp(), id), TEST_TIMEOUT);
      });

      describe.skipIf(!routeEnabled('responses'))(`${model} — /v1/responses`, () => {
        it('non-streaming', () => runResponses(getApp(), id), TEST_TIMEOUT);
        it('streaming', () => runResponsesStream(getApp(), id), TEST_TIMEOUT);
      });
    }

    for (const model of entry.embeddings ?? []) {
      describe.skipIf(!routeEnabled('embeddings'))(`${model} — /v1/embeddings`, () => {
        it('embeds documents', () => runEmbeddings(getApp(), `${entry.label}/${model}`), TEST_TIMEOUT);
      });
    }

    for (const model of entry.rerank ?? []) {
      describe.skipIf(!routeEnabled('rerank'))(`${model} — /v1/rerank`, () => {
        it('reranks documents', () => runRerank(getApp(), `${entry.label}/${model}`), TEST_TIMEOUT);
      });
    }

    for (const model of entry.transcriptions ?? []) {
      describe.skipIf(!routeEnabled('transcriptions'))(`${model} — /v1/audio/transcriptions`, () => {
        it('transcribes a WAV upload', () => runTranscription(getApp(), `${entry.label}/${model}`), TEST_TIMEOUT);
      });
    }

    for (const spec of entry.speech ?? []) {
      describe.skipIf(!routeEnabled('speech'))(`${spec.model} — /v1/audio/speech`, () => {
        it('returns audio bytes', () => runSpeech(getApp(), `${entry.label}/${spec.model}`, spec.voice), TEST_TIMEOUT);
      });
    }

    for (const model of entry.images ?? []) {
      describe.skipIf(!routeEnabled('images'))(`${model} — /v1/images/generations`, () => {
        it('generates an image', () => runImages(getApp(), `${entry.label}/${model}`), TEST_TIMEOUT);
      });
    }

    for (const model of entry.videos ?? []) {
      describe.skipIf(!routeEnabled('videos'))(`${model} — /v1/videos/generations`, () => {
        it('generates a video', () => runVideos(getApp(), `${entry.label}/${model}`), 600_000);
      });
    }
  });
}

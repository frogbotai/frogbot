import { describe, it } from 'vitest';

import { describeLive } from '../../live/live.js';
import { routeEnabled, selectedEntries } from './matrix.js';
import {
  type LiveApp,
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
} from './routes.js';
import { type CacheWire, runPromptCache } from './userScenarios.js';

const TEXT_TIMEOUT = 120_000;
const MEDIA_TIMEOUT = 600_000;

const CACHE_WIRES: CacheWire[] = ['chat', 'chat-stream', 'messages-stream', 'responses-stream'];

describe.concurrent('live matrix', () => {
  for (const entry of selectedEntries()) {
    describeLive(`live matrix: ${entry.label}`, entry, () => {
      let app: LiveApp | undefined;

      const getApp = () => (app ??= makeLiveApp(entry));

      if (entry.text) {
        const { model, features } = entry.text;
        const id = `${entry.label}/${model}`;

        describe.skipIf(!routeEnabled('chat'))(`${model}: /v1/chat/completions`, () => {
          it('answers a prompt', () => runChat(getApp(), id), TEXT_TIMEOUT);
          it('streams an answer', () => runChatStream(getApp(), id), TEXT_TIMEOUT);
        });

        describe.skipIf(!routeEnabled('messages'))(`${model}: /v1/messages`, () => {
          it('answers a prompt', () => runMessages(getApp(), id), TEXT_TIMEOUT);
          it('streams an answer', () => runMessagesStream(getApp(), id), TEXT_TIMEOUT);
        });

        describe.skipIf(!routeEnabled('responses'))(`${model}: /v1/responses`, () => {
          it('answers a prompt', () => runResponses(getApp(), id), TEXT_TIMEOUT);
          it('streams an answer', () => runResponsesStream(getApp(), id), TEXT_TIMEOUT);
        });

        describe.skipIf(!routeEnabled('cache') || !features.includes('cache'))(
          `${model}: prompt cache`,
          () => {
            for (const wire of CACHE_WIRES) {
              it(
                `reuses a cached system prompt on ${wire}`,
                () => runPromptCache(getApp(), id, wire),
                TEXT_TIMEOUT,
              );
            }
          },
        );
      }

      for (const model of entry.embeddings ?? []) {
        it.skipIf(!routeEnabled('embeddings'))(
          `${model}: embeddings rank the relevant document closest`,
          () => runEmbeddings(getApp(), `${entry.label}/${model}`),
          TEXT_TIMEOUT,
        );
      }

      for (const model of entry.rerank ?? []) {
        it.skipIf(!routeEnabled('rerank'))(
          `${model}: rerank puts the relevant document first`,
          () => runRerank(getApp(), `${entry.label}/${model}`),
          TEXT_TIMEOUT,
        );
      }

      for (const model of entry.transcriptions ?? []) {
        it.skipIf(!routeEnabled('transcriptions'))(
          `${model}: transcribes recorded speech`,
          () => runTranscription(getApp(), `${entry.label}/${model}`),
          MEDIA_TIMEOUT,
        );
      }

      for (const spec of entry.speech ?? []) {
        it.skipIf(!routeEnabled('speech'))(
          `${spec.model}: speaks text as audio`,
          () => runSpeech(getApp(), `${entry.label}/${spec.model}`, spec.voice),
          MEDIA_TIMEOUT,
        );
      }

      for (const model of entry.images ?? []) {
        it.skipIf(!routeEnabled('images'))(
          `${model}: generates an image`,
          () => runImages(getApp(), `${entry.label}/${model}`),
          MEDIA_TIMEOUT,
        );
      }

      for (const model of entry.videos ?? []) {
        it.skipIf(!routeEnabled('videos'))(
          `${model}: generates a video`,
          () => runVideos(getApp(), `${entry.label}/${model}`),
          MEDIA_TIMEOUT,
        );
      }
    });
  }
});

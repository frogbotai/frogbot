import { describe, it } from 'vitest';

import { describeLive } from '../../live/live.js';
import { routeEnabled, selectedEntries } from './matrix.js';
import {
  expectChat,
  expectChatStream,
  expectEmbeddings,
  expectImages,
  expectMessages,
  expectMessagesStream,
  expectRerank,
  expectResponses,
  expectResponsesStream,
  expectSpeech,
  expectTranscription,
  expectVideos,
  type LiveApp,
  makeLiveApp,
} from './routes.js';
import { type CacheWire, expectPromptCache } from './userScenarios.js';

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
          it('answers a prompt', () => expectChat(getApp(), id), TEXT_TIMEOUT);
          it('streams an answer', () => expectChatStream(getApp(), id), TEXT_TIMEOUT);
        });

        describe.skipIf(!routeEnabled('messages'))(`${model}: /v1/messages`, () => {
          it('answers a prompt', () => expectMessages(getApp(), id), TEXT_TIMEOUT);
          it('streams an answer', () => expectMessagesStream(getApp(), id), TEXT_TIMEOUT);
        });

        describe.skipIf(!routeEnabled('responses'))(`${model}: /v1/responses`, () => {
          it('answers a prompt', () => expectResponses(getApp(), id), TEXT_TIMEOUT);
          it('streams an answer', () => expectResponsesStream(getApp(), id), TEXT_TIMEOUT);
        });

        describe.skipIf(!routeEnabled('cache') || !features.includes('cache'))(
          `${model}: prompt cache`,
          () => {
            for (const wire of CACHE_WIRES) {
              it(
                `reuses a cached system prompt on ${wire}`,
                () => expectPromptCache(getApp(), id, wire),
                TEXT_TIMEOUT,
              );
            }
          },
        );
      }

      for (const model of entry.embeddings ?? []) {
        it.skipIf(!routeEnabled('embeddings'))(
          `${model}: embeddings rank the relevant document closest`,
          () => expectEmbeddings(getApp(), `${entry.label}/${model}`),
          TEXT_TIMEOUT,
        );
      }

      for (const model of entry.rerank ?? []) {
        it.skipIf(!routeEnabled('rerank'))(
          `${model}: rerank puts the relevant document first`,
          () => expectRerank(getApp(), `${entry.label}/${model}`),
          TEXT_TIMEOUT,
        );
      }

      for (const model of entry.transcriptions ?? []) {
        it.skipIf(!routeEnabled('transcriptions'))(
          `${model}: transcribes recorded speech`,
          () => expectTranscription(getApp(), `${entry.label}/${model}`),
          MEDIA_TIMEOUT,
        );
      }

      for (const spec of entry.speech ?? []) {
        it.skipIf(!routeEnabled('speech'))(
          `${spec.model}: speaks text as audio`,
          () => expectSpeech(getApp(), `${entry.label}/${spec.model}`, spec.voice),
          MEDIA_TIMEOUT,
        );
      }

      for (const model of entry.images ?? []) {
        it.skipIf(!routeEnabled('images'))(
          `${model}: generates an image`,
          () => expectImages(getApp(), `${entry.label}/${model}`),
          MEDIA_TIMEOUT,
        );
      }

      for (const model of entry.videos ?? []) {
        it.skipIf(!routeEnabled('videos'))(
          `${model}: generates a video`,
          () => expectVideos(getApp(), `${entry.label}/${model}`),
          MEDIA_TIMEOUT,
        );
      }
    });
  }
});

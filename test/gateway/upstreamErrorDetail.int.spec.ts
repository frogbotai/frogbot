import { Writable } from 'node:stream';

import { APICallError } from '@ai-sdk/provider';
import { MockLanguageModelV4, MockProviderV4 } from 'ai/test';
import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { GatewayLogger } from '../../packages/gateway/src/observability/logger.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';

function capturePino(): { logger: GatewayLogger; lines: () => Array<Record<string, unknown>> } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const logger = pino({ level: 'trace' }, stream) as unknown as GatewayLogger;
  const lines = () =>
    chunks
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, lines };
}

describe('upstream error detail', () => {
  it('logs APICallError detail in production without changing the client envelope bytes', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { logger, lines } = capturePino();
      const responseBody = JSON.stringify({
        error: {
          message: 'Forbidden',
          type: 'permission_error',
          code: 'permission_denied',
          param: null,
        },
      });
      const error = new APICallError({
        message: 'Forbidden',
        url: 'https://api.example.test/v1/chat/completions',
        requestBodyValues: {},
        statusCode: 403,
        responseHeaders: { 'x-request-id': 'upstream-request' },
        responseBody,
        isRetryable: false,
        data: JSON.parse(responseBody),
      });
      const app = createApp({
        logger,
        registry: {
          openai: new MockProviderV4({
            languageModels: {
              model: new MockLanguageModelV4({ doGenerate: () => Promise.reject(error) }),
            },
          }),
        } as unknown as ProviderRegistry,
      });

      const response = await app.request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/model',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });

      expect(response.status).toBe(403);
      expect(await response.text()).toBe(responseBody);
      expect(
        lines().find((line) => line.msg === 'request-error' && line.phase === 'upstream'),
      ).toMatchObject({
        level: 50,
        error: {
          name: 'AI_APICallError',
          message: 'Forbidden',
          statusCode: 403,
          url: 'https://api.example.test/v1/chat/completions',
          responseHeaders: { 'x-request-id': 'upstream-request' },
          isRetryable: false,
          data: JSON.parse(responseBody),
          responseBody,
        },
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});

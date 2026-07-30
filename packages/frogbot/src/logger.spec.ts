import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import type { Logger } from './frogbot.js';

function capturePino(): { logger: Logger; lines: () => Array<Record<string, unknown>> } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const logger: Logger = pino({ level: 'trace' }, stream);
  const lines = () =>
    chunks
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, lines };
}

describe('Logger', () => {
  it('serializes object-first fields with a real pino logger', () => {
    const { logger, lines } = capturePino();

    logger.info({ provider: 'openai', durationMs: 12 }, 'request-end');

    expect(lines()[0]).toMatchObject({
      level: 30,
      provider: 'openai',
      durationMs: 12,
      msg: 'request-end',
    });
  });

  it('demonstrates that string-first fields are discarded by pino', () => {
    const { logger, lines } = capturePino();

    logger.info('request-end', { provider: 'openai' });

    expect(lines()[0]).toMatchObject({ level: 30, msg: 'request-end' });
    expect(lines()[0]).not.toHaveProperty('provider');
  });
});

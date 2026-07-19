import type { Logger as PinoLogger } from 'pino';
import pino from 'pino';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { AfterErrorHookArgs, AfterOperationHookArgs, BeforeUpstreamHookArgs } from '../hooks.js';
import { createAiSdkWarningLogger, createLogger, createLoggingHooks, type GatewayLogger } from './logger.js';

const base = {
  operation: 'responses' as const,
  requestId: 'req_123',
  startedAt: 10,
  context: {},
  otel: {},
  model: 'openai/gpt-4o',
  provider: 'openai',
};

function captureLogger() {
  const entries: Array<{ level: 'info' | 'error'; obj: unknown; msg: string }> = [];
  const logger = {
    info: (obj: unknown, msg: string) => entries.push({ level: 'info', obj, msg }),
    error: (obj: unknown, msg: string) => entries.push({ level: 'error', obj, msg }),
  } as unknown as GatewayLogger;
  return { entries, logger };
}

describe('GatewayLogger structural compatibility', () => {
  it('accepts a pino.Logger with no adapter (Payload embedding requirement)', () => {
    // Compile-time proof: pino.Logger (== Payload's PayloadLogger) extends
    // GatewayLogger, so `createGateway({ logger: payload.logger })` type-checks
    // with no adapter.
    expectTypeOf<PinoLogger>().toExtend<GatewayLogger>();
    const pinoLogger = null as unknown as PinoLogger;
    const asGateway: GatewayLogger = pinoLogger;
    expect(asGateway).toBe(pinoLogger);
  });
});

describe('createLogger (console default)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emits structured JSON with level, time, and message', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger({ level: 'trace' });

    logger.info({ requestId: 'req_1' }, 'hello');
    logger.warn('bare');

    const first = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(first).toMatchObject({ level: 'info', msg: 'hello', requestId: 'req_1' });
    expect(typeof first.time).toBe('number');

    const second = JSON.parse(spy.mock.calls[1]?.[0] as string);
    expect(second).toMatchObject({ level: 'warn', msg: 'bare' });
  });

  it('suppresses levels below the configured threshold', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger({ level: 'warn' });

    logger.trace('t');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    const levels = spy.mock.calls.map((c) => JSON.parse(c[0] as string).level);
    expect(levels).toEqual(['warn', 'error']);
  });

  it('silences all output at level "silent"', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger({ level: 'silent' });

    logger.info('x');
    logger.error('y');
    logger.fatal('z');

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('createLoggingHooks', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('logs request start and end with structured request metadata', async () => {
    const { entries, logger } = captureLogger();
    const hooks = createLoggingHooks(logger);

    await hooks.beforeUpstream?.[0]?.({
      ...base,
      phase: 'beforeUpstream',
      messages: [],
      params: {},
      headers: new Headers(),
      providerOptions: {},
    } satisfies BeforeUpstreamHookArgs);
    await hooks.afterOperation?.[0]?.({
      ...base,
      phase: 'afterOperation',
      durationMs: 12,
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    } satisfies AfterOperationHookArgs);

    expect(entries).toMatchObject([
      {
        level: 'info',
        msg: 'request-start',
        obj: {
          requestId: 'req_123',
          operation: 'responses',
          modality: 'chat',
          provider: 'openai',
          model: 'openai/gpt-4o',
        },
      },
      {
        level: 'info',
        msg: 'request-end',
        obj: {
          requestId: 'req_123',
          durationMs: 12,
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        },
      },
    ]);
  });

  it('logs full cause chains outside production', async () => {
    process.env.NODE_ENV = 'development';
    const { entries, logger } = captureLogger();
    const hooks = createLoggingHooks(logger);
    const error = new Error('outer', { cause: new Error('inner') });

    await hooks.afterError?.[0]?.({
      ...base,
      phase: 'afterError',
      failedPhase: 'beforeUpstream',
      error,
    } satisfies AfterErrorHookArgs);

    expect(entries[0]).toMatchObject({
      level: 'error',
      msg: 'request-error',
      obj: {
        requestId: 'req_123',
        phase: 'beforeUpstream',
        error: {
          name: 'Error',
          message: 'outer',
          cause: { name: 'Error', message: 'inner' },
        },
      },
    });
  });

  it('masks production error details', async () => {
    process.env.NODE_ENV = 'production';
    const { entries, logger } = captureLogger();
    const hooks = createLoggingHooks(logger);

    await hooks.afterError?.[0]?.({
      ...base,
      phase: 'afterError',
      failedPhase: 'beforeUpstream',
      error: new Error('secret'),
    } satisfies AfterErrorHookArgs);

    expect(entries[0]).toMatchObject({
      level: 'error',
      msg: 'request-error',
      obj: {
        requestId: 'req_123',
        phase: 'beforeUpstream',
      },
    });
    expect(entries[0]?.obj).not.toHaveProperty('error');
  });
});

describe('createLoggingHooks with a real pino instance', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  function capturePino(): { logger: GatewayLogger; lines: () => Array<Record<string, unknown>> } {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const logger = pino({ level: 'trace' }, stream) as unknown as GatewayLogger;
    const lines = () =>
      chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>);
    return { logger, lines };
  }

  it('serializes lifecycle entries with pino level numbers and request metadata', async () => {
    const { logger, lines } = capturePino();
    const hooks = createLoggingHooks(logger);

    await hooks.beforeUpstream?.[0]?.({
      ...base,
      phase: 'beforeUpstream',
      messages: [],
      params: {},
      headers: new Headers(),
      providerOptions: {},
    } satisfies BeforeUpstreamHookArgs);
    await hooks.afterOperation?.[0]?.({
      ...base,
      phase: 'afterOperation',
      durationMs: 12,
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    } satisfies AfterOperationHookArgs);

    const [start, end] = lines();
    expect(start).toMatchObject({
      level: 30,
      msg: 'request-start',
      requestId: 'req_123',
      operation: 'responses',
      modality: 'chat',
      provider: 'openai',
      model: 'openai/gpt-4o',
    });
    expect(end).toMatchObject({
      level: 30,
      msg: 'request-end',
      requestId: 'req_123',
      durationMs: 12,
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    });
  });

  it('serializes error name/message/stack at level 50 outside production', async () => {
    process.env.NODE_ENV = 'development';
    const { logger, lines } = capturePino();
    const hooks = createLoggingHooks(logger);

    await hooks.afterError?.[0]?.({
      ...base,
      phase: 'afterError',
      failedPhase: 'beforeUpstream',
      error: new Error('boom', { cause: new Error('root') }),
    } satisfies AfterErrorHookArgs);

    const [entry] = lines();
    expect(entry).toMatchObject({
      level: 50,
      msg: 'request-error',
      requestId: 'req_123',
      phase: 'beforeUpstream',
    });
    const err = entry.error as Record<string, unknown>;
    expect(err.name).toBe('Error');
    expect(err.message).toBe('boom');
    expect(typeof err.stack).toBe('string');
    expect((err.cause as Record<string, unknown>).message).toBe('root');
  });

  it('masks the error property in production mode', async () => {
    process.env.NODE_ENV = 'production';
    const { logger, lines } = capturePino();
    const hooks = createLoggingHooks(logger);

    await hooks.afterError?.[0]?.({
      ...base,
      phase: 'afterError',
      failedPhase: 'beforeUpstream',
      error: new Error('secret'),
    } satisfies AfterErrorHookArgs);

    const [entry] = lines();
    expect(entry).toMatchObject({ level: 50, msg: 'request-error', requestId: 'req_123', phase: 'beforeUpstream' });
    expect(entry).not.toHaveProperty('error');
  });
});

describe('createAiSdkWarningLogger', () => {
  it('calls logger.warn once per warning with provider, model, and warning payload', () => {
    const warn = vi.fn();
    const logger = { warn } as unknown as GatewayLogger;
    const fn = createAiSdkWarningLogger(logger);

    fn({
      warnings: [
        { type: 'unsupported', feature: 'streaming' },
        { type: 'other', message: 'something unexpected' },
      ],
      provider: 'openai',
      model: 'gpt-4o',
    });

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(1, { provider: 'openai', model: 'gpt-4o', warning: { type: 'unsupported', feature: 'streaming' } }, 'ai-sdk-unsupported');
    expect(warn).toHaveBeenNthCalledWith(2, { provider: 'openai', model: 'gpt-4o', warning: { type: 'other', message: 'something unexpected' } }, 'ai-sdk-other');
  });

  it('does not throw when warnings array is empty', () => {
    const warn = vi.fn();
    const fn = createAiSdkWarningLogger({ warn } as unknown as GatewayLogger);
    expect(() => fn({ warnings: [] })).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('swallows logger errors so a failing logger never propagates', () => {
    const fn = createAiSdkWarningLogger({
      warn: () => { throw new Error('logger exploded'); },
    } as unknown as GatewayLogger);
    expect(() => fn({ warnings: [{ type: 'other', message: 'x' }] })).not.toThrow();
  });
});

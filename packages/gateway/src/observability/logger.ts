import type { LogWarningsFunction } from 'ai';

import { unwrapRetryError } from '../errors/unwrapRetryError.js';
import type { AfterErrorHookArgs, HookOperation, Hooks } from '../hooks.js';
import { readEnv } from '../shared/runtimeDetection.js';

/**
 * Structural, zero-dependency log function. Overloads mirror pino's `LogFn`
 * so that a `pino.Logger` (e.g. Payload's `payload.logger`) is directly
 * assignable to {@link GatewayLogger} with no adapter.
 */
export type LogFn = {
  (obj: Record<string, unknown>, msg?: string): void;
  (msg: string): void;
};

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

/**
 * The logger contract the gateway depends on. Deliberately a subset of
 * `pino.Logger`'s method surface, so hosts can pass any pino logger (Payload's
 * included) straight through. Non-pino hosts can satisfy it with a few methods.
 */
export type GatewayLogger = {
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
};

export type LoggerOptions = {
  level?: LogLevel;
};

const LEVEL: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
};

const noop: LogFn = () => {};
const responseBodyLimit = 2048;
const textEncoder = new TextEncoder();

const defaultLevel = (): LogLevel => {
  const env = readEnv('LOG_LEVEL') as LogLevel | undefined;
  return env && env in LEVEL ? env : 'info';
};

function makeLogFn(level: Exclude<LogLevel, 'silent'>): LogFn {
  return (first: Record<string, unknown> | string, msg?: string) => {
    const entry =
      typeof first === 'string'
        ? { level, time: Date.now(), msg: first }
        : { level, time: Date.now(), msg, ...first };
    console.log(JSON.stringify(entry));
  };
}

/**
 * Console-backed default logger. Zero dependencies, WinterCG-safe, emits
 * structured JSON. Levels below the configured threshold are no-ops.
 */
export function createLogger(options: LoggerOptions = {}): GatewayLogger {
  const threshold = LEVEL[options.level ?? defaultLevel()];
  const at = (level: Exclude<LogLevel, 'silent'>): LogFn =>
    LEVEL[level] >= threshold ? makeLogFn(level) : noop;
  return {
    trace: at('trace'),
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    fatal: at('fatal'),
  };
}

const operationModality: Record<HookOperation, string> = {
  'chat.completions': 'chat',
  messages: 'chat',
  responses: 'chat',
  embeddings: 'embeddings',
  images: 'images',
  speech: 'audio',
  transcriptions: 'audio',
  videos: 'videos',
  rerank: 'rerank',
};

export function createLoggingHooks(logger: GatewayLogger = createLogger()): Hooks {
  return {
    beforeUpstream: [
      (args) => {
        logger.info(baseLog(args), 'request-start');
      },
    ],
    afterError: [
      (args) => {
        logger.error(errorLog(args), 'request-error');
      },
    ],
    afterOperation: [
      (args) => {
        logger.info(
          {
            ...baseLog(args),
            durationMs: args.durationMs,
            finishReason: args.finishReason,
            usage: args.usage,
            error: args.error ? true : undefined,
          },
          'request-end',
        );
      },
    ],
  };
}

/**
 * Logs an error at the HTTP-envelope layer, before/independent of the
 * operation-scoped hook lifecycle. Pre-resolution failures (malformed JSON,
 * schema 400s, unknown-model 404s, `beforeOperation` auth rejections) never
 * reach `beforeUpstream`, so the logging hooks never fire — this is the only
 * signal an operator gets for those (G101 / OB12). 4xx logs at `warn`, 5xx at
 * `error`.
 */
export function logGatewayError(
  logger: GatewayLogger,
  args: { requestId: string; status: number; path: string; error: unknown },
): void {
  const isError = args.error instanceof Error;
  const rawMessage = isError ? (args.error as Error).message : String(args.error);
  const entry = {
    requestId: args.requestId,
    status: args.status,
    path: args.path,
    errorType: isError ? (args.error as Error).name : undefined,
    message: rawMessage,
  };
  logger[args.status >= 500 ? 'error' : 'warn'](entry, 'request-error');
}

function baseLog(args: {
  requestId: string;
  operation: HookOperation;
  provider: string;
  model: string;
}) {
  return {
    requestId: args.requestId,
    operation: args.operation,
    modality: operationModality[args.operation],
    provider: args.provider,
    model: args.model,
  };
}

function errorLog(args: AfterErrorHookArgs) {
  const base = {
    ...baseLog(args),
    phase: args.failedPhase,
  };
  return {
    ...base,
    error: serializeError(unwrapRetryError(args.error)),
  };
}

function serializeError(error: unknown, seen = new WeakSet<object>()): unknown {
  if (!(error instanceof Error)) return serializeValue(error, seen);
  if (seen.has(error)) return '[Circular]';
  seen.add(error);
  const serialized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  for (const key of Object.keys(error)) {
    try {
      const value = (error as unknown as Record<string, unknown>)[key];
      serialized[key] =
        key === 'responseBody' && typeof value === 'string'
          ? truncateResponseBody(value)
          : serializeValue(value, seen);
    } catch {
      serialized[key] = '[Unserializable]';
    }
  }
  if (error.cause) serialized.cause = serializeValue(error.cause, seen);
  return serialized;
}

function serializeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'undefined') return value;
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
    return String(value);
  }
  if (value instanceof Error) return serializeError(value, seen);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => serializeValue(item, seen));
  if (value instanceof Date) return value.toJSON();
  if (value instanceof URL) return value.toString();
  const serialized: Record<string, unknown> = {};
  try {
    for (const key of Object.keys(value)) {
      try {
        serialized[key] = serializeValue((value as Record<string, unknown>)[key], seen);
      } catch {
        serialized[key] = '[Unserializable]';
      }
    }
  } catch {
    return '[Unserializable]';
  }
  return serialized;
}

function truncateResponseBody(value: string): string {
  if (textEncoder.encode(value).byteLength <= responseBodyLimit) return value;
  let length = 0;
  let truncated = '';
  for (const character of value) {
    const characterLength = textEncoder.encode(character).byteLength;
    if (length + characterLength > responseBodyLimit) break;
    truncated += character;
    length += characterLength;
  }
  return truncated;
}

/**
 * Returns a {@link LogWarningsFunction} that routes every AI SDK warning
 * through the gateway's structured logger. Assign to
 * `globalThis.AI_SDK_LOG_WARNINGS` at bootstrap to suppress the SDK's default
 * `process.emitWarning` / `console.warn` fallback.
 *
 * Ground truth: ai@7.0.4/packages/ai/src/logger/log-warnings.ts:110 —
 * `globalThis.AI_SDK_LOG_WARNINGS` is the only documented customisation point.
 */
export function createAiSdkWarningLogger(logger: GatewayLogger): LogWarningsFunction {
  return ({ warnings, provider, model }) => {
    for (const warning of warnings) {
      try {
        logger.warn({ provider, model, warning }, `ai-sdk-${warning.type}`);
      } catch {
        /* logger errors must not propagate out of the SDK warning path */
      }
    }
  };
}

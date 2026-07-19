import type { LogWarningsFunction } from 'ai';

import type { AfterErrorHookArgs, HookOperation, Hooks } from '../hooks.js';
import { isProduction, readEnv } from '../shared/runtimeDetection.js';
import { maybeMaskMessage } from '../errors/maskMessage.js';

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

const defaultLevel = (): LogLevel => {
  const env = readEnv('LOG_LEVEL') as LogLevel | undefined;
  return env && env in LEVEL ? env : 'info';
};

function makeLogFn(level: Exclude<LogLevel, 'silent'>): LogFn {
  return (first: Record<string, unknown> | string, msg?: string) => {
    const entry = typeof first === 'string' ? { level, time: Date.now(), msg: first } : { level, time: Date.now(), msg, ...first };
    console.log(JSON.stringify(entry));
  };
}

/**
 * Console-backed default logger. Zero dependencies, WinterCG-safe, emits
 * structured JSON. Levels below the configured threshold are no-ops.
 */
export function createLogger(options: LoggerOptions = {}): GatewayLogger {
  const threshold = LEVEL[options.level ?? defaultLevel()];
  const at = (level: Exclude<LogLevel, 'silent'>): LogFn => (LEVEL[level] >= threshold ? makeLogFn(level) : noop);
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
        logger.info({
          ...baseLog(args),
          durationMs: args.durationMs,
          finishReason: args.finishReason,
          usage: args.usage,
          error: args.error ? true : undefined,
        }, 'request-end');
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
 * `error`; the message is masked in production for 5xx (reuses the envelope's
 * masking contract).
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
    message: maybeMaskMessage(rawMessage, { status: args.status, requestId: args.requestId, production: isProduction() }),
  };
  const log = args.status >= 500 ? logger.error : logger.warn;
  log(entry, 'request-error');
}

function baseLog(args: { requestId: string; operation: HookOperation; provider: string; model: string }) {
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
  if (isProduction()) return base;
  return {
    ...base,
    error: serializeError(args.error),
  };
}

function serializeError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause ? serializeError(error.cause) : undefined,
  };
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
      } catch { /* logger errors must not propagate out of the SDK warning path */ }
    }
  };
}

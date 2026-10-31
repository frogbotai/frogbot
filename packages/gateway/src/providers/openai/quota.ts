import { APICallError } from '@ai-sdk/provider';

import { wrapModelCalls } from '../callCredential.js';

function isQuotaError(error: APICallError): boolean {
  const matches = (value: unknown): boolean => {
    const detail = (value as { error?: { code?: unknown; type?: unknown } } | undefined)?.error;

    return detail?.code === 'insufficient_quota' || detail?.type === 'insufficient_quota';
  };

  if (matches(error.data)) return true;

  try {
    return matches(JSON.parse(error.responseBody ?? ''));
  } catch {
    return false;
  }
}

function noQuotaRetry(error: unknown): unknown {
  if (
    !APICallError.isInstance(error) ||
    error.statusCode !== 429 ||
    !error.isRetryable ||
    !isQuotaError(error)
  ) {
    return error;
  }

  return new APICallError({
    message: error.message,
    url: error.url,
    requestBodyValues: error.requestBodyValues,
    statusCode: error.statusCode,
    responseHeaders: error.responseHeaders,
    responseBody: error.responseBody,
    cause: error.cause,
    isRetryable: false,
    data: error.data,
  });
}

function isModel(value: unknown): value is object {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { specificationVersion?: unknown }).specificationVersion === 'string'
  );
}

function withNoQuotaRetry(value: unknown): unknown {
  if (!isModel(value)) return value;

  return wrapModelCalls(value, async ({ run }) => {
    try {
      return await run(value);
    } catch (error) {
      throw noQuotaRetry(error);
    }
  });
}

/**
 * OpenAI answers an account with no credit with a 429 `insufficient_quota`. Retrying it can't
 * help, so every model this provider builds rethrows it as not retryable; other 429s still retry.
 */
export function withOpenAIQuota<T extends object>(provider: T): T {
  return new Proxy(provider, {
    apply: (target, self, args) =>
      withNoQuotaRetry(Reflect.apply(target as (...args: unknown[]) => unknown, self, args)),
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);

      if (typeof value !== 'function') return value;

      return (...args: unknown[]) =>
        withNoQuotaRetry((value as (...args: unknown[]) => unknown).apply(target, args));
    },
  });
}

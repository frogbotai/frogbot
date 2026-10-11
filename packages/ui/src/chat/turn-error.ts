import type { TurnErrorCode } from '@frogbotai/protocol';
import { APICallError } from 'ai';

export function turnErrorCode(error: unknown): TurnErrorCode | undefined {
  return readErrorBody(error)?.code;
}

export function toChatError(error: Error): Error {
  const message = readErrorBody(error)?.error;

  return typeof message === 'string' && message ? new Error(message, { cause: error }) : error;
}

function readErrorBody(error: unknown) {
  if (!APICallError.isInstance(error) || !error.responseBody) return undefined;

  try {
    return JSON.parse(error.responseBody) as { code?: TurnErrorCode; error?: unknown };
  } catch {
    return undefined;
  }
}

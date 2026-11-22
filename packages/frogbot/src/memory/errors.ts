export type MemoryErrorCode = 'invalid' | 'limit' | 'not-found' | 'unavailable';

/** Thrown by memory adapters and by `frogbot.memory`. Core maps `code` to a REST status and a tool result. */
export class MemoryAdapterError extends Error {
  readonly code: MemoryErrorCode;

  constructor(code: MemoryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MemoryAdapterError';
    this.code = code;
  }
}

export function isMemoryAdapterError(error: unknown): error is MemoryAdapterError {
  return error instanceof Error && error.name === 'MemoryAdapterError' && 'code' in error;
}

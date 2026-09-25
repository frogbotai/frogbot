export type TurnErrorCode =
  | 'already-settled'
  | 'call-not-found'
  | 'forbidden'
  | 'invalid-output'
  | 'not-awaiting'
  | 'not-found'
  | 'not-queued'
  | 'pending-calls'
  | 'turn-in-progress'
  | 'write-conflict';

const statuses: Record<TurnErrorCode, 400 | 403 | 404 | 409> = {
  'already-settled': 409,
  'call-not-found': 404,
  forbidden: 403,
  'invalid-output': 400,
  'not-awaiting': 409,
  'not-found': 404,
  'not-queued': 409,
  'pending-calls': 409,
  'turn-in-progress': 409,
  'write-conflict': 409,
};

export class TurnError extends Error {
  readonly code: TurnErrorCode;
  readonly status: 400 | 403 | 404 | 409;

  constructor(code: TurnErrorCode, message: string) {
    super(message);

    this.name = 'TurnError';
    this.code = code;
    this.status = statuses[code];
  }
}

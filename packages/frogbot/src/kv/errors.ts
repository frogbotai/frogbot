export class KVUnsupportedError extends Error {
  constructor() {
    super('This KV adapter does not support atomic coordination or expiration');
    this.name = 'KVUnsupportedError';
  }
}

export class KVLockContentionError extends Error {
  constructor(key: string) {
    super(`KV lock is already held: ${key}`);
    this.name = 'KVLockContentionError';
  }
}

export class KVLeaseLostError extends Error {
  constructor(key: string) {
    super(`KV lock lease was lost: ${key}`);
    this.name = 'KVLeaseLostError';
  }
}

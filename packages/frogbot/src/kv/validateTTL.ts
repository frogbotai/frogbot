export function validateKVTTL(ttl: number): void {
  if (!Number.isSafeInteger(ttl) || ttl <= 0) {
    throw new RangeError('KV ttl must be a positive safe integer in milliseconds');
  }
}

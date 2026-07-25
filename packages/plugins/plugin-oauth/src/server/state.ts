import { randomBytes } from 'node:crypto';

export function createOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

export function createOAuthStateExpiration({ now = new Date(), ttlMs = 10 * 60 * 1000 }: { now?: Date; ttlMs?: number } = {}): Date {
  return new Date(now.getTime() + ttlMs);
}

export function isOAuthStateExpired({ expiresAt, now = new Date() }: { expiresAt: Date | string; now?: Date }): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

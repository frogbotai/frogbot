import { createHash, randomBytes } from 'node:crypto';

export type ApiKeyTokenOptions = {
  tokenPrefix?: string;
};

export type ApiKeyHeaderOptions = {
  headerNames?: string[];
};

export function createApiKeyToken({ tokenPrefix = 'fb' }: ApiKeyTokenOptions = {}): string {
  return `${tokenPrefix}_${randomBytes(32).toString('base64url')}`;
}

export function hashApiKeyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getApiKeyPrefix(token: string): string {
  return token.slice(0, 12);
}

function isApiKeyToken(value: string, { tokenPrefix = 'fb' }: ApiKeyTokenOptions = {}): boolean {
  const prefix = tokenPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`^${prefix}_[A-Za-z0-9_-]{43}$`).test(value);
}

export function extractApiKeyToken(
  headers: Headers,
  { headerNames = ['x-api-key'], tokenPrefix }: ApiKeyHeaderOptions & ApiKeyTokenOptions = {},
): string | null {
  const bearer = headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  const candidates = [bearer, ...headerNames.map((headerName) => headers.get(headerName)?.trim())];

  return candidates.find((value) => value && isApiKeyToken(value, { tokenPrefix })) ?? null;
}

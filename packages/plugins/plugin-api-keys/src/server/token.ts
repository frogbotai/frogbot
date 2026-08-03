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

export function extractApiKeyToken(
  headers: Headers,
  { headerNames = ['x-api-key'] }: ApiKeyHeaderOptions = {},
): string | null {
  const authorization = headers.get('authorization');
  const bearer = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (bearer) return bearer;

  for (const headerName of headerNames) {
    const value = headers.get(headerName)?.trim();
    if (value && !/\s/.test(value)) return value;
  }

  return null;
}

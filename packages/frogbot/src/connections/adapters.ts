import { createSign } from 'node:crypto';

import type { CredentialType } from '../types/piece.js';
import type { AppConnectionValue } from './api.js';

const serviceAccountCache = new Map<string, { value: AppConnectionValue; expiresAt: number }>();

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

export async function adaptCredential(type: Exclude<CredentialType, 'none'>, credentials: Record<string, unknown>): Promise<AppConnectionValue> {
  if (type === 'secret_text') return String(credentials.value ?? credentials.apiKey ?? Object.values(credentials)[0] ?? '');
  if (type === 'basic_auth') return { username: String(credentials.username ?? ''), password: String(credentials.password ?? '') };
  if (type === 'oauth2') return { type: 'OAUTH2', ...credentials };
  if (type !== 'service_account') return credentials;

  const clientEmail = String(credentials.clientEmail ?? credentials.client_email ?? '');
  const privateKey = String(credentials.privateKey ?? credentials.private_key ?? '').replace(/\\n/g, '\n');
  const tokenUri = String(credentials.tokenUri ?? credentials.token_uri ?? 'https://oauth2.googleapis.com/token');
  const scopes = Array.isArray(credentials.scopes) ? credentials.scopes.map(String) : [];
  const subject = typeof credentials.subject === 'string' ? credentials.subject : undefined;
  const cacheKey = JSON.stringify([clientEmail, privateKey, tokenUri, scopes, subject]);
  const cached = serviceAccountCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({ iss: clientEmail, scope: scopes.join(' '), aud: tokenUri, iat: now, exp: now + 3600, ...(subject ? { sub: subject } : {}) }));
  const unsigned = `${header}.${claims}`;
  const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url')}`;
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`[frogbot] Service account token exchange failed: ${response.status}.`);
  const token = await response.json() as { access_token: string; expires_in?: number };
  const value = { type: 'OAUTH2' as const, access_token: token.access_token };
  serviceAccountCache.set(cacheKey, { value, expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000 });
  return value;
}

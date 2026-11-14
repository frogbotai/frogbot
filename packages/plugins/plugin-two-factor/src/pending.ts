import { createHash, randomBytes } from 'node:crypto';

import type { FrogBotRequest } from 'frogbot';
import { parseCookies } from 'payload/shared';

import { routes, TEN_MINUTES } from './context.js';

/** A sign-in paused for a code or setup, kept in kv under a hash of its cookie's random id. */
export type PendingSignIn = {
  userId: string | number;
  method: string;
  mode: 'code' | 'setup';
  response: 'page' | 'json';
  returnTo?: string;
  secret?: string;
  confirmed?: boolean;
  expiresAt: number;
};

const key = (slug: string, id: string) =>
  `two-factor:pending:${JSON.stringify([slug, createHash('sha256').update(id).digest('hex')])}`;

function cookie(req: FrogBotRequest, slug: string, value: string, maxAge: number): string {
  const { base, secure, cookiePrefix } = routes(req, slug);

  return `${cookiePrefix}-two-factor=${value}; Path=${base}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** The `set-cookie` value that removes the pending sign-in cookie. */
export const clearPendingCookie = (req: FrogBotRequest, slug: string) => cookie(req, slug, '', 0);

/** Stores a pending sign-in for ten minutes and returns the cookie that holds its id. */
export async function createPending({
  req,
  slug,
  pending,
}: {
  req: FrogBotRequest;
  slug: string;
  pending: Omit<PendingSignIn, 'expiresAt'>;
}): Promise<string> {
  const id = randomBytes(32).toString('base64url');

  await req.frogbot.kv.set(
    key(slug, id),
    { ...pending, expiresAt: Date.now() + TEN_MINUTES },
    { ttl: TEN_MINUTES },
  );

  return cookie(req, slug, id, TEN_MINUTES / 1000);
}

/** The pending sign-in this request's cookie points to, unless it expired. */
export async function readPending(
  req: FrogBotRequest,
  slug: string,
): Promise<{ id: string; pending: PendingSignIn } | null> {
  const id = parseCookies(req.headers).get(`${routes(req, slug).cookiePrefix}-two-factor`);
  if (!id) return null;

  const pending = (await req.frogbot.kv.get(key(slug, id))) as PendingSignIn | null;

  return pending && pending.expiresAt > Date.now() ? { id, pending } : null;
}

export async function updatePending(
  req: FrogBotRequest,
  slug: string,
  id: string,
  pending: PendingSignIn,
): Promise<void> {
  const ttl = pending.expiresAt - Date.now();

  if (ttl > 0) await req.frogbot.kv.set(key(slug, id), pending, { ttl });
}

export async function deletePending(req: FrogBotRequest, slug: string, id: string): Promise<void> {
  await req.frogbot.kv.delete(key(slug, id));
}

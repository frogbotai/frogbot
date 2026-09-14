import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { githubAuth } from './config.js';

const apiOrigin = 'https://api.github.com';
const forbiddenHeaders = new Set([
  'authorization',
  'proxy-authorization',
  'host',
  'cookie',
  'content-length',
  'transfer-encoding',
]);

type QueryValue = boolean | number | string | undefined;
type RequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal | null;
};

function apiUrl(path: string) {
  if (/[\s\\\p{Cc}]/u.test(path) || path.startsWith('//')) {
    throw new Error('URL must target the GitHub API.');
  }

  let rawPath = path;

  for (let index = 0; index < 3; index++) {
    if (rawPath.split('/').some((part) => part === '.' || part === '..')) {
      throw new Error('URL must target the GitHub API.');
    }

    const decoded = decodeURIComponent(rawPath);
    if (decoded === rawPath) break;

    rawPath = decoded;
  }

  const url = new URL(path.startsWith('/') ? `${apiOrigin}${path}` : path);

  if (url.origin !== apiOrigin || url.username || url.password || url.hash) {
    throw new Error('URL must target the GitHub API.');
  }

  let decoded = url.pathname;

  for (let index = 0; index < 3; index++) {
    decoded = decodeURIComponent(decoded);

    if (
      decoded.split('/').some((part) => part === '.' || part === '..') ||
      /[\\\p{Cc}]/u.test(decoded)
    ) {
      throw new Error('URL must target the GitHub API.');
    }

    if (!/%[\da-f]{2}/i.test(decoded)) break;
  }

  return url;
}

export type GithubClient = ReturnType<typeof createGithubClient>;

export function createGithubClient({ auth }: { auth: unknown }) {
  const { accessToken } = githubAuth.parse(auth);

  async function request<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options: RequestOptions = {},
  ): Promise<z.output<TSchema>> {
    const url = apiUrl(path);

    Object.entries(options.query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });

    const headers = new Headers(options.headers);

    for (const name of headers.keys()) {
      if (forbiddenHeaders.has(name.toLowerCase())) {
        throw new Error('Authentication and transport headers cannot be overridden.');
      }
    }

    headers.set('accept', headers.get('accept') ?? 'application/vnd.github+json');
    headers.set('authorization', `Bearer ${accessToken}`);
    headers.set('x-github-api-version', '2022-11-28');

    if (options.body !== undefined) headers.set('content-type', 'application/json');

    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'manual',
      signal: options.signal ?? undefined,
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error('GitHub API redirects are not allowed.');
    }

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`GitHub request failed (${response.status}): ${text || response.statusText}`);
    }

    const value: unknown = text ? JSON.parse(text) : {};

    return schema.parse(value);
  }

  async function listAll<TSchema extends z.ZodType>(path: string, item: TSchema) {
    const output: z.output<TSchema>[] = [];

    for (let page = 1; ; page++) {
      const values = await request(path, z.array(item), { query: { page, per_page: 100 } });

      output.push(...values);

      if (values.length < 100) return output;
    }
  }

  return {
    request,
    listAll,
    verify(body: Buffer, signature: string | null, secret: string) {
      if (!signature?.startsWith('sha256=')) return false;

      const supplied = signature.slice(7);
      if (!/^[\da-f]{64}$/i.test(supplied)) return false;

      const expected = createHmac('sha256', secret).update(body).digest();
      const actual = Buffer.from(supplied, 'hex');

      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
  };
}

export const githubApiUrl = apiUrl;
export const githubForbiddenHeaders = forbiddenHeaders;

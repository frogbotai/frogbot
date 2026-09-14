import { z } from 'zod';

import { xeroAuth } from './config.js';

const accountingBaseUrl = 'https://api.xero.com/api.xro/2.0';
const projectsBaseUrl = 'https://api.xero.com/projects.xro/2.0';
const identityBaseUrl = 'https://identity.xero.com';
const connectionsBaseUrl = 'https://api.xero.com';

const errorBody = z.union([
  z.object({ ErrorNumber: z.number().optional(), Message: z.string().optional() }).passthrough(),
  z.object({ title: z.string().optional(), detail: z.string().optional() }).passthrough(),
  z.string(),
]);

export class XeroRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: z.output<typeof errorBody>,
  ) {
    super(`Xero request failed with status ${status}.`);
    this.name = 'XeroRequestError';
  }
}

export type XeroJSON =
  boolean | null | number | string | XeroJSON[] | { [key: string]: XeroJSON | undefined };

type XeroRequest = {
  path: string;
  tenantId?: string;
  method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
  body?: BodyInit | XeroJSON;
  headers?: Record<string, string>;
  query?: Record<string, boolean | number | string | undefined>;
  signal?: AbortSignal;
  base?: 'accounting' | 'connections' | 'identity' | 'projects';
};

function requestBase(value: string): URL {
  const url = new URL(`${value}/`);

  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Xero API base URL is invalid.');
  }

  return url;
}

function requestBody(value: XeroRequest['body']): { body?: BodyInit; json: boolean } {
  if (value === undefined) return { json: false };

  if (
    typeof value === 'string' ||
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ArrayBuffer ||
    value instanceof ReadableStream
  ) {
    return { body: value, json: false };
  }

  if (ArrayBuffer.isView(value)) {
    return { body: new Blob([value]), json: false };
  }

  return { body: JSON.stringify(value), json: true };
}

export type XeroClient = ReturnType<typeof createXeroClient>;

export function createXeroClient({ auth }: { auth: unknown }) {
  const { accessToken } = xeroAuth.parse(auth);

  async function request<TSchema extends z.ZodType>(input: XeroRequest, schema: TSchema) {
    if (!input.path.startsWith('/') || input.path.startsWith('//')) {
      throw new Error('Xero request paths must be relative.');
    }

    const baseUrl =
      input.base === 'connections'
        ? connectionsBaseUrl
        : input.base === 'projects'
          ? projectsBaseUrl
          : input.base === 'identity'
            ? identityBaseUrl
            : accountingBaseUrl;
    const base = requestBase(baseUrl);
    const url = new URL(input.path.slice(1), base);

    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      throw new Error('Xero request path escapes its API base.');
    }

    Object.entries(input.query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });

    const serialized = requestBody(input.body);
    const response = await fetch(url, {
      method: input.method ?? 'GET',
      headers: {
        ...input.headers,
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(serialized.json ? { 'Content-Type': 'application/json' } : {}),
        ...(input.tenantId ? { 'Xero-Tenant-Id': input.tenantId } : {}),
      },
      body: serialized.body,
      signal: input.signal,
      redirect: 'error',
    });
    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : null;

    if (!response.ok) throw new XeroRequestError(response.status, errorBody.parse(data));

    return schema.parse(data);
  }

  async function listTenants(signal?: AbortSignal) {
    return request(
      { base: 'connections', path: '/connections', signal },
      z.array(z.object({ tenantId: z.string(), tenantName: z.string() })),
    );
  }

  return { listTenants, request };
}

export const xeroIdentity = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
});

export const xeroRecord = z.object({}).catchall(z.json());
export const xeroResponse = z.object({}).catchall(z.union([z.json(), z.array(z.json())]));

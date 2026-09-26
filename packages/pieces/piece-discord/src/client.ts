import { z } from 'zod';

import { discordAuth, type discordOptions } from './config.js';

const defaultApiUrl = 'https://discord.com/api/v10';

export type DiscordRequest = {
  method?: string;
  path: string;
  body?: BodyInit | Record<string, unknown>;
  headers?: HeadersInit;
  authenticated?: boolean;
};

export type DiscordClient = ReturnType<typeof createDiscordClient>;

export function discordApiUrl(apiUrl?: string): string | undefined {
  return apiUrl?.replace(/\/+$/, '');
}

async function parseResponse(response: Response) {
  const text = await response.text();

  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createDiscordClient({
  auth,
  options,
}: {
  auth: unknown;
  options?: Pick<z.output<typeof discordOptions>, 'apiUrl'>;
}) {
  const { botToken } = discordAuth.parse(auth);
  const apiUrl = discordApiUrl(options?.apiUrl) ?? defaultApiUrl;

  async function request({
    method = 'GET',
    path,
    body,
    headers,
    authenticated = true,
  }: DiscordRequest) {
    const requestHeaders = new Headers(headers);
    let requestBody = body as BodyInit | undefined;

    if (authenticated) requestHeaders.set('authorization', `Bot ${botToken}`);

    if (body !== undefined && !(body instanceof FormData) && typeof body !== 'string') {
      requestHeaders.set('content-type', 'application/json');
      requestBody = JSON.stringify(body);
    }

    const response = await fetch(path.startsWith('https://') ? path : `${apiUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: requestBody,
    });
    const result = await parseResponse(response);

    if (!response.ok) {
      const detail =
        result && typeof result === 'object' && 'message' in result
          ? String(result.message)
          : response.statusText;

      throw new Error(`Discord request failed (${response.status}): ${detail}`);
    }

    return { status: response.status, headers: Object.fromEntries(response.headers), body: result };
  }

  return { request };
}

export const discordObject = z.record(z.string(), z.unknown());
export const discordResponse = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.unknown(),
});

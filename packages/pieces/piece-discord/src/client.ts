import { z } from 'zod';

import { discordAuth, type discordOptions } from './config.js';

const defaultApiUrl = 'https://discord.com/api/v10';

export type DiscordRequest = {
  method?: string;
  path: string;
  body?: BodyInit | Record<string, unknown>;
  headers?: HeadersInit;
  authenticated?: boolean;
  redirect?: RequestRedirect;
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
  const { origin } = new URL(apiUrl);

  function checkOrigin(url: URL) {
    if (url.origin !== origin) {
      throw new Error(`[frogbot] Discord request URL must stay on ${origin}.`);
    }
  }

  async function request({
    method = 'GET',
    path,
    body,
    headers,
    authenticated = true,
    redirect,
  }: DiscordRequest) {
    const requestHeaders = new Headers(headers);
    let requestBody = body as BodyInit | undefined;

    if (authenticated) requestHeaders.set('authorization', `Bot ${botToken}`);

    if (body !== undefined && !(body instanceof FormData) && typeof body !== 'string') {
      requestHeaders.set('content-type', 'application/json');
      requestBody = JSON.stringify(body);
    }

    const url = path.startsWith('https://') ? path : `${apiUrl}${path}`;

    if (authenticated) checkOrigin(new URL(url));

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      redirect,
    });

    if (redirect === 'manual' && response.status >= 300 && response.status < 400) {
      throw new Error(
        `Discord API redirected (${response.status}) to ${response.headers.get('location')}.`,
      );
    }

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

  function authorize(url: URL, headers: Headers) {
    checkOrigin(url);
    headers.set('authorization', `Bot ${botToken}`);
  }

  return { apiUrl, request, authorize };
}

export const discordObject = z.record(z.string(), z.unknown());

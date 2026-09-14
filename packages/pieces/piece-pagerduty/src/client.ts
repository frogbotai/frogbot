import { pagerdutyAuth } from './config.js';

const baseUrl = 'https://api.pagerduty.com';

type Query = Record<string, string | string[] | undefined>;

export type PagerdutyClient = ReturnType<typeof createPagerdutyClient>;

export function createPagerdutyClient({ auth }: { auth: unknown }) {
  const { apiKey } = pagerdutyAuth.parse(auth);

  async function request({
    method,
    path,
    query,
    body,
    fromEmail,
  }: {
    method: string;
    path: string;
    query?: Query;
    body?: unknown;
    fromEmail?: string;
  }) {
    const url = new URL(path, baseUrl);

    if (url.origin !== baseUrl || !path.startsWith('/') || path.startsWith('//')) {
      throw new Error('Path must target the PagerDuty API.');
    }

    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value === undefined || value === '') return;

      for (const item of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(key, item);
      }
    });

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Token token=${apiKey}`,
        Accept: 'application/vnd.pagerduty+json;version=2',
        'Content-Type': 'application/json',
        ...(fromEmail ? { From: fromEmail } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;

    if (!response.ok) {
      throw new Error(
        `PagerDuty request failed with ${response.status}: ${text || response.statusText}`,
      );
    }

    return data;
  }

  return { request };
}

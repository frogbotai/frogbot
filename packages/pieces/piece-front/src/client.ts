import { frontAuth } from './config.js';

const baseUrl = 'https://api2.frontapp.com';

export type FrontResponse = Record<string, unknown>;

export type FrontClient = {
  request: (method: string, path: string, body?: BodyInit | object) => Promise<FrontResponse>;
};

export function createFrontClient({ auth }: { auth: unknown }): FrontClient {
  const { apiToken } = frontAuth.parse(auth);

  return {
    async request(method, path, body) {
      const url = new URL(path, baseUrl);

      if (url.origin !== baseUrl) throw new Error('Path must target the Front API.');

      const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');

        throw new Error(`Front request failed (${response.status})${detail ? `: ${detail}` : ''}`);
      }

      if (response.status === 204) return {};

      return (await response.json()) as FrontResponse;
    },
  };
}

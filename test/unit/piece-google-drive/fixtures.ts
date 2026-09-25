import type { FrogBotRequest } from 'frogbot';
import { vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));
vi.mock(
  '@frogbotai/piece-google',
  () => import('../../../packages/pieces/piece-google/src/index.js'),
);

import { createGoogleDrive } from '../../../packages/pieces/piece-google-drive/src/index.js';

export const auth = { accessToken: 'drive-access', refreshToken: 'must-not-refresh' };
export const metadata = { id: 'file', name: 'report.txt', mimeType: 'text/plain' };

export type NetworkRequest = {
  url: URL;
  method: string;
  headers: Headers;
  body: Buffer;
  signal?: AbortSignal | null;
  redirect?: RequestRedirect;
};
export type Route = (request: NetworkRequest) => Response | Promise<Response>;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function networkFixture(route: Route = () => json(metadata)) {
  const requests: NetworkRequest[] = [];
  const network = vi.fn<typeof fetch>(async (url, options) => {
    const request: NetworkRequest = {
      url: new URL(url instanceof Request ? url.url : String(url)),
      method: options?.method ?? 'GET',
      headers: new Headers(options?.headers),
      body: Buffer.from(await new Response(options?.body).arrayBuffer()),
      signal: options?.signal,
      redirect: options?.redirect,
    };
    requests.push(request);
    return route(request);
  });
  return { requests, network };
}

export async function fixture(route?: Route) {
  const findByID = vi.fn().mockResolvedValue({
    id: 'source',
    url: '/api/files/source/report.txt',
    filename: 'report.txt',
    mimeType: 'text/plain',
  });
  const create = vi.fn().mockResolvedValue({ id: 'saved', url: '/api/files/saved/report.txt' });
  const controller = new AbortController();
  const req = {
    url: 'https://app.test/api',
    headers: new Headers({ authorization: 'Bearer app-token', cookie: 'session=private' }),
    signal: controller.signal,
    user: null,
    frogbot: {
      config: {
        files: { slug: 'files' },
        _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
      },
      findByID,
      create,
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: {} }) },
    },
  } as unknown as FrogBotRequest;
  const drive = createGoogleDrive({ auth });
  const client = await drive.client({ req });
  const oauth = client.context._options.auth;
  if (!oauth || typeof oauth !== 'object' || !('transporter' in oauth)) {
    throw new Error('Expected Google OAuth transport.');
  }
  const { requests, network } = networkFixture(route);
  oauth.transporter.defaults.fetchImplementation = network;
  return { drive, client, oauth, req, controller, requests, network, findByID, create };
}

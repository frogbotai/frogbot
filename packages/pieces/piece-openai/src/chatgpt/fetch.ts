import { promisify } from 'node:util';
import { zstdCompress } from 'node:zlib';

const compress = promisify(zstdCompress);

/** Request bodies above this size are sent zstd-compressed, as OpenCode does on a plan. */
export const COMPRESS_ABOVE_BYTES = 1024 * 1024;

/** `fetch` for plan calls: compresses large JSON bodies with zstd. */
export async function chatgptFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const body = init?.body;

  if (typeof body !== 'string' || Buffer.byteLength(body) <= COMPRESS_ABOVE_BYTES) {
    return fetch(input, init);
  }

  const headers = new Headers(init?.headers);

  headers.set('content-encoding', 'zstd');

  return fetch(input, { ...init, headers, body: new Uint8Array(await compress(body)) });
}

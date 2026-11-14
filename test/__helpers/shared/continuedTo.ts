import { expect } from 'vitest';

/** Where a callback's continue page sends the browser, through a same-origin refresh. */
export async function continuedTo(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');

  const url = /<meta http-equiv="refresh" content="0;url=([^"]*)">/.exec(
    await response.text(),
  )?.[1];

  return url?.replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
}

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

vi.mock(
  '@frogbotai/piece-google',
  () => import('../../../packages/pieces/piece-google/src/index.js'),
);

import {
  callRawRequest,
  type RawRequestRow,
  rawRequestRowName,
  rawRequestRows,
} from './rawRequestRows.js';

type Sent = { url: string; init: RequestInit };

const sent: Sent[] = [];

function respond(body: () => BodyInit | null, init: ResponseInit = {}) {
  vi.stubGlobal('fetch', (input: URL | string, init2: RequestInit = {}) => {
    sent.push({ url: String(input), init: init2 });

    return Promise.resolve(new Response(body(), init));
  });
}

const jsonHeaders = { 'content-type': 'application/json' };

const table = rawRequestRows.map((row) => [rawRequestRowName(row), row] as const);

async function call(
  row: RawRequestRow,
  input: Record<string, unknown> = {},
  frogbot?: Record<string, unknown>,
  signal?: AbortSignal,
) {
  sent.length = 0;

  return callRawRequest(row, input, frogbot, signal);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe.each(table)('%s follows the customApiCall contract', (_name, row) => {
  it('returns the envelope for 200 JSON', async () => {
    respond(() => JSON.stringify({ ok: true, value: 1 }), {
      headers: { ...jsonHeaders, 'X-Request-Id': 'r1' },
    });

    const { result, error } = await call(row);

    expect(error).toBeUndefined();
    expect(result).toEqual({
      status: 200,
      headers: { ...jsonHeaders, 'x-request-id': 'r1' },
      body: { ok: true, value: 1 },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.init.redirect).toBe('manual');
    expect(sent[0]?.init.signal).toBeInstanceOf(AbortSignal);
    expect(row.origins).toContain(new URL(sent[0]?.url ?? '').origin);
  });

  it('returns null for 204 and an empty 200, and text for text', async () => {
    respond(() => null, { status: 204 });

    expect((await call(row)).result).toEqual({ status: 204, headers: {}, body: null });

    respond(() => '', { status: 200, headers: jsonHeaders });

    expect((await call(row)).result).toEqual({ status: 200, headers: jsonHeaders, body: null });

    respond(() => 'hello', { headers: { 'content-type': 'text/plain' } });

    expect((await call(row)).result).toEqual({
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    });
  });

  it('saves a binary response as a file', async () => {
    respond(() => new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
    const create = vi.fn(() => Promise.resolve({ id: 9, url: '/api/files/file/out.png' }));

    const { result, error } = await call(
      row,
      { responseType: 'binary', fileName: 'out.png' },
      { config: { files: { slug: 'files' } }, create },
    );

    expect(error).toBeUndefined();
    expect(result).toEqual({
      status: 200,
      headers: { 'content-type': 'image/png' },
      body: {
        id: 9,
        name: 'out.png',
        mimeType: 'image/png',
        size: 3,
        url: '/api/files/file/out.png',
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'files', overrideAccess: false }),
    );
  });

  it('throws on 404 and returns the envelope with failsafe', async () => {
    respond(() => JSON.stringify({ error: 'missing' }), { status: 404, headers: jsonHeaders });

    const { error } = await call(row);

    expect(error).toMatch(/^\[frogbot\] .+ API request failed \(404\): \{"error":"missing"\}$/);

    expect((await call(row, { failsafe: true })).result).toEqual({
      status: 404,
      headers: jsonHeaders,
      body: { error: 'missing' },
    });
  });

  it('refuses a 302', async () => {
    respond(() => null, { status: 302, headers: { location: 'https://x.test/' } });

    expect((await call(row)).error).toMatch(/ API redirected \(302\) to https:\/\/x\.test\/\.$/);
    expect(sent).toHaveLength(1);
  });

  it('repeats array query values', async () => {
    respond(() => '{}', { headers: jsonHeaders });

    await call(row, { query: { a: [1, 2] } });

    expect(new URL(sent[0]?.url ?? '').searchParams.getAll('a')).toEqual(['1', '2']);
  });

  it('aborts with the request signal and times out', async () => {
    respond(() => '{}', { headers: jsonHeaders });
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));

    expect((await call(row, {}, {}, controller.signal)).error).toBe('cancelled');
    expect(sent).toEqual([]);

    vi.stubGlobal(
      'fetch',
      (_input: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
        }),
    );

    expect((await call(row, { timeoutSeconds: 0.01 })).error).toMatch(
      / API request timed out after 0\.01 seconds\.$/,
    );
  });

  it.each(['https://x.test/', '//x.test/', '/\\x.test/', '@x.test/', '/a/../b'])(
    'refuses the path %j before fetch',
    async (path) => {
      respond(() => '{}', { headers: jsonHeaders });

      const { error } = await call(row, { path });

      expect(error).toMatch(/^\[frogbot\] .+ custom API path must be relative to the .+ API\.$/);
      expect(sent).toEqual([]);
    },
  );

  it('refuses a caller Authorization header before fetch', async () => {
    respond(() => '{}', { headers: jsonHeaders });

    const { error } = await call(row, { headers: { Authorization: 'Bearer other' } });

    expect(error).toMatch(/custom API calls cannot set the 'Authorization' header\.$/);
    expect(sent).toEqual([]);
  });
});

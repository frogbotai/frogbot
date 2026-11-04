import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { AsanaError, createAsana } from '../../../packages/pieces/piece-asana/src/index.js';
import { api, body, calls, json, req, stubAsana } from './fixtures.js';

const asana = createAsana({});
const item = z.object({ gid: z.string() });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Asana client', () => {
  it('sends the bearer token, wraps bodies in { data } and unwraps { data }', async () => {
    stubAsana(() => json({ data: { gid: '1', extra: true } }, 201));

    const client = await asana.client({ req: req() });
    const result = await client.data(item, { method: 'POST', path: '/tasks', body: { name: 'A' } });

    expect(result).toEqual({ gid: '1' });
    expect(calls[0]).toMatchObject({ url: `${api}/tasks`, method: 'POST' });
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer asana-token');
    expect(body(calls[0])).toEqual({ data: { name: 'A' } });
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });

  it("throws Asana's error messages with the status", async () => {
    stubAsana(() =>
      json({ errors: [{ message: 'project: Not a recognized ID' }, { message: 'Second' }] }, 400),
    );

    const client = await asana.client({ req: req() });
    const error = await client
      .data(item, { path: '/projects/9' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AsanaError);
    expect(error).toMatchObject({
      status: 400,
      message: 'Asana request failed (400): project: Not a recognized ID; Second',
    });
  });

  it('waits Retry-After seconds on a 429, then succeeds', async () => {
    vi.useFakeTimers();

    let attempt = 0;

    stubAsana(() =>
      ++attempt === 1 ? json({}, 429, { 'retry-after': '2' }) : json({ data: { gid: '1' } }),
    );

    const client = await asana.client({ req: req() });
    const pending = client.data(item, { path: '/users/me' });

    await vi.advanceTimersByTimeAsync(1999);

    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ gid: '1' });
    expect(calls).toHaveLength(2);
  });

  it("throws the fourth 429 with Asana's message", async () => {
    stubAsana(() =>
      json({ errors: [{ message: 'You have made too many requests recently.' }] }, 429, {
        'retry-after': '0',
      }),
    );

    const client = await asana.client({ req: req() });
    const error = await client.data(item, { path: '/users/me' }).catch((caught: unknown) => caught);

    expect(calls).toHaveLength(4);
    expect(error).toMatchObject({
      status: 429,
      message: 'Asana request failed (429): You have made too many requests recently.',
    });
  });

  it('stops waiting when the request aborts', async () => {
    stubAsana(() => json({}, 429, { 'retry-after': '60' }));

    const controller = new AbortController();
    const client = await asana.client({ req: req() });
    const pending = client.data(item, { path: '/users/me', signal: controller.signal });

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    controller.abort(new Error('Stopped.'));

    await expect(pending).rejects.toThrow('Stopped.');
    expect(calls).toHaveLength(1);
  });
});

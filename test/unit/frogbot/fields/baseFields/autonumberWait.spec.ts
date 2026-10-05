import type { DatabaseAdapter } from 'payload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitForAutonumber } from '../../../../../packages/frogbot/src/fields/baseFields/autonumber/counter.js';

function fakeDB(findOne: ReturnType<typeof vi.fn>) {
  return { findOne } as unknown as DatabaseAdapter;
}

describe('waitForAutonumber', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks for the counter every 250 ms and resolves when it appears', async () => {
    const findOne = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 1, key: 'tickets.number', value: 7 });

    const wait = waitForAutonumber({ collection: 'tickets', path: 'number', db: fakeDB(findOne) });

    await vi.advanceTimersByTimeAsync(249);

    expect(findOne).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(501);

    expect(findOne).toHaveBeenCalledTimes(3);
    expect(findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({
        collection: 'frogbot-autonumbers',
        where: { key: { equals: 'tickets.number' } },
      }),
    );
    await expect(wait).resolves.toBeUndefined();
  });

  it('throws a ValidationError naming the field after 60 s', async () => {
    const findOne = vi.fn().mockResolvedValue(null);

    const wait = waitForAutonumber({
      collection: 'tickets',
      path: 'details.ref',
      db: fakeDB(findOne),
    }).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(await wait).toMatchObject({
      name: 'ValidationError',
      data: {
        collection: 'tickets',
        errors: [
          {
            path: 'details.ref',
            message: 'Existing records are still being numbered. Try again in a moment.',
          },
        ],
      },
    });
    expect(findOne).toHaveBeenCalledTimes(240);
  });
});

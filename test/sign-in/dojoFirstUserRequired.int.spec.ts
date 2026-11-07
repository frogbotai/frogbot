import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startDojoApp } from './dojoApp.js';

const SHARER = 'sam@example.com';

describe('The Dojo sharer when the user collection needs more than an email', () => {
  let dojo: Awaited<ReturnType<typeof startDojoApp>>;

  beforeAll(async () => {
    dojo = await startDojoApp({
      name: 'dojo-first-user-required',
      collection: { fields: [{ name: 'name', type: 'text', required: true }] },
      env: { DOJO_FIRST_USER_EMAIL: SHARER },
    });
  });

  afterAll(async () => {
    await dojo?.close();
  });

  it('starts anyway, says why, and leaves the first sign-in to make the first user', async () => {
    const warn = vi.spyOn(dojo.frogbot.logger, 'warn').mockImplementation(() => undefined);

    await expect(dojo.frogbot.config.onInit?.(dojo.frogbot)).resolves.toBeUndefined();

    expect(await dojo.users()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      `[plugin-dojo] Couldn't add ${SHARER} as the first user of 'users': The following field is invalid: Name`,
    );
  });
});

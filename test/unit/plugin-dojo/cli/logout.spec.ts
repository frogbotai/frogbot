import { readFile, stat } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { authPath, writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import { runLogout } from '../../../../packages/plugins/plugin-dojo/src/cli/logout.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO } from './helpers.js';

async function setup({ signedIn = true } = {}) {
  const dojo = await startFakeDojo();
  const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url };

  if (signedIn) {
    dojo.tokens.set('fb_stored', 5);
    await writeToken(env, dojo.url, 'fb_stored');
  }

  const run = async () => {
    const io = testIO({ cwd: env.XDG_CONFIG_HOME, env });

    return { code: await runLogout([], io.io), ...io };
  };

  return { dojo, env, run };
}

describe('frogbot logout', () => {
  it("revokes the stored key's id and removes auth.json", async () => {
    const { dojo, env, run } = await setup();
    const result = await run();

    expect(result.code).toBe(0);
    expect(dojo.paths()).toEqual(['GET /api/users/me', 'POST /api/api-keys/5/revoke']);
    expect(dojo.tokens.size).toBe(0);
    expect(result.stdout()).toEqual([`[frogbot] Signed out of ${dojo.url}.`]);
    await expect(stat(authPath(env))).rejects.toThrow();
  });

  it('keeps the tokens of other Dojos', async () => {
    const { dojo, env, run } = await setup();

    await writeToken(env, 'https://dojo.frogbot.ai', 'fb_real');

    expect((await run()).code).toBe(0);
    expect(JSON.parse(await readFile(authPath(env), 'utf8'))).toEqual({
      tokens: { 'https://dojo.frogbot.ai': 'fb_real' },
    });
    expect(dojo.tokens.size).toBe(0);
  });

  it('removes auth.json and exits 0 when the key is already gone', async () => {
    const { dojo, env, run } = await setup();

    dojo.revokeStatus = 401;

    expect((await run()).code).toBe(0);
    await expect(stat(authPath(env))).rejects.toThrow();

    const revoked = await setup();

    revoked.dojo.tokens.clear();

    expect((await revoked.run()).code).toBe(0);
    expect(revoked.dojo.paths()).toEqual(['GET /api/users/me']);
    await expect(stat(authPath(revoked.env))).rejects.toThrow();
  });

  it('keeps auth.json and exits 1 when Dojo fails, so it can be retried', async () => {
    const { dojo, env, run } = await setup();

    dojo.revokeStatus = 500;

    const result = await run();

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] Couldn't revoke the key: Revoke failed. Run logout again.",
    ]);
    expect(JSON.parse(await readFile(authPath(env), 'utf8'))).toEqual({
      tokens: { [dojo.url]: 'fb_stored' },
    });
  });

  it('says so when not signed in', async () => {
    const { dojo, run } = await setup({ signedIn: false });
    const result = await run();

    expect(result.code).toBe(0);
    expect(result.stdout()).toEqual(['[frogbot] Not signed in.']);
    expect(dojo.requests).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import { deviceLogin, readToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO } from './helpers.js';

async function setup() {
  const dojo = await startFakeDojo();
  const env = { XDG_CONFIG_HOME: await tempDir() };

  const login = async (options: Omit<Parameters<typeof testIO>[0], 'cwd' | 'env'> = {}) => {
    const io = testIO({ cwd: env.XDG_CONFIG_HOME, env, ...options });
    const token = await deviceLogin({ ...io.io, waits: true }, dojo.url).catch(
      (error: Error) => error,
    );

    return { token, ...io };
  };

  const codeRequests = () => dojo.paths().filter((path) => path === 'POST /api/cli/device/code');

  return { dojo, env, login, codeRequests };
}

describe('Dojo device sign-in', () => {
  it('prints the link that carries the code, then the code itself', async () => {
    const { dojo, env, login } = await setup();
    const result = await login();

    expect(result.token).toBe('fb_test_1');
    expect(result.stdout()).toEqual([
      '[frogbot] Sign in to Dojo: open this link and confirm the code.',
      `${dojo.url}/device?user_code=BCDF-GHJK`,
      'Code: BCDF-GHJK',
      '[frogbot] Signed in.',
    ]);
    expect(await readToken(env, dojo.url)).toBe('fb_test_1');
  });

  it('asks for the code to be entered when Dojo sends no link with it', async () => {
    const { dojo, login } = await setup();

    dojo.noCompleteUri = true;

    const result = await login();

    expect(result.stdout().slice(0, 3)).toEqual([
      '[frogbot] Sign in to Dojo: open this link and enter the code.',
      `${dojo.url}/device`,
      'Code: BCDF-GHJK',
    ]);
  });

  it('starts a new code by itself when one expires with --wait', async () => {
    const { dojo, login, codeRequests } = await setup();

    dojo.expiredCodes = 1;

    const result = await login();

    expect(result.token).toBe('fb_test_1');
    expect(codeRequests()).toHaveLength(2);
    expect(result.stdout()).toContain("[frogbot] The sign-in code expired. Here's a new one.");
    expect(result.stdout().filter((line) => line === 'Code: BCDF-GHJK')).toHaveLength(2);
  });

  it('gives up after three expired codes with --wait', async () => {
    const { dojo, login, codeRequests } = await setup();

    dojo.expiredCodes = 3;

    const result = await login();

    expect(result.token).toBeInstanceOf(Error);
    expect((result.token as Error).message).toBe(
      'The sign-in code expired. Run the command again.',
    );
    expect(codeRequests()).toHaveLength(3);
  });

  it('offers a new code with a TTY and opens its link', async () => {
    const { dojo, login, codeRequests } = await setup();

    dojo.expiredCodes = 2;

    const result = await login({ isTTY: true, confirm: true });
    const link = `${dojo.url}/device?user_code=BCDF-GHJK`;

    expect(result.token).toBe('fb_test_1');
    expect(result.asked).toEqual(['Get a new code?', 'Get a new code?']);
    expect(result.opened).toEqual([link, link, link]);
    expect(codeRequests()).toHaveLength(3);
  });

  it('stops when the person declines a new code', async () => {
    const { dojo, login, codeRequests } = await setup();

    dojo.expiredCodes = 1;

    const result = await login({ isTTY: true, confirm: false });

    expect((result.token as Error).message).toBe(
      'The sign-in code expired. Run the command again.',
    );
    expect(result.stdout()).toContain('[frogbot] The sign-in code expired.');
    expect(codeRequests()).toHaveLength(1);
  });
});

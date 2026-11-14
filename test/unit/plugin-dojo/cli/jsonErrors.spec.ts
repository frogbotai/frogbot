import { createServer } from 'node:net';

import { describe, expect, it } from 'vitest';

import { writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import { runDojo } from '../../../../packages/plugins/plugin-dojo/src/cli/commands.js';
import { unreachableStop } from '../../../../packages/plugins/plugin-dojo/src/cli/error.js';
import { deployDojo } from './deployDojo.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeApp } from './helpers.js';

async function closedPort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address();

  await new Promise((resolve) => server.close(resolve));

  if (!address || typeof address === 'string') throw new Error('No port');

  return address.port;
}

async function unreachable() {
  const url = `http://127.0.0.1:${await closedPort()}`;
  const cwd = await tempDir();
  const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: url, FROGBOT_DOJO_TOKEN: 'fb' };

  await writeApp(cwd);

  return { url, cwd, env };
}

const unreachableError = (url: string) =>
  `Couldn't reach Dojo at ${url} (set by FROGBOT_DOJO_URL). Check the URL or your network and rerun.`;

describe('an unreachable Dojo under --json', () => {
  it('prints DOJO_UNREACHABLE for a dojo command', async () => {
    const { url, cwd, env } = await unreachable();
    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'list', '--json'], result.io)).toBe(1);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      ok: false,
      code: 'DOJO_UNREACHABLE',
      error: unreachableError(url),
    });
    expect(result.stderr()).toEqual([`[frogbot] ${unreachableError(url)}`]);
  });

  it('prints DOJO_UNREACHABLE for logout', async () => {
    const { url, cwd, env } = await unreachable();
    const result = testIO({ cwd, env: { ...env, FROGBOT_DOJO_TOKEN: undefined } });

    await writeToken(env, url, 'fb_stored');

    expect(await runDojo(['logout', '--json'], result.io)).toBe(1);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      ok: false,
      code: 'DOJO_UNREACHABLE',
      error: unreachableError(url),
    });
  });

  it('prints DOJO_UNREACHABLE for share, without a token too', async () => {
    const { url, cwd, env } = await unreachable();
    const result = testIO({ cwd, env: { ...env, FROGBOT_DOJO_TOKEN: undefined } });

    expect(await deployDojo(['--json', '--no-data', '--no-interactive'], result.io)).toBe(1);
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({
      target: 'dojo',
      ok: false,
      code: 'DOJO_UNREACHABLE',
      error: unreachableError(url),
    });
  });

  it('leaves out FROGBOT_DOJO_URL when it is not set', () => {
    expect(unreachableStop('https://dojo.frogbot.ai', {}).message).toBe(
      "Couldn't reach Dojo at https://dojo.frogbot.ai. Check the URL or your network and rerun.",
    );
  });
});

describe("Dojo's refusals under --json", () => {
  it("prints Dojo's code, the status and the link", async () => {
    const dojo = await startFakeDojo();
    const cwd = await tempDir();
    const env = {
      XDG_CONFIG_HOME: await tempDir(),
      FROGBOT_DOJO_URL: dojo.url,
      FROGBOT_DOJO_TOKEN: 'fb',
    };

    dojo.tokens.set('fb', 50);

    dojo.replies.set('GET /api/apps', {
      status: 402,
      body: {
        errors: [
          {
            message: 'This workspace needs a paid plan.',
            data: { code: 'payment_required', url: `${dojo.url}/billing` },
          },
        ],
      },
    });

    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'list', '--json'], result.io)).toBe(1);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      ok: false,
      code: 'payment_required',
      error: "Couldn't list your apps: This workspace needs a paid plan.",
      status: 402,
      url: `${dojo.url}/billing`,
    });
  });

  it("prints Dojo's code when it refuses the sign-in", async () => {
    const dojo = await startFakeDojo();
    const cwd = await tempDir();
    const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url };

    dojo.deviceCodeReply = {
      status: 429,
      body: { errors: [{ message: 'Too many sign-ins.', data: { code: 'rate_limited' } }] },
    };

    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'list', '--json'], result.io)).toBe(1);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      ok: false,
      code: 'rate_limited',
      error: 'Dojo refused the sign-in: Too many sign-ins.',
      status: 429,
    });
  });

  it("prints Dojo's code when it refuses a logout", async () => {
    const dojo = await startFakeDojo();
    const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url };

    dojo.tokens.set('fb_stored', 5);
    dojo.revokeStatus = 500;
    await writeToken(env, dojo.url, 'fb_stored');

    const result = testIO({ cwd: env.XDG_CONFIG_HOME, env });

    expect(await runDojo(['logout', '--json'], result.io)).toBe(1);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      ok: false,
      code: 'FAILED',
      error: "Couldn't revoke the key: Revoke failed. Run logout again.",
      status: 500,
    });
  });

  it.each([
    [['nope', '--json'], '"nope" isn\'t a Dojo command.'],
    [['apps', '--json'], 'Name a verb.'],
    [['apps', 'nope', '--json'], '"nope" isn\'t a verb of apps.'],
  ])('prints USAGE_ERROR for %j', async (args, error) => {
    const cwd = await tempDir();
    const result = testIO({ cwd, env: { XDG_CONFIG_HOME: await tempDir() } });

    expect(await runDojo(args, result.io)).toBe(2);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      ok: false,
      code: 'USAGE_ERROR',
      error,
    });
  });

  it('prints a plain stop as FAILED and a usage stop as USAGE_ERROR', async () => {
    const cwd = await tempDir();
    const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: 'http://127.0.0.1:1' };
    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'get', '..', '--json'], result.io)).toBe(2);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      ok: false,
      code: 'USAGE_ERROR',
      error: `".." can't name anything on Dojo.`,
    });
  });
});

describe('a Dojo build under --json', () => {
  async function shareSetup() {
    const dojo = await startFakeDojo();
    const cwd = await tempDir();
    const env = {
      XDG_CONFIG_HOME: await tempDir(),
      FROGBOT_DOJO_URL: dojo.url,
      FROGBOT_DOJO_TOKEN: 'fb',
    };

    dojo.tokens.set('fb', 50);
    await writeApp(cwd);

    return { dojo, result: testIO({ cwd, env }) };
  }

  it('names the deployment when the build log is lost', async () => {
    const { dojo, result } = await shareSetup();

    dojo.replies.set('GET /api/deployments/7/logs', { body: {} });

    expect(await deployDojo(['--json', '--no-data'], result.io)).toBe(1);
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({
      ok: false,
      code: 'BUILD_LOG_LOST',
      deploymentId: 7,
      error:
        'Lost the build log. The build may still finish; follow it with frogbot dojo deployments logs 7 --follow.',
    });
  });

  it('names the deployment when the build log is refused after a reconnect', async () => {
    const { dojo, result } = await shareSetup();

    dojo.build = { lines: ['step 1', 'step 2'], status: 'ready', dropAfter: 1 };

    dojo.afterRequest = (route) => {
      if (route === 'GET /api/deployments/7/logs') {
        dojo.replies.set(route, {
          status: 500,
          body: { errors: [{ message: 'Log store down.' }] },
        });
      }
    };

    expect(await deployDojo(['--json', '--no-data'], result.io)).toBe(1);
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({
      ok: false,
      code: 'FAILED',
      status: 500,
      deploymentId: 7,
      error:
        "Couldn't read the build log: Log store down. The build may still finish: run `frogbot dojo deployments logs 7 --follow`.",
    });
  });

  it('names the deployment when the build fails', async () => {
    const { dojo, result } = await shareSetup();

    dojo.build = { lines: ['step 1'], status: 'failed', error: 'pnpm install failed.' };

    expect(await deployDojo(['--json', '--no-data'], result.io)).toBe(1);
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({
      ok: false,
      code: 'BUILD_FAILED',
      deploymentId: 7,
      error:
        'Build failed: pnpm install failed.\nRun `frogbot dojo deployments logs 7` for the full log.',
    });
  });
});

import { describe, expect, it } from 'vitest';

import { writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import type { LogsFollow } from '../../../../packages/plugins/plugin-dojo/src/cli/logs.js';
import { runLogs } from '../../../../packages/plugins/plugin-dojo/src/cli/logs.js';
import type { FakeDojo } from './fakeDojo.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO } from './helpers.js';

const line = (second: number, message: string) => ({
  at: `2026-10-20T10:00:0${second}Z`,
  message,
});

async function setup() {
  const cwd = await tempDir();
  const dojo = await startFakeDojo();
  const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url };

  dojo.projects.push({ id: 7, name: 'deals', slug: 'deals', workspace: 1 });
  dojo.level = 'editor';
  dojo.tokens.set('fb_stored', 100);
  await writeToken(env, dojo.url, 'fb_stored');

  const run = async (args: string[], follow?: LogsFollow) => {
    const io = testIO({ cwd, env });

    return { code: await runLogs(args, io.io, follow), ...io };
  };

  return { dojo, run };
}

function polls(between: (() => void)[]): LogsFollow & { waited: number[] } {
  const controller = new AbortController();
  const waited: number[] = [];

  return {
    waited,
    signal: controller.signal,
    wait: (ms) => {
      waited.push(ms);

      const step = between[waited.length - 1];

      if (step) step();
      else controller.abort();

      return Promise.resolve();
    },
  };
}

const logRequests = (dojo: FakeDojo) =>
  dojo.requests
    .filter((request) => request.path.endsWith('/logs'))
    .map((request) => `${request.path}${request.search}`);

describe('frogbot logs', () => {
  it('prints each line as `<at> <message>` and exits 0', async () => {
    const { dojo, run } = await setup();

    dojo.logs.push(line(1, 'listening on :3000'), line(2, 'GET / 200'));

    const result = await run(['deals']);

    expect(result.code).toBe(0);
    expect(result.stdout()).toEqual([
      '2026-10-20T10:00:01Z listening on :3000',
      '2026-10-20T10:00:02Z GET / 200',
    ]);
    expect(result.stderr()).toEqual([]);
    expect(dojo.paths()).toEqual(['GET /api/users/me', 'GET /api/apps/deals/logs']);
  });

  it('takes the app id as well as the slug', async () => {
    const { dojo, run } = await setup();

    dojo.logs.push(line(1, 'hello'));

    const result = await run(['7']);

    expect(result.code).toBe(0);
    expect(result.stdout()).toEqual(['2026-10-20T10:00:01Z hello']);
  });

  it('says so when there are no logs yet', async () => {
    const { run } = await setup();

    const result = await run(['deals']);

    expect(result.code).toBe(0);
    expect(result.stdout()).toEqual(['[frogbot] No logs yet.']);
  });

  it.each([
    [[]],
    [['deals', 'crm']],
    [['deals', '--tail']],
    [['--follow']],
    [['deals', '--follow', '--follow']],
  ])('prints usage and exits 2 for %j', async (args) => {
    const { dojo, run } = await setup();

    const result = await run(args);

    expect(result.code).toBe(2);
    expect(result.stderr()).toEqual(['[frogbot] Usage: frogbot logs <app> [--follow]']);
    expect(dojo.requests).toEqual([]);
  });

  it('--follow polls every 2 s with the last `next` and prints only new lines', async () => {
    const { dojo, run } = await setup();

    dojo.logs.push(line(1, 'listening on :3000'));

    const follow = polls([
      () => dojo.logs.push(line(2, 'GET / 200'), line(3, 'GET /admin 200')),
      () => {},
      () => dojo.logs.push(line(4, 'GET /api 500')),
    ]);

    const result = await run(['deals', '--follow'], follow);

    expect(result.code).toBe(0);
    expect(follow.waited).toEqual([2000, 2000, 2000, 2000]);
    expect(logRequests(dojo)).toEqual([
      '/api/apps/deals/logs',
      '/api/apps/deals/logs?after=1',
      '/api/apps/deals/logs?after=3',
      '/api/apps/deals/logs?after=3',
    ]);
    expect(result.stdout()).toEqual([
      '2026-10-20T10:00:01Z listening on :3000',
      '2026-10-20T10:00:02Z GET / 200',
      '2026-10-20T10:00:03Z GET /admin 200',
      '2026-10-20T10:00:04Z GET /api 500',
    ]);
  });

  it('--follow sends no `after` while `next` is null', async () => {
    const { dojo, run } = await setup();

    const follow = polls([() => {}, () => dojo.logs.push(line(1, 'started'))]);

    const result = await run(['--follow', 'deals'], follow);

    expect(result.code).toBe(0);
    expect(logRequests(dojo)).toEqual([
      '/api/apps/deals/logs',
      '/api/apps/deals/logs',
      '/api/apps/deals/logs',
    ]);
    expect(result.stdout()).toEqual(['[frogbot] No logs yet.', '2026-10-20T10:00:01Z started']);
  });

  const refusals = [
    [403, "You can't share to this app. Only its editors and owners can."],
    [404, 'No such app.'],
    [502, "Dojo couldn't read this app's logs. Try again in a moment."],
  ] as const;

  it.each(refusals)('a %i prints Dojo’s one line and exits 1', async (status, message) => {
    const { dojo, run } = await setup();

    dojo.logsStatus = status;

    const result = await run(['deals']);

    expect(result.code).toBe(1);
    expect(result.stdout()).toEqual([]);
    expect(result.stderr()).toEqual([`[frogbot] ${message}`]);
  });

  it.each(refusals)(
    'a %i on a later --follow poll stops it the same way',
    async (status, message) => {
      const { dojo, run } = await setup();

      dojo.logs.push(line(1, 'listening on :3000'));

      const follow = polls([
        () => {
          dojo.logsStatus = status;
        },
        () => {},
      ]);

      const result = await run(['deals', '--follow'], follow);

      expect(result.code).toBe(1);
      expect(follow.waited).toEqual([2000]);
      expect(result.stdout()).toEqual(['2026-10-20T10:00:01Z listening on :3000']);
      expect(result.stderr()).toEqual([`[frogbot] ${message}`]);
    },
  );

  it('an unknown slug gets the fake’s 404', async () => {
    const { run } = await setup();

    const result = await run(['crm']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual(['[frogbot] No such app.']);
  });
});

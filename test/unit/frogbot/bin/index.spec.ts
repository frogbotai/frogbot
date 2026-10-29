import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import type { FrogBotSanitizedConfig } from '../../../../packages/frogbot/src/config/sanitized.js';
import type { CLICommand } from '../../../../packages/frogbot/src/config/types.js';

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  channelsRun: vi.fn(() =>
    Promise.resolve(mocks.calls.push(`channelsRun:${process.env.FROGBOT_TEST_KEY}`)),
  ),
  dev: vi.fn(() => mocks.calls.push(`dev:${process.env.FROGBOT_TEST_KEY}`)),
  generateImportMap: vi.fn(() =>
    Promise.resolve(mocks.calls.push(`generateImportMap:${process.env.FROGBOT_TEST_KEY}`)),
  ),
  generatePieceTypes: vi.fn(() =>
    Promise.resolve(mocks.calls.push(`generatePieceTypes:${process.env.FROGBOT_TEST_KEY}`)),
  ),
  generateTypes: vi.fn(() =>
    Promise.resolve(mocks.calls.push(`generateTypes:${process.env.FROGBOT_TEST_KEY}`)),
  ),
  jobsRun: vi.fn(() =>
    Promise.resolve(mocks.calls.push(`jobsRun:${process.env.FROGBOT_TEST_KEY}`)),
  ),
  loadEnv: vi.fn(() => {
    mocks.calls.push('loadEnv');

    process.env.FROGBOT_TEST_KEY = 'loaded';
  }),
  migrate: vi.fn((args: string[]) =>
    Promise.resolve(mocks.calls.push(`migrate:${args.join(',')}`)),
  ),
  piecesPort: vi.fn(() =>
    Promise.resolve(mocks.calls.push(`piecesPort:${process.env.FROGBOT_TEST_KEY}`)),
  ),
  runScript: vi.fn(() =>
    Promise.resolve(mocks.calls.push(`runScript:${process.env.FROGBOT_TEST_KEY}`)),
  ),
  start: vi.fn(() => mocks.calls.push(`start:${process.env.FROGBOT_TEST_KEY}`)),
  findConfigFile: vi.fn((): string | null => null),
  resolveEnvConfigPath: vi.fn((): string | null => null),
  loadConfig: vi.fn(),
  init: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('../../../../packages/frogbot/src/config/resolveConfigPath.js', () => ({
  findConfigFile: mocks.findConfigFile,
  resolveEnvConfigPath: mocks.resolveEnvConfigPath,
}));

vi.mock('../../../../packages/frogbot/src/config/load.js', () => ({
  loadConfig: mocks.loadConfig,
}));

vi.mock('../../../../packages/frogbot/src/frogbot.js', () => ({
  FrogBot: class {
    destroy = mocks.destroy;
    init(options: unknown) {
      mocks.init(options);

      return Promise.resolve(this);
    }
  },
}));

vi.mock('../../../../packages/frogbot/src/bin/dev.js', () => ({ dev: mocks.dev }));

vi.mock('../../../../packages/frogbot/src/bin/channelsRun.js', () => ({
  channelsRun: mocks.channelsRun,
}));

vi.mock('../../../../packages/frogbot/src/bin/generateImportMap.js', () => ({
  generateImportMap: mocks.generateImportMap,
}));

vi.mock('../../../../packages/frogbot/src/bin/generatePieceTypes.js', () => ({
  generatePieceTypesCommand: mocks.generatePieceTypes,
}));

vi.mock('../../../../packages/frogbot/src/bin/generateTypes.js', () => ({
  generateTypes: mocks.generateTypes,
}));

vi.mock('../../../../packages/frogbot/src/bin/loadEnv.js', () => ({ loadEnv: mocks.loadEnv }));
vi.mock('../../../../packages/frogbot/src/bin/jobsRun.js', () => ({ jobsRun: mocks.jobsRun }));
vi.mock('../../../../packages/frogbot/src/bin/migrate.js', () => ({ migrate: mocks.migrate }));

vi.mock('../../../../packages/frogbot/src/bin/piecesPort.js', () => ({
  piecesPort: mocks.piecesPort,
}));

vi.mock('../../../../packages/frogbot/src/bin/start.js', () => ({ start: mocks.start }));
vi.mock('../../../../packages/frogbot/src/bin/run.js', () => ({ runScript: mocks.runScript }));

import { bin } from '../../../../packages/frogbot/src/bin/index.js';

describe('frogbot bin', () => {
  const argv = process.argv;
  const original = process.env.FROGBOT_TEST_KEY;

  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.findConfigFile.mockReset().mockReturnValue(null);
    mocks.resolveEnvConfigPath.mockReset().mockReturnValue(null);
    mocks.loadConfig.mockReset();
    mocks.init.mockReset();
    mocks.destroy.mockReset();

    delete process.env.FROGBOT_TEST_KEY;
  });

  afterEach(() => {
    process.argv = argv;

    if (original === undefined) delete process.env.FROGBOT_TEST_KEY;
    else process.env.FROGBOT_TEST_KEY = original;

    vi.restoreAllMocks();
  });

  it.each([
    ['start', 'start'],
    ['DEV', 'dev'],
    ['run', 'runScript'],
    ['generate:types', 'generateTypes'],
    ['generate:piece-types', 'generatePieceTypes'],
    ['generate:importmap', 'generateImportMap'],
    ['pieces:port', 'piecesPort'],
    ['jobs:run', 'jobsRun'],
    ['channels:run', 'channelsRun'],
  ])('loads env before dispatching `%s`', async (command, handler) => {
    process.argv = ['node', 'frogbot', command];

    await bin();

    expect(mocks.calls).toEqual(['loadEnv', `${handler}:loaded`]);
  });

  it.each(['migrate', 'migrate:status'])('loads env before dispatching `%s`', async (command) => {
    process.argv = ['node', 'frogbot', command];

    await bin();

    expect(mocks.calls).toEqual(['loadEnv', `migrate:${command}`]);
  });

  it('loads env before rejecting a missing name with the usage line', async () => {
    process.argv = ['node', 'frogbot'];

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    await expect(bin()).rejects.toThrow('exit:2');

    expect(mocks.calls).toEqual(['loadEnv']);
    expect(error).toHaveBeenCalledWith(
      '[frogbot] usage: frogbot <start|dev|run|generate:types|generate:piece-types|pieces:port|generate:importmap|jobs:run|channels:run|migrate|migrate:create|migrate:down|migrate:fresh|migrate:refresh|migrate:reset|migrate:status>',
    );
  });

  it.each(['unknown', 'export:captures', 'share'])(
    'rejects `%s` with no app config, pointing to plugin commands',
    async (command) => {
      process.argv = ['node', 'frogbot', command];

      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit:${code}`);
      });

      await expect(bin()).rejects.toThrow('exit:2');

      expect(mocks.calls).toEqual(['loadEnv']);
      expect(mocks.loadConfig).not.toHaveBeenCalled();
      expect(error.mock.calls).toEqual([
        [
          `[frogbot] "${command}" isn't a built-in command, and there's no app here to add it. Plugins add commands: see https://docs.frogbot.ai/getting-started/cli#plugin-commands`,
        ],
      ]);
    },
  );

  it('logs one `[frogbot]` prefix and exits 1 when the dispatched command rejects', async () => {
    process.argv = ['node', 'frogbot', 'pieces:port'];

    mocks.piecesPort.mockRejectedValueOnce(
      new Error('[frogbot] usage: frogbot pieces:port <slug>'),
    );

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    await expect(bin()).rejects.toThrow('exit:1');

    expect(error).toHaveBeenCalledWith('[frogbot] usage: frogbot pieces:port <slug>');
  });

  it('forwards worker flags unchanged', async () => {
    const args = ['--cron', '*/5 * * * * *', '--limit', '0', '--handle-schedules'];

    process.argv = ['node', 'frogbot', 'jobs:run', ...args];

    await bin();

    expect(mocks.jobsRun).toHaveBeenLastCalledWith(args);
  });

  it('loads env before forwarding script arguments unchanged', async () => {
    const args = ['src/seed.ts', '--count', '5', '--help'];

    process.argv = ['node', 'frogbot', 'run', ...args];

    await bin();

    expect(mocks.calls).toEqual(['loadEnv', 'runScript:loaded']);
    expect(mocks.runScript).toHaveBeenLastCalledWith(args);
  });

  describe('app commands', () => {
    const usage =
      '[frogbot] usage: frogbot <start|dev|run|generate:types|generate:piece-types|pieces:port|generate:importmap|jobs:run|channels:run|migrate|migrate:create|migrate:down|migrate:fresh|migrate:refresh|migrate:reset|migrate:status';

    function withConfig(commands: Record<string, CLICommand>): FrogBotSanitizedConfig {
      const config = { cli: { commands } } as unknown as FrogBotSanitizedConfig;

      mocks.findConfigFile.mockReturnValue('/app/frogbot.config.ts');
      mocks.loadConfig.mockResolvedValue(config);

      return config;
    }

    function captureExit() {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit:${code}`);
      });

      return error;
    }

    beforeEach(() => {
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    });

    it.each([
      [undefined, 0],
      [3, 3],
    ])(
      'exits with process.exitCode %s after an app command, so a booted instance cannot hold the process open',
      async (exitCode, expected) => {
        const previous = process.exitCode;

        onTestFinished(() => {
          process.exitCode = previous;
        });

        withConfig({
          hello: async ({ getFrogBot }) => {
            await getFrogBot();

            process.exitCode = exitCode;
          },
        });

        process.argv = ['node', 'frogbot', 'hello'];

        await bin();

        expect(mocks.destroy).toHaveBeenCalledTimes(1);
        expect(process.exit).toHaveBeenCalledExactlyOnceWith(expected);
      },
    );

    it('runs an app command with its context and destroys the instance afterwards', async () => {
      const seen: unknown[] = [];
      const config = withConfig({
        hello: async ({ args, command, getConfig, getFrogBot }) => {
          const frogbot = await getFrogBot({ disableOnInit: true });

          seen.push(args, command, await getConfig(), frogbot === (await getFrogBot()));

          expect(mocks.destroy).not.toHaveBeenCalled();
        },
      });

      process.argv = ['node', 'frogbot', 'HELLO', 'a', '--b'];

      await bin();

      expect(seen).toEqual([['a', '--b'], 'hello', config, true]);
      expect(mocks.loadConfig).toHaveBeenCalledTimes(1);
      expect(mocks.init).toHaveBeenCalledTimes(1);
      expect(mocks.init).toHaveBeenCalledWith({ config, disableOnInit: true });
      expect(mocks.destroy).toHaveBeenCalledTimes(1);
    });

    it('creates no instance when the command never asks for one', async () => {
      const hello = vi.fn();

      withConfig({ hello });
      process.argv = ['node', 'frogbot', 'hello'];

      await bin();

      expect(hello).toHaveBeenCalledTimes(1);
      expect(mocks.init).not.toHaveBeenCalled();
      expect(mocks.destroy).not.toHaveBeenCalled();
    });

    it('lets an app command replace a built-in', async () => {
      const start = vi.fn();

      withConfig({ start });
      process.argv = ['node', 'frogbot', 'start', '--port', '4000'];

      await bin();

      expect(start).toHaveBeenCalledWith(
        expect.objectContaining({ args: ['--port', '4000'], command: 'start' }),
      );
      expect(mocks.calls).toEqual(['loadEnv']);
    });

    it.each([
      ['generate:types', 'codegen'],
      ['start', 'codegen'],
      ['hello', 'runtime'],
      ['migrate', 'runtime'],
    ])('loads the config for `%s` in %s mode', async (command, mode) => {
      withConfig({ hello: vi.fn() });
      process.argv = ['node', 'frogbot', command];

      await bin();

      expect(mocks.loadConfig).toHaveBeenCalledWith({ cwd: process.cwd(), mode });
    });

    it.each(['export:nothing', 'export:captures', 'share'])(
      'rejects `%s`, which is neither built in nor in `cli.commands`',
      async (command) => {
        withConfig({});
        process.argv = ['node', 'frogbot', command];

        const error = captureExit();

        await expect(bin()).rejects.toThrow('exit:2');

        expect(error).toHaveBeenCalledWith(
          `[frogbot] "${command}" isn't a command in this app. Plugins add commands: see https://docs.frogbot.ai/getting-started/cli#plugin-commands`,
        );
      },
    );

    it('lists app commands after the built-ins in the usage line', async () => {
      withConfig({ start: vi.fn(), hello: vi.fn(), 'export:all': vi.fn() });
      process.argv = ['node', 'frogbot'];

      const error = captureExit();

      await expect(bin()).rejects.toThrow('exit:2');

      expect(error).toHaveBeenCalledWith(`${usage}|hello|export:all>`);
    });

    it('loads no config when no config file is found', async () => {
      process.argv = ['node', 'frogbot', 'pieces:port'];

      await bin();

      expect(mocks.loadConfig).not.toHaveBeenCalled();
      expect(mocks.calls).toEqual(['loadEnv', 'piecesPort:loaded']);
    });

    describe('when the config fails to load', () => {
      beforeEach(() => {
        mocks.findConfigFile.mockReturnValue('/app/frogbot.config.ts');
        mocks.loadConfig.mockRejectedValue(new Error('[frogbot] failed to load config'));
      });

      it('still runs a built-in', async () => {
        process.argv = ['node', 'frogbot', 'pieces:port'];

        await bin();

        expect(mocks.calls).toEqual(['loadEnv', 'piecesPort:loaded']);
      });

      it('exits 1 with the load error for any other name', async () => {
        process.argv = ['node', 'frogbot', 'hello'];

        const error = captureExit();

        await expect(bin()).rejects.toThrow('exit:1');

        expect(error.mock.calls).toEqual([['[frogbot] failed to load config']]);
      });

      it('prints the usage line and the load error with no name', async () => {
        process.argv = ['node', 'frogbot'];

        const error = captureExit();

        await expect(bin()).rejects.toThrow('exit:2');

        expect(error.mock.calls).toEqual([[`${usage}>`], ['[frogbot] failed to load config']]);
      });

      it('treats a missing FROGBOT_CONFIG_PATH file as a load error', async () => {
        mocks.resolveEnvConfigPath.mockImplementation(() => {
          throw new Error('[frogbot] FROGBOT_CONFIG_PATH points to a missing file: /nope');
        });

        process.argv = ['node', 'frogbot', 'hello'];

        const error = captureExit();

        await expect(bin()).rejects.toThrow('exit:1');

        expect(mocks.loadConfig).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith(
          '[frogbot] FROGBOT_CONFIG_PATH points to a missing file: /nope',
        );
      });
    });

    it('exits 1 and destroys the instance when an app command throws', async () => {
      withConfig({
        hello: async ({ getFrogBot }) => {
          await getFrogBot();

          throw new Error('[frogbot] hello failed');
        },
      });

      process.argv = ['node', 'frogbot', 'hello'];

      const error = captureExit();

      await expect(bin()).rejects.toThrow('exit:1');

      expect(error).toHaveBeenCalledWith('[frogbot] hello failed');
      expect(mocks.destroy).toHaveBeenCalledTimes(1);
    });
  });
});

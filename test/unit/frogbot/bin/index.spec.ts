import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import type { FrogBotSanitizedConfig } from '../../../../packages/frogbot/src/config/sanitized.js';
import type { CLICommand } from '../../../../packages/frogbot/src/config/types.js';

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  channelsRun: vi.fn(() =>
    Promise.resolve(mocks.calls.push(`channelsRun:${process.env.FROGBOT_TEST_KEY}`)),
  ),
  check: vi.fn(() => Promise.resolve(mocks.calls.push(`check:${process.env.FROGBOT_TEST_KEY}`))),
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
  up: vi.fn(() => Promise.resolve(mocks.calls.push(`up:${process.env.FROGBOT_TEST_KEY}`))),
  down: vi.fn(() => Promise.resolve(mocks.calls.push(`down:${process.env.FROGBOT_TEST_KEY}`))),
  status: vi.fn(() => mocks.calls.push(`status:${process.env.FROGBOT_TEST_KEY}`)),
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

vi.mock('../../../../packages/frogbot/src/bin/check.js', () => ({ check: mocks.check }));

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
vi.mock('../../../../packages/frogbot/src/bin/up.js', () => ({ up: mocks.up }));
vi.mock('../../../../packages/frogbot/src/bin/down.js', () => ({ down: mocks.down }));
vi.mock('../../../../packages/frogbot/src/bin/status.js', () => ({ status: mocks.status }));

import { bin, commands } from '../../../../packages/frogbot/src/bin/index.js';
import { CliError, usageError } from '../../../../packages/frogbot/src/bin/json.js';
import { version } from '../../../../packages/frogbot/src/bin/overview.js';

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
    ['check', 'check'],
    ['generate:types', 'generateTypes'],
    ['generate:piece-types', 'generatePieceTypes'],
    ['generate:importmap', 'generateImportMap'],
    ['pieces:port', 'piecesPort'],
    ['jobs:run', 'jobsRun'],
    ['channels:run', 'channelsRun'],
    ['up', 'up'],
    ['down', 'down'],
    ['status', 'status'],
  ])('loads env before dispatching `%s`', async (command, handler) => {
    process.argv = ['node', 'frogbot', command];
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await bin();

    expect(mocks.calls).toEqual(['loadEnv', `${handler}:loaded`]);
  });

  it.each(['up', 'down', 'status'])(
    'runs `%s` without loading the app config, so it works from any folder',
    async (command) => {
      process.argv = ['node', 'frogbot', command];
      mocks.findConfigFile.mockReturnValue('/app/src/frogbot.config.ts');

      await bin();

      expect(mocks.loadConfig).not.toHaveBeenCalled();
      expect(mocks.calls).toEqual(['loadEnv', `${command}:loaded`]);
    },
  );

  it.each(['migrate', 'migrate:status'])(
    'loads env before dispatching `%s`, then exits so database handles cannot hold the process',
    async (command) => {
      process.argv = ['node', 'frogbot', command];

      const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await bin();

      expect(mocks.calls).toEqual(['loadEnv', `migrate:${command}`]);
      expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    },
  );

  it.each([[], ['help'], ['--help'], ['-h']])(
    'prints the grouped commands for `frogbot %s` and exits 0',
    async (...command) => {
      process.argv = ['node', 'frogbot', ...command];

      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit:${code}`);
      });

      await expect(bin()).rejects.toThrow('exit:0');

      const text = String(log.mock.calls[0]?.[0]);
      const headings = text.split('\n').filter((line) => /^[A-Z]\w+$/.test(line));

      expect(text).toMatch(/^FrogBot \d+\.\d+\.\d+\. Usage: frogbot <command> \[options\]/);
      expect(headings).toEqual(['Run', 'Ship', 'Database', 'Generate', 'Contributing']);
      expect(text).toMatch(/\n {2}migrate:fresh +Drop all tables, then apply every migration\n/);
      expect(text).toMatch(
        /\n {2}migrate:refresh +Roll back every migration, then apply them all again\n/,
      );
      expect(text).toContain('Exit codes: 0 success, 1 failure, 2 usage error');
    },
  );

  it.each(['fly', 'gcp', 'aws', 'azure'])(
    "doesn't advertise the %s deploy target",
    async (target) => {
      process.argv = ['node', 'frogbot', '--help'];

      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit:${code}`);
      });

      await expect(bin()).rejects.toThrow('exit:0');

      expect(String(log.mock.calls[0]?.[0])).not.toMatch(new RegExp(`\\b${target}\\b`, 'i'));
    },
  );

  it.each(['--version', '-v'])('prints the version for `%s` and exits 0', async (flag) => {
    process.argv = ['node', 'frogbot', flag];
    mocks.findConfigFile.mockReturnValue('/app/frogbot.config.ts');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    await expect(bin()).rejects.toThrow('exit:0');

    expect(log).toHaveBeenCalledExactlyOnceWith(version);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(mocks.loadConfig).not.toHaveBeenCalled();
  });

  it.each(['--version', '-v'])('prints one JSON value for `%s --json`', async (flag) => {
    process.argv = ['node', 'frogbot', flag, '--json'];

    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    await expect(bin()).rejects.toThrow('exit:0');

    expect(write).toHaveBeenCalledOnce();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      command: 'version',
      success: true,
      version,
    });
  });

  it('prints one JSON value for `frogbot run --help --json` without running it', async () => {
    process.argv = ['node', 'frogbot', 'run', '--help', '--json'];

    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    await expect(bin()).rejects.toThrow('exit:0');

    expect(mocks.calls).toEqual(['loadEnv']);
    expect(write).toHaveBeenCalledOnce();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      command: 'run',
      success: true,
      usage: 'frogbot run <file> [args...]',
      help: expect.stringMatching(/^\[frogbot\] usage: frogbot run /),
    });
  });

  it('keeps config-load output off stdout for `frogbot run --help --json`', async () => {
    mocks.findConfigFile.mockReturnValue('/app/frogbot.config.ts');

    mocks.loadConfig.mockImplementationOnce(() => {
      console.log('config says hi');

      return Promise.resolve({ cli: { commands: {} } });
    });

    process.argv = ['node', 'frogbot', 'run', '--help', '--json'];

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    await expect(bin()).rejects.toThrow('exit:0');

    expect(log).not.toHaveBeenCalledWith('config says hi');
    expect(error).toHaveBeenCalledWith('config says hi');
    expect(write).toHaveBeenCalledOnce();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({ command: 'run' });
  });

  it.each([['status'], ['up', '--port', '4000'], ['migrate:fresh']])(
    'prints one JSON value for `frogbot %s --help --json` without running it',
    async (command, ...rest) => {
      process.argv = ['node', 'frogbot', command, ...rest, '--help', '--json'];

      const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit:${code}`);
      });

      await expect(bin()).rejects.toThrow('exit:0');

      expect(mocks.calls).toEqual(['loadEnv']);
      expect(write).toHaveBeenCalledOnce();
      expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
        command,
        success: true,
        summary: expect.any(String),
        usage: expect.stringContaining(`frogbot ${command}`),
        flags: expect.arrayContaining(['--json']),
        help: expect.stringMatching(/^\[frogbot\] usage: frogbot /),
      });
    },
  );

  it.each([
    ['help', '--json'],
    ['--help', '--json'],
  ])('prints one JSON object for `frogbot %s %s`', async (...line) => {
    process.argv = ['node', 'frogbot', ...line];

    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    await expect(bin()).rejects.toThrow('exit:0');

    expect(write).toHaveBeenCalledOnce();

    const output = JSON.parse(String(write.mock.calls[0]?.[0])) as {
      groups: { name: string; commands: { name: string; usage?: string; flags: string[] }[] }[];
    };

    expect(output).toMatchObject({ command: 'help', success: true, version });

    const up = output.groups[0]?.commands.find((command) => command.name === 'up');

    expect(up).toEqual({
      name: 'up',
      summary: 'Run the app in the background, rebuilding on each edit',
      usage: 'frogbot up [--port <n|auto>] [--dev] [--autostart] [--json]',
      flags: ['--port', '--dev', '--autostart', '--json'],
    });
  });

  it.each(Object.keys(commands).flatMap((command) => [`${command} --help`, `${command} -h`]))(
    'prints the usage for `frogbot %s` on stdout and exits 0 without running it',
    async (line) => {
      const [command] = line.split(' ');

      process.argv = ['node', 'frogbot', ...line.split(' ')];

      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit:${code}`);
      });

      await expect(bin()).rejects.toThrow('exit:0');

      expect(mocks.calls).toEqual(['loadEnv']);
      expect(log).toHaveBeenCalledOnce();
      expect(log.mock.calls[0]?.[0]).toMatch(/^\[frogbot\] usage: frogbot /);
      expect(log.mock.calls[0]?.[0]).toContain(command);
    },
  );

  it.each([
    ['up', ['--port', '4000', '--help'], '--autostart'],
    ['run', ['--help'], '<file> [args...]'],
    ['deploy', ['--help'], '--dry-run'],
    ['deploy', ['fly', '-h'], '--region <region>'],
  ])('prints `%s` usage for %j', async (command, args, flag) => {
    process.argv = ['node', 'frogbot', command, ...args];

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    await expect(bin()).rejects.toThrow('exit:0');

    expect(log.mock.calls[0]?.[0]).toContain(flag);
  });

  it('leaves `--help` after `--` to the command', async () => {
    process.argv = ['node', 'frogbot', 'jobs:run', '--', '--help'];
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await bin();

    expect(mocks.jobsRun).toHaveBeenLastCalledWith(['--', '--help']);
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
          `[frogbot] "${command}" isn't a built-in command, and there's no app here to add it. Run \`frogbot --help\` for the list. Plugins add commands: see https://docs.frogbot.ai/getting-started/cli#plugin-commands`,
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

    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

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

  it('forwards `check --json` and pre-loads the config in runtime mode', async () => {
    process.argv = ['node', 'frogbot', 'check', '--json'];
    mocks.findConfigFile.mockReturnValue('/app/frogbot.config.ts');
    mocks.loadConfig.mockResolvedValue({ cli: { commands: {} } });

    await bin();

    expect(mocks.loadConfig).toHaveBeenCalledWith({ cwd: process.cwd(), mode: 'runtime' });
    expect(mocks.check).toHaveBeenLastCalledWith(['--json']);
    expect(mocks.init).not.toHaveBeenCalled();
  });

  describe('--json', () => {
    function capture() {
      const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: unknown, done?: unknown) => {
          if (typeof done === 'function') done();

          return true;
        });

      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit:${code}`);
      });

      const chunks = () => write.mock.calls.map(([chunk]) => String(chunk)).filter(Boolean);

      return { chunks, error, json: () => chunks().map((chunk) => JSON.parse(chunk)) };
    }

    it('prints one success object, without passing --json on, and sends logs to stderr', async () => {
      mocks.status.mockImplementationOnce(() => {
        console.log('a table');

        return { apps: [] } as never;
      });

      process.argv = ['node', 'frogbot', 'status', '--json'];

      const { error, json } = capture();

      await expect(bin()).rejects.toThrow('exit:0');

      expect(mocks.status).toHaveBeenLastCalledWith([]);
      expect(json()).toEqual([{ command: 'status', success: true, apps: [] }]);
      expect(error).toHaveBeenCalledWith('a table');
    });

    it.each([
      [usageError('[frogbot] usage: frogbot status [--json]'), 2, 'USAGE_ERROR'],
      [new CliError('[frogbot] broken', { code: 'BUILD_FAILED' }), 1, 'BUILD_FAILED'],
      [new Error('boom'), 1, 'FAILED'],
    ])('prints one failure object for %s and exits %i', async (failure, code, errorCode) => {
      mocks.up.mockRejectedValueOnce(failure);
      process.argv = ['node', 'frogbot', 'up', '--json'];

      const { json } = capture();

      await expect(bin()).rejects.toThrow(`exit:${code}`);

      expect(json()).toEqual([
        {
          command: 'up',
          success: false,
          error: { code: errorCode, message: failure.message.replace('[frogbot] ', '') },
        },
      ]);
    });

    it("exits with a CliError's code and prints its message without --json", async () => {
      mocks.up.mockRejectedValueOnce(usageError('[frogbot] usage: frogbot up'));
      process.argv = ['node', 'frogbot', 'up', '--bad'];

      const { chunks, error } = capture();

      await expect(bin()).rejects.toThrow('exit:2');

      expect(chunks()).toEqual([]);
      expect(error).toHaveBeenCalledExactlyOnceWith('[frogbot] usage: frogbot up');
    });

    it('prints nothing more for a failure the command already reported', async () => {
      mocks.up.mockRejectedValueOnce(new CliError('[frogbot] done', { reported: true }));
      process.argv = ['node', 'frogbot', 'up'];

      const { error } = capture();

      await expect(bin()).rejects.toThrow('exit:1');

      expect(error).not.toHaveBeenCalled();
    });

    it.each(['start', 'dev', 'channels:run'])(
      'refuses `%s --json` with a usage error object, without running it',
      async (command) => {
        process.argv = ['node', 'frogbot', command, '--json'];

        const { json } = capture();

        await expect(bin()).rejects.toThrow('exit:2');

        expect(mocks.calls).toEqual(['loadEnv']);
        expect(json()).toEqual([
          expect.objectContaining({
            command,
            success: false,
            error: expect.objectContaining({ code: 'USAGE_ERROR' }),
          }),
        ]);
      },
    );

    it('leaves --json after the file to the script `run` runs', async () => {
      process.argv = ['node', 'frogbot', 'run', 'seed.ts', '--json'];

      await bin();

      expect(mocks.runScript).toHaveBeenLastCalledWith(['seed.ts', '--json']);
    });

    it('prints a failure object for an unknown command', async () => {
      process.argv = ['node', 'frogbot', 'nope', '--json'];

      const { json } = capture();

      await expect(bin()).rejects.toThrow('exit:2');

      expect(json()).toEqual([
        expect.objectContaining({
          command: 'nope',
          success: false,
          error: expect.objectContaining({ code: 'USAGE_ERROR' }),
        }),
      ]);
    });

    it.each([
      ['help', '--json'],
      ['migrate:status', '--json'],
      ['generate:types', '--json'],
    ])("keeps the config's own logs off stdout for `%s %s`", async (...args) => {
      mocks.findConfigFile.mockReturnValue('/app/frogbot.config.ts');

      mocks.loadConfig.mockImplementation(() => {
        process.stdout.write('from-config\n');
        console.log('from-config');

        return Promise.resolve({ cli: { commands: {} } });
      });

      process.argv = ['node', 'frogbot', ...args];

      const { chunks, error } = capture();

      await expect(bin()).rejects.toThrow('exit:0');

      expect(chunks()).toHaveLength(1);
      expect(JSON.parse(chunks()[0])).toMatchObject({ success: true });
      expect(error).toHaveBeenCalledWith('from-config');
    });

    it('lists `--force-accept-warning` in `help --json` for the migrate commands that take it', async () => {
      process.argv = ['node', 'frogbot', 'help', '--json'];

      const { json } = capture();

      await expect(bin()).rejects.toThrow('exit:0');

      const [{ groups }] = json() as [
        { groups: { commands: { name: string; flags: string[] }[] }[] },
      ];

      const listed = new Map(groups.flatMap(({ commands }) => commands.map((c) => [c.name, c])));

      for (const name of ['migrate', 'migrate:create', 'migrate:fresh']) {
        expect(listed.get(name)?.flags, name).toContain('--force-accept-warning');
      }
    });

    it.each(['generate:types', 'generate:importmap'])(
      'refuses an unknown flag for `%s` with exit 2, without running it',
      async (command) => {
        process.argv = ['node', 'frogbot', command, '--bogus', '--json'];

        const { json } = capture();

        await expect(bin()).rejects.toThrow('exit:2');

        expect(mocks.calls).toEqual(['loadEnv']);
        expect(json()).toEqual([
          expect.objectContaining({
            command,
            success: false,
            error: expect.objectContaining({ code: 'USAGE_ERROR' }),
          }),
        ]);
      },
    );

    it('leaves `check --json` and `deploy --json` to print their own result', async () => {
      process.argv = ['node', 'frogbot', 'check', '--json'];

      const { chunks } = capture();

      await bin();

      expect(mocks.check).toHaveBeenLastCalledWith(['--json']);
      expect(chunks()).toEqual([]);
    });
  });

  it('names `npx @frogbotai/plugin-dojo` for `frogbot dojo` with no app, and exits 2', async () => {
    process.argv = ['node', 'frogbot', 'dojo', 'login'];

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    await expect(bin()).rejects.toThrow('exit:2');

    expect(error).toHaveBeenCalledExactlyOnceWith(
      "[frogbot] There's no app here, so `frogbot dojo` isn't available. Run `npx @frogbotai/plugin-dojo <command>` (for example: `npx @frogbotai/plugin-dojo login`), which works in any folder.",
    );
  });

  describe('app commands', () => {
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

    it('passes `--help` to an app command that replaces a built-in', async () => {
      const start = vi.fn();

      withConfig({ start });
      process.argv = ['node', 'frogbot', 'start', '--help'];

      await bin();

      expect(start).toHaveBeenCalledWith(expect.objectContaining({ args: ['--help'] }));
    });

    it.each([
      ['generate:types', 'codegen'],
      ['start', 'codegen'],
      ['hello', 'runtime'],
      ['migrate', 'runtime'],
    ])('loads the config for `%s` in %s mode', async (command, mode) => {
      withConfig({ hello: vi.fn<CLICommand>() });
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
          `[frogbot] "${command}" isn't a command in this app. Run \`frogbot --help\` for the list. Plugins add commands: see https://docs.frogbot.ai/getting-started/cli#plugin-commands`,
        );
      },
    );

    it('lists app commands under their group, before Contributing, with their summary', async () => {
      withConfig({
        start: Object.assign(vi.fn<CLICommand>(), { summary: 'My own start' }),
        hello: vi.fn<CLICommand>(),
        dojo: Object.assign(vi.fn<CLICommand>(), { group: 'Dojo', summary: 'Dojo things' }),
        'export:all': Object.assign(vi.fn<CLICommand>(), { summary: 'Export everything' }),
      });

      process.argv = ['node', 'frogbot'];
      captureExit();

      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await expect(bin()).rejects.toThrow('exit:0');

      const text = String(log.mock.calls[0]?.[0]);

      expect(text.split('\n').filter((line) => /^[A-Z]\w+$/.test(line))).toEqual([
        'Run',
        'Ship',
        'Database',
        'Generate',
        'Dojo',
        'Plugins',
        'Contributing',
      ]);
      expect(text).toMatch(/\n {2}start +My own start\n/);
      expect(text).toMatch(/\nDojo\n {2}dojo +Dojo things\n/);
      expect(text).toMatch(/\nPlugins\n {2}hello\n {2}export:all +Export everything\n/);
    });

    it('lists app commands with their usage and flags in `help --json`', async () => {
      withConfig({
        'export:all': Object.assign(vi.fn<CLICommand>(), {
          summary: 'Export everything',
          usage: 'export:all [--output <file>]',
        }),
      });

      process.argv = ['node', 'frogbot', 'help', '--json'];
      captureExit();

      const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      await expect(bin()).rejects.toThrow('exit:0');

      expect(JSON.parse(String(write.mock.calls[0]?.[0])).groups).toContainEqual({
        name: 'Plugins',
        commands: [
          {
            name: 'export:all',
            summary: 'Export everything',
            usage: 'frogbot export:all [--output <file>]',
            flags: ['--output'],
          },
        ],
      });
    });

    it("prints an app command's help as one JSON value for --help --json", async () => {
      const run = vi.fn<CLICommand>();

      withConfig({
        'export:all': Object.assign(run, {
          summary: 'Export everything',
          usage: 'export:all [--output <file>]',
        }),
      });

      process.argv = ['node', 'frogbot', 'export:all', '--help', '--json'];
      captureExit();

      const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      await expect(bin()).rejects.toThrow('exit:0');

      expect(run).not.toHaveBeenCalled();
      expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
        command: 'export:all',
        success: true,
        summary: 'Export everything',
        usage: 'frogbot export:all [--output <file>]',
        flags: ['--output'],
        help: '[frogbot] usage: frogbot export:all [--output <file>]\nExport everything',
      });
    });

    it.each(['--help', '-h'])(
      "prints an app command's usage and summary for %s without running it",
      async (flag) => {
        const run = vi.fn<CLICommand>();

        withConfig({
          'export:all': Object.assign(run, {
            summary: 'Export everything',
            usage: 'export:all [--output <file>]',
          }),
        });

        process.argv = ['node', 'frogbot', 'export:all', flag];
        captureExit();

        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        await expect(bin()).rejects.toThrow('exit:0');

        expect(run).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledExactlyOnceWith(
          '[frogbot] usage: frogbot export:all [--output <file>]\nExport everything',
        );
      },
    );

    it('passes `--help` to an app command without a usage, which prints its own', async () => {
      const dojo = Object.assign(vi.fn<CLICommand>(), { group: 'Dojo', summary: 'Dojo things' });

      withConfig({ dojo });
      process.argv = ['node', 'frogbot', 'dojo', '--help'];

      await bin();

      expect(dojo).toHaveBeenCalledWith(expect.objectContaining({ args: ['--help'] }));
    });

    it('names `npx @frogbotai/plugin-dojo` when the app has no `dojo()`', async () => {
      withConfig({});
      process.argv = ['node', 'frogbot', 'dojo', 'login'];

      const error = captureExit();

      await expect(bin()).rejects.toThrow('exit:2');

      expect(error).toHaveBeenCalledWith(
        '[frogbot] "dojo" isn\'t a command in this app. Add `dojo()` from `@frogbotai/plugin-dojo` to `plugins` in frogbot.config.ts, or run `npx @frogbotai/plugin-dojo <command>`, which works in any folder.',
      );
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

      it('prints the commands, then the load error, and exits 1 with no name', async () => {
        process.argv = ['node', 'frogbot'];

        const error = captureExit();
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        await expect(bin()).rejects.toThrow('exit:1');

        expect(String(log.mock.calls[0]?.[0])).toMatch(/^FrogBot /);
        expect(error.mock.calls).toEqual([['[frogbot] failed to load config']]);
      });

      it('prints the commands with `success: false` and the load error for `help --json`, and exits 1', async () => {
        process.argv = ['node', 'frogbot', 'help', '--json'];
        captureExit();

        const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

        await expect(bin()).rejects.toThrow('exit:1');

        expect(write).toHaveBeenCalledOnce();
        expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
          command: 'help',
          success: false,
          error: { code: 'CONFIG_INVALID', message: 'failed to load config' },
          groups: expect.any(Array),
        });
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

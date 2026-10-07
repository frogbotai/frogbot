import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  channelsRun: vi.fn(() =>
    Promise.resolve(mocks.calls.push(`channelsRun:${process.env.FROGBOT_TEST_KEY}`)),
  ),
  dev: vi.fn(() => mocks.calls.push(`dev:${process.env.FROGBOT_TEST_KEY}`)),
  exportTrainingData: vi.fn(() =>
    Promise.resolve(mocks.calls.push(`exportTrainingData:${process.env.FROGBOT_TEST_KEY}`)),
  ),
  exportCaptures: vi.fn(() =>
    Promise.resolve(mocks.calls.push(`exportCaptures:${process.env.FROGBOT_TEST_KEY}`)),
  ),
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
}));

vi.mock('../../../../packages/frogbot/src/bin/dev.js', () => ({ dev: mocks.dev }));

vi.mock('../../../../packages/frogbot/src/bin/channelsRun.js', () => ({
  channelsRun: mocks.channelsRun,
}));

vi.mock('../../../../packages/frogbot/src/bin/exportTrainingData.js', () => ({
  exportTrainingData: mocks.exportTrainingData,
}));

vi.mock('../../../../packages/frogbot/src/bin/exportCaptures.js', () => ({
  exportCaptures: mocks.exportCaptures,
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
    ['export:training-data', 'exportTrainingData'],
    ['export:captures', 'exportCaptures'],
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

  it.each([undefined, 'unknown'])('loads env before rejecting `%s`', async (command) => {
    process.argv = command ? ['node', 'frogbot', command] : ['node', 'frogbot'];

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    await expect(bin()).rejects.toThrow('exit:2');

    expect(mocks.calls).toEqual(['loadEnv']);
    expect(error).toHaveBeenCalledWith(
      '[frogbot] usage: frogbot <start|dev|run|generate:types|generate:piece-types|pieces:port|generate:importmap|export:training-data|export:captures|jobs:run|channels:run|migrate|migrate:create|migrate:down|migrate:fresh|migrate:refresh|migrate:reset|migrate:status>',
    );
  });

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
});

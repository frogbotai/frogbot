import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  dev: vi.fn(() => mocks.calls.push(`dev:${process.env.FROGBOT_TEST_KEY}`)),
  exportTrainingData: vi.fn(async () =>
    mocks.calls.push(`exportTrainingData:${process.env.FROGBOT_TEST_KEY}`),
  ),
  exportCaptures: vi.fn(async () =>
    mocks.calls.push(`exportCaptures:${process.env.FROGBOT_TEST_KEY}`),
  ),
  generateImportMap: vi.fn(async () =>
    mocks.calls.push(`generateImportMap:${process.env.FROGBOT_TEST_KEY}`),
  ),
  generateTypes: vi.fn(async () =>
    mocks.calls.push(`generateTypes:${process.env.FROGBOT_TEST_KEY}`),
  ),
  loadEnv: vi.fn(() => {
    mocks.calls.push('loadEnv');
    process.env.FROGBOT_TEST_KEY = 'loaded';
  }),
  migrate: vi.fn(async (args: string[]) => mocks.calls.push(`migrate:${args.join(',')}`)),
  start: vi.fn(() => mocks.calls.push(`start:${process.env.FROGBOT_TEST_KEY}`)),
}));

vi.mock('../../../../packages/frogbot/src/bin/dev.js', () => ({ dev: mocks.dev }));
vi.mock('../../../../packages/frogbot/src/bin/exportTrainingData.js', () => ({
  exportTrainingData: mocks.exportTrainingData,
}));
vi.mock('../../../../packages/frogbot/src/bin/exportCaptures.js', () => ({
  exportCaptures: mocks.exportCaptures,
}));
vi.mock('../../../../packages/frogbot/src/bin/generateImportMap.js', () => ({
  generateImportMap: mocks.generateImportMap,
}));
vi.mock('../../../../packages/frogbot/src/bin/generateTypes.js', () => ({
  generateTypes: mocks.generateTypes,
}));
vi.mock('../../../../packages/frogbot/src/bin/loadEnv.js', () => ({ loadEnv: mocks.loadEnv }));
vi.mock('../../../../packages/frogbot/src/bin/migrate.js', () => ({ migrate: mocks.migrate }));
vi.mock('../../../../packages/frogbot/src/bin/start.js', () => ({ start: mocks.start }));

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
    ['generate:types', 'generateTypes'],
    ['generate:importmap', 'generateImportMap'],
    ['export:training-data', 'exportTrainingData'],
    ['export:captures', 'exportCaptures'],
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
      '[frogbot] usage: frogbot <start|dev|generate:types|generate:importmap|export:training-data|export:captures|migrate|migrate:create|migrate:status|migrate:down|migrate:refresh|migrate:reset|migrate:fresh>',
    );
  });

  it.todo('logs `[frogbot] error:` and exits 1 when the dispatched command rejects');
});

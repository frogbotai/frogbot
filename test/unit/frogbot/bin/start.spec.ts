import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateImportMap: vi.fn(),
  loadConfig: vi.fn(),
  runNext: vi.fn(),
}));

vi.mock('../../../../packages/frogbot/src/config/load.js', () => ({
  loadConfig: mocks.loadConfig,
}));
vi.mock('../../../../packages/frogbot/src/bin/generateImportMap/index.js', () => ({
  generateImportMap: mocks.generateImportMap,
}));
vi.mock('../../../../packages/frogbot/src/bin/runNext.js', () => ({ runNext: mocks.runNext }));

import { start } from '../../../../packages/frogbot/src/bin/start.js';

describe('frogbot start command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockResolvedValue({
      admin: { importMap: { autoGenerate: true } },
      _internal: { payloadConfig: Promise.resolve({}) },
    });
    mocks.generateImportMap.mockResolvedValue({ changed: false, outputPath: '/importMap.js' });
  });

  it('delegates to `next start` with passthrough args', async () => {
    await start(['-p', '8080']);
    expect(mocks.runNext).toHaveBeenCalledWith('start', ['-p', '8080']);
  });

  it('defaults to no extra args', async () => {
    await start();
    expect(mocks.runNext).toHaveBeenCalledWith('start', []);
  });

  it('checks without writing and warns when the import map is stale', async () => {
    mocks.generateImportMap.mockResolvedValue({ changed: true, outputPath: '/importMap.js' });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await start();

    expect(mocks.generateImportMap).toHaveBeenCalledWith({}, { dryRun: true });
    expect(stderr).toHaveBeenCalledWith(
      '[frogbot] import map is stale; run `frogbot generate:importmap` before starting production\n',
    );
  });
});

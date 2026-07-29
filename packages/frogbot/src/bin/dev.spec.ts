import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateImportMap: vi.fn(),
  loadConfig: vi.fn(),
  runNext: vi.fn(),
}));

vi.mock('../config/load.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('../importMap/index.js', () => ({ generateImportMap: mocks.generateImportMap }));
vi.mock('./runNext.js', () => ({ runNext: mocks.runNext }));

import { dev } from './dev.js';

describe('frogbot dev command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockResolvedValue({
      admin: { importMap: { autoGenerate: true } },
      _internal: { payloadConfig: Promise.resolve({}) },
    });
  });

  it('delegates to `next dev` with passthrough args', async () => {
    await dev(['-p', '4000']);
    expect(mocks.runNext).toHaveBeenCalledWith('dev', ['-p', '4000']);
  });

  it('defaults to no extra args', async () => {
    await dev();
    expect(mocks.runNext).toHaveBeenCalledWith('dev', []);
  });

  it('generates the import map before starting next', async () => {
    await dev(['-p', '4000']);

    expect(mocks.generateImportMap).toHaveBeenCalledOnce();
    expect(mocks.generateImportMap.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runNext.mock.invocationCallOrder[0],
    );
  });

  it('skips generation when admin.importMap.autoGenerate is false', async () => {
    mocks.loadConfig.mockResolvedValue({
      admin: { importMap: { autoGenerate: false } },
      _internal: { payloadConfig: Promise.resolve({}) },
    });

    await dev();

    expect(mocks.loadConfig).toHaveBeenCalledOnce();
    expect(mocks.generateImportMap).not.toHaveBeenCalled();
    expect(mocks.runNext).toHaveBeenCalledWith('dev', []);
  });
});

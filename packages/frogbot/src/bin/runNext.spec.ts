import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  existsSync: vi.fn(),
  resolve: vi.fn(() => '/proj/node_modules/next/dist/bin/next'),
}));

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('node:fs', () => ({ existsSync: mocks.existsSync, default: { existsSync: mocks.existsSync } }));
vi.mock('node:module', () => ({
  createRequire: () => ({ resolve: mocks.resolve }),
  default: { createRequire: () => ({ resolve: mocks.resolve }) },
}));

import { findNextConfig, runNext } from './runNext.js';

type SpawnedChild = {
  kill: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

function mockChild(): SpawnedChild {
  return { kill: vi.fn(), on: vi.fn() };
}

describe('findNextConfig', () => {
  it('returns the first matching next.config file', () => {
    mocks.existsSync.mockImplementation((p: string) => p.endsWith('next.config.ts'));
    expect(findNextConfig('/proj')).toBe('/proj/next.config.ts');
  });

  it('checks all supported extensions', () => {
    mocks.existsSync.mockImplementation((p: string) => p.endsWith('next.config.cjs'));
    expect(findNextConfig('/proj')).toBe('/proj/next.config.cjs');
  });

  it('returns null when no next.config exists', () => {
    mocks.existsSync.mockReturnValue(false);
    expect(findNextConfig('/proj')).toBeNull();
  });
});

describe('runNext', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mocks.spawn.mockReset();
    mocks.existsSync.mockReset();
  });

  it('errors with a clear message and exits 1 when no next.config is present', () => {
    mocks.existsSync.mockReturnValue(false);

    expect(() => runNext('dev')).toThrow('process.exit');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no next.config'));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('errors and exits 1 when `next` cannot be resolved', () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.resolve.mockImplementationOnce(() => {
      throw new Error('not found');
    });

    expect(() => runNext('dev')).toThrow('process.exit');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('could not resolve `next`'));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('spawns the resolved next bin with the command and passthrough args', () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.spawn.mockReturnValue(mockChild());

    runNext('dev', ['-p', '4000']);

    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    const [execPath, spawnArgs, options] = mocks.spawn.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(execPath).toBe(process.execPath);
    expect(spawnArgs[0]).toContain('next');
    expect(spawnArgs.slice(1)).toEqual(['dev', '-p', '4000']);
    expect(options).toMatchObject({ cwd: process.cwd(), stdio: 'inherit' });
  });

  it('exits with the child exit code', () => {
    mocks.existsSync.mockReturnValue(true);
    const child = mockChild();
    mocks.spawn.mockReturnValue(child);

    runNext('start');

    const exitHandler = child.on.mock.calls.find(([event]) => event === 'exit')?.[1] as (code: number | null) => void;
    expect(() => exitHandler(3)).toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  it('exits 0 when the child exit code is null', () => {
    mocks.existsSync.mockReturnValue(true);
    const child = mockChild();
    mocks.spawn.mockReturnValue(child);

    runNext('start');

    const exitHandler = child.on.mock.calls.find(([event]) => event === 'exit')?.[1] as (code: number | null) => void;
    expect(() => exitHandler(null)).toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

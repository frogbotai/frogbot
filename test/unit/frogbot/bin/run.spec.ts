import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  getCachedFrogBot: vi.fn(),
  tsImport: vi.fn(),
}));

vi.mock('../../../../packages/frogbot/node_modules/tsx/dist/esm/api/index.mjs', () => ({
  tsImport: mocks.tsImport,
}));
vi.mock('../../../../packages/frogbot/src/getFrogBot.js', () => ({
  getCachedFrogBot: mocks.getCachedFrogBot,
}));

import { runScript } from '../../../../packages/frogbot/src/bin/run.js';

describe('runScript', () => {
  const argv = process.argv;
  let dir: string;
  let file: string;
  let error: ReturnType<typeof vi.spyOn>;
  let exit: MockInstance<typeof process.exit>;

  beforeEach(() => {
    vi.resetAllMocks();

    const tempRoot = join(process.cwd(), 'test', '.tmp');

    mkdirSync(tempRoot, { recursive: true });

    dir = mkdtempSync(join(tempRoot, 'frogbot-run-unit-'));
    file = join(dir, 'seed.ts');

    writeFileSync(file, 'export {};\n');

    mocks.getCachedFrogBot.mockReturnValue({ destroy: mocks.destroy });
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });
  });

  afterEach(() => {
    process.argv = argv;

    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('prints usage and exits 2 without a file', async () => {
    await expect(runScript([])).rejects.toThrow('exit:2');

    expect(error).toHaveBeenCalledWith('[frogbot] usage: frogbot run <file> [args...]');
    expect(exit).toHaveBeenCalledExactlyOnceWith(2);
    expect(mocks.tsImport).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it('reports a missing file and exits 1', async () => {
    const missing = relative(process.cwd(), join(dir, 'missing.ts'));

    await expect(runScript([missing])).rejects.toThrow('exit:1');

    expect(error).toHaveBeenCalledWith(`[frogbot] run: file not found: ${missing}`);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.tsImport).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it('imports the file with script argv and destroys the cached instance before exiting 0', async () => {
    const args = ['--count', '5', '--help'];
    const observedArgv: string[][] = [];
    const calls: string[] = [];

    mocks.tsImport.mockImplementation(() => {
      observedArgv.push([...process.argv]);
      calls.push('import');

      return Promise.resolve();
    });
    mocks.destroy.mockImplementation(async () => {
      await Promise.resolve();

      calls.push('destroy');
    });
    exit.mockImplementation((code) => {
      calls.push(`exit:${code}`);

      throw new Error(`exit:${code}`);
    });

    await expect(runScript([relative(process.cwd(), file), ...args])).rejects.toThrow('exit:0');

    expect(mocks.tsImport).toHaveBeenCalledExactlyOnceWith(
      pathToFileURL(file).href,
      pathToFileURL(join(process.cwd(), 'packages/frogbot/src/bin/run.ts')).href,
    );
    expect(observedArgv).toEqual([[process.execPath, file, ...args]]);
    expect(calls).toEqual(['import', 'destroy', 'exit:0']);
    expect(error).not.toHaveBeenCalled();
  });

  it('exits 0 when no instance is cached', async () => {
    mocks.getCachedFrogBot.mockReturnValue(null);

    await expect(runScript([file])).rejects.toThrow('exit:0');

    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('prints the script error and exits 1 without destroying the cached instance', async () => {
    const scriptError = new Error('script failed');

    mocks.tsImport.mockRejectedValue(scriptError);

    await expect(runScript([file])).rejects.toThrow('exit:1');

    expect(error.mock.calls).toEqual([[`[frogbot] run failed: ${file}`], [scriptError]]);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it('prints the cleanup error and exits 1', async () => {
    const cleanupError = new Error('cleanup failed');

    mocks.destroy.mockRejectedValue(cleanupError);

    await expect(runScript([file])).rejects.toThrow('exit:1');

    expect(error.mock.calls).toEqual([[`[frogbot] run failed: ${file}`], [cleanupError]]);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});

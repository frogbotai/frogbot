import { EventEmitter } from 'node:events';
import type { FSWatcher } from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBuildQueue } from '../../../../../packages/frogbot/src/bin/service/queue.js';
import {
  shouldRebuild,
  tsconfigShape,
  watchApp,
} from '../../../../../packages/frogbot/src/bin/service/watch.js';

type Listener = (event: string, file: string | null) => void;

function fakeWatch() {
  const listeners = new Map<string, Listener>();
  let root = '';

  return {
    watch: (path: string, _options: { recursive: boolean }, listener: Listener) => {
      listeners.set(path, listener);

      return Object.assign(new EventEmitter(), { close: () => {} }) as unknown as FSWatcher;
    },
    setRoot: (dir: string) => (root = dir),
    emit: (base: string, file: string) =>
      listeners.get(base ? join(root, base) : join(root, ''))?.('change', file),
  };
}

describe('what the service watches', () => {
  it.each([
    'src/app/page.tsx',
    'src/collections/Notes.ts',
    'public/logo.svg',
    'frogbot.config.ts',
    'next.config.mjs',
    'tsconfig.json',
    'package.json',
    'pnpm-lock.yaml',
    '.env',
    '.env.local',
  ])('rebuilds on %s', (path) => {
    expect(shouldRebuild(path)).toBe(true);
  });

  it.each([
    '.frogbot/builds/a/server/app.js',
    '.frogbot/service.log',
    '.next/trace',
    'node_modules/next/package.json',
    'src/app/(frogbot)/importMap.js',
    'frogbot.db',
    'frogbot.db-wal',
    'data.sqlite',
    'next-env.d.ts',
    'README.md',
    'files/upload.png',
    'src/.DS_Store',
  ])('ignores %s', (path) => {
    expect(shouldRebuild(path)).toBe(false);
  });

  it("tells Next's build-folder include entries from a real tsconfig change", () => {
    const base = JSON.stringify({ compilerOptions: { strict: true }, include: ['**/*.ts'] });
    const withSlot = JSON.stringify(
      {
        compilerOptions: { strict: true },
        include: ['**/*.ts', '.frogbot/builds/a/types/**/*.ts'],
      },
      null,
      2,
    );

    expect(tsconfigShape(withSlot)).toBe(tsconfigShape(base));
    expect(tsconfigShape(base.replace('true', 'false'))).not.toBe(tsconfigShape(base));
  });
});

describe('the watcher and the build queue', () => {
  let dir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    dir = mkdtempSync(join(tmpdir(), 'frogbot-watch-'));
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ include: ['**/*.ts'] }));
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs one follow-up build for 20 changes made during a build, never two at once', async () => {
    let release = () => {};

    let running = 0;
    let most = 0;
    const run = vi.fn(async () => {
      running++;
      most = Math.max(most, running);
      await new Promise<void>((resolve) => (release = resolve));
      running--;
    });

    const queue = createBuildQueue(run);
    const fs = fakeWatch();

    fs.setRoot(dir);
    watchApp({ dir, onChange: () => queue.trigger(), watch: fs.watch });

    fs.emit('src', 'app/page.tsx');
    await vi.advanceTimersByTimeAsync(1500);

    expect(run).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 20; i++) {
      fs.emit('src', `app/file${i}.ts`);
      await vi.advanceTimersByTimeAsync(2000);
    }

    expect(run).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(0);

    expect(run).toHaveBeenCalledTimes(2);

    release();
    await queue.idle();

    expect(run).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
  });

  it('waits 1.5 s after the last change', async () => {
    const onChange = vi.fn();
    const fs = fakeWatch();

    fs.setRoot(dir);
    watchApp({ dir, onChange, watch: fs.watch });

    fs.emit('src', 'a.ts');
    await vi.advanceTimersByTimeAsync(1000);
    fs.emit('src', 'b.ts');
    await vi.advanceTimersByTimeAsync(1499);

    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(onChange).toHaveBeenCalledOnce();
  });

  it("builds nothing for .frogbot/, the import map, database files or Next's tsconfig edit, and once for a real tsconfig edit", async () => {
    const onChange = vi.fn();
    const fs = fakeWatch();

    fs.setRoot(dir);
    watchApp({ dir, onChange, watch: fs.watch });

    fs.emit('', '.frogbot');
    fs.emit('', 'frogbot.db');
    fs.emit('', 'frogbot.db-wal');
    fs.emit('src', 'app/(frogbot)/importMap.js');

    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ include: ['**/*.ts', '.frogbot/builds/b/types/**/*.ts'] }),
    );

    fs.emit('', 'tsconfig.json');
    await vi.advanceTimersByTimeAsync(5000);

    expect(onChange).not.toHaveBeenCalled();

    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ include: ['src/**/*.ts'] }));
    fs.emit('', 'tsconfig.json');
    await vi.advanceTimersByTimeAsync(1500);

    expect(onChange).toHaveBeenCalledOnce();
  });

  it('passes the paths that changed during the debounce, once each', async () => {
    const onChange = vi.fn();
    const fs = fakeWatch();

    fs.setRoot(dir);
    watchApp({ dir, onChange, watch: fs.watch });

    fs.emit('', '.env');
    fs.emit('src', 'app/page.tsx');
    fs.emit('', '.env');
    await vi.advanceTimersByTimeAsync(1500);

    expect(onChange).toHaveBeenCalledWith(['.env', 'src/app/page.tsx']);

    fs.emit('', '.env.local');
    await vi.advanceTimersByTimeAsync(1500);

    expect(onChange).toHaveBeenLastCalledWith(['.env.local']);
  });

  it.each([
    ['the default types file', 'src/frogbot-types.ts'],
    ['a custom typescript.outputFile', 'src/types/generated.ts'],
  ])('builds nothing for %s that the last prepare reported', async (_name, file) => {
    const onChange = vi.fn();
    const fs = fakeWatch();

    fs.setRoot(dir);
    watchApp({ dir, onChange, ignore: () => join(dir, file), watch: fs.watch });

    fs.emit('src', file.slice('src/'.length));
    await vi.advanceTimersByTimeAsync(5000);

    expect(onChange).not.toHaveBeenCalled();

    fs.emit('src', 'collections/Notes.ts');
    await vi.advanceTimersByTimeAsync(1500);

    expect(onChange).toHaveBeenCalledWith(['src/collections/Notes.ts']);
  });

  it('still rebuilds on a types file no prepare has reported, or one outside the app', async () => {
    const onChange = vi.fn();
    const fs = fakeWatch();
    let ignored: string | undefined;

    fs.setRoot(dir);
    watchApp({ dir, onChange, ignore: () => ignored, watch: fs.watch });

    fs.emit('src', 'frogbot-types.ts');
    await vi.advanceTimersByTimeAsync(1500);

    ignored = join(dir, '..', 'elsewhere', 'src', 'frogbot-types.ts');
    fs.emit('src', 'frogbot-types.ts');
    await vi.advanceTimersByTimeAsync(1500);

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('forgets a types file write seen before prepare named its new path', async () => {
    const onChange = vi.fn();
    const fs = fakeWatch();

    fs.setRoot(dir);

    const watcher = watchApp({ dir, onChange, watch: fs.watch });

    fs.emit('src', 'b-types.ts');
    watcher.forget(join(dir, 'src', 'b-types.ts'));
    await vi.advanceTimersByTimeAsync(5000);

    expect(onChange).not.toHaveBeenCalled();

    fs.emit('src', 'b-types.ts');
    fs.emit('src', 'collections/Notes.ts');
    watcher.forget(join(dir, 'src', 'b-types.ts'));
    await vi.advanceTimersByTimeAsync(1500);

    expect(onChange).toHaveBeenCalledWith(['src/collections/Notes.ts']);
  });
});

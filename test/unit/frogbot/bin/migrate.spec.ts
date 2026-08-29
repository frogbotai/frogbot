import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileAsync = promisify(execFile);
const binURL = pathToFileURL(
  new URL('../../../../packages/frogbot/src/bin/index.ts', import.meta.url).pathname,
).href;
const repoRoot = resolve(import.meta.dirname, '../../../..');
const templateDir = join(repoRoot, 'templates', 'blank');
const tsxLoader = createRequire(import.meta.url).resolve('tsx/esm');

const mocks = vi.hoisted(() => ({
  adapter: {
    createMigration: vi.fn(async () => {}),
    migrate: vi.fn(async () => {}),
    migrateDown: vi.fn(async () => {}),
    migrateFresh: vi.fn(async () => {}),
    migrateRefresh: vi.fn(async () => {}),
    migrateReset: vi.fn(async () => {}),
    migrateStatus: vi.fn(async () => {}),
  },
  find: vi.fn(async () => ({ docs: [] })),
  init: vi.fn(async () => {}),
  loadConfig: vi.fn(async () => ({
    collections: [],
    _internal: { payloadConfig: Promise.resolve({}) },
  })),
}));

vi.mock('payload', () => ({
  default: { db: mocks.adapter, find: mocks.find, init: mocks.init },
}));
vi.mock('../../../../packages/frogbot/src/config/load.js', () => ({
  loadConfig: mocks.loadConfig,
}));

import { migrate } from '../../../../packages/frogbot/src/bin/migrate.js';

const COMMAND_TABLE = [
  ['migrate', 'migrate'],
  ['migrate:create', 'createMigration'],
  ['migrate:down', 'migrateDown'],
  ['migrate:fresh', 'migrateFresh'],
  ['migrate:refresh', 'migrateRefresh'],
  ['migrate:reset', 'migrateReset'],
  ['migrate:status', 'migrateStatus'],
] as const;

describe('migrate', () => {
  const migrating = process.env.PAYLOAD_MIGRATING;
  const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  const setTTY = (value: boolean | undefined) => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockResolvedValue({ docs: [] });
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });
    setTTY(true);
  });

  afterEach(() => {
    if (migrating === undefined) delete process.env.PAYLOAD_MIGRATING;
    else process.env.PAYLOAD_MIGRATING = migrating;
    if (stdinDescriptor) Object.defineProperty(process.stdin, 'isTTY', stdinDescriptor);
    else Reflect.deleteProperty(process.stdin, 'isTTY');
    vi.restoreAllMocks();
  });

  describe('success path exits 0', () => {
    for (const [command, method] of COMMAND_TABLE) {
      it(`\`${command}\` runs the adapter, logs completion, and exits 0`, async () => {
        await expect(migrate([command])).rejects.toThrow('exit:0');
        expect(mocks.adapter[method]).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledWith(`[frogbot] ${command} complete.`);
      });
    }
  });

  describe('failure path exits 1', () => {
    it('logs the failure and exits 1 when the adapter command rejects', async () => {
      mocks.adapter.migrateStatus.mockRejectedValueOnce(new Error('boom'));

      await expect(migrate(['migrate:status'])).rejects.toThrow('exit:1');
      expect(error).toHaveBeenCalledWith('[frogbot] migrate:status failed: boom');
    });
  });

  describe('dev-push marker pre-check', () => {
    it('fails fast without migrating when a marker row exists and stdin is not a TTY', async () => {
      mocks.find.mockResolvedValue({ docs: [{ batch: -1 }] });
      setTTY(undefined);

      await expect(migrate(['migrate'])).rejects.toThrow('exit:1');
      expect(mocks.find).toHaveBeenCalledWith({
        collection: 'payload-migrations',
        limit: 1,
        where: { batch: { equals: -1 } },
      });
      expect(mocks.adapter.migrate).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('[frogbot] migrate failed: dev-mode schema changes detected'),
      );
    });

    it('still delegates to the adapter when a marker row exists in a TTY', async () => {
      mocks.find.mockResolvedValue({ docs: [{ batch: -1 }] });
      setTTY(true);

      await expect(migrate(['migrate'])).rejects.toThrow('exit:0');
      expect(mocks.adapter.migrate).toHaveBeenCalledTimes(1);
    });

    it('proceeds when the marker query itself fails', async () => {
      mocks.find.mockRejectedValue(new Error('relation does not exist'));
      setTTY(undefined);

      await expect(migrate(['migrate'])).rejects.toThrow('exit:0');
      expect(mocks.adapter.migrate).toHaveBeenCalledTimes(1);
    });
  });

  it('exits after migrate:status through tsx and the real SQLite adapter', async () => {
    const script = `process.argv = ['node', 'frogbot', 'migrate:status']; const { bin } = await import(${JSON.stringify(binURL)}); await bin();`;
    const { stdout } = await execFileAsync(
      process.execPath,
      ['--import', tsxLoader, '--input-type=module', '--eval', script],
      {
        cwd: templateDir,
        env: {
          ...process.env,
          DATABASE_URL: 'file:./frogbot.db',
          FROGBOT_SECRET: 'migrate-test-secret',
        },
        timeout: 15_000,
      },
    );

    expect(stdout).toContain('[frogbot] migrate:status complete.');
  });
});

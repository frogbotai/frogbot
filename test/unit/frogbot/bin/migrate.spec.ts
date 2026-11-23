import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
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
    createMigration: vi.fn(async (): Promise<{ created: boolean; path?: string } | void> => {}),
    migrate: vi.fn(async (_args?: { forceAcceptWarning?: boolean }) => {}),
    migrateDown: vi.fn(async () => {}),
    migrateFresh: vi.fn(async () => {}),
    migrateRefresh: vi.fn(async () => {}),
    migrateReset: vi.fn(async () => {}),
    migrateStatus: vi.fn(async () => {}),
  },
  find: vi.fn((): Promise<{ docs: { batch: number }[] }> => Promise.resolve({ docs: [] })),
  init: vi.fn(async () => {}),
  loadConfig: vi.fn(() =>
    Promise.resolve({
      collections: [],
      _internal: { payloadConfig: Promise.resolve({}) },
    }),
  ),
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

    it('prints the driver cause under a migrate failure', async () => {
      mocks.adapter.migrateStatus.mockRejectedValueOnce(
        new Error('Failed query: select * from "posts"', {
          cause: new Error('relation "posts" does not exist'),
        }),
      );

      await expect(migrate(['migrate:status'])).rejects.toThrow('exit:1');
      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[frogbot\] migrate:status failed: Failed query: select \* from "posts"\n {2}Caused by: Error: relation "posts" does not exist/,
        ),
      );
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
        overrideAccess: true,
        where: { batch: { equals: -1 } },
      });
      expect(mocks.adapter.migrate).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        '[frogbot] migrate failed: payload_migrations has a dev-mode row (batch -1): this database was changed by schema push in dev mode.\n' +
          'Run `frogbot migrate --force-accept-warning` to apply migrations anyway, or delete that row if the database already matches your migrations.',
      );
    });

    it('migrates without the pre-check when --force-accept-warning is set and stdin is not a TTY', async () => {
      mocks.find.mockResolvedValue({ docs: [{ batch: -1 }] });
      setTTY(undefined);

      await expect(migrate(['migrate', '--force-accept-warning'])).rejects.toThrow('exit:0');
      expect(mocks.find).not.toHaveBeenCalled();
      expect(mocks.adapter.migrate).toHaveBeenCalledWith({ forceAcceptWarning: true });
    });

    it('passes --force-accept-warning to the adapter in a TTY so Payload does not prompt', async () => {
      mocks.find.mockResolvedValue({ docs: [{ batch: -1 }] });
      setTTY(true);

      await expect(migrate(['migrate', '--force-accept-warning'])).rejects.toThrow('exit:0');
      expect(mocks.adapter.migrate).toHaveBeenCalledWith({ forceAcceptWarning: true });
    });

    it('migrates normally with --force-accept-warning and no marker row', async () => {
      setTTY(undefined);

      await expect(migrate(['migrate', '--force-accept-warning'])).rejects.toThrow('exit:0');
      expect(mocks.adapter.migrate).toHaveBeenCalledWith({ forceAcceptWarning: true });
    });

    it('still delegates to the adapter when a marker row exists in a TTY', async () => {
      mocks.find.mockResolvedValue({ docs: [{ batch: -1 }] });
      setTTY(true);

      await expect(migrate(['migrate'])).rejects.toThrow('exit:0');
      expect(mocks.adapter.migrate).toHaveBeenCalledWith({});
    });

    it('proceeds when the marker query itself fails', async () => {
      mocks.find.mockRejectedValue(new Error('relation does not exist'));
      setTTY(undefined);

      await expect(migrate(['migrate'])).rejects.toThrow('exit:0');
      expect(mocks.adapter.migrate).toHaveBeenCalledTimes(1);
    });
  });

  describe('migrate:create', () => {
    let directory: string | undefined;

    afterEach(async () => {
      if (directory) await rm(directory, { force: true, recursive: true });

      directory = undefined;
    });

    it('writes the migration without a payload argument', async () => {
      directory = await mkdtemp(join(tmpdir(), 'frogbot-migrate-create-'));
      const file = join(directory, '20260101_000000_init.ts');

      mocks.adapter.createMigration.mockImplementationOnce(async () => {
        await writeFile(
          file,
          "import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'\n\nexport async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {\n}\n",
        );

        return { created: true, path: file };
      });

      await expect(migrate(['migrate:create', 'init'])).rejects.toThrow('exit:0');
      expect(await readFile(file, 'utf8')).toBe(
        "import { MigrateUpArgs, MigrateDownArgs, sql } from '@frogbotai/db-postgres'\n\nexport async function up({ db, req }: MigrateUpArgs): Promise<void> {\n}\n",
      );
    });

    it.each([
      ['--file', '@payloadcms/db-postgres/relationships-v2-v3'],
      ['--name', '@payloadcms/db-mongodb/relationships-v2-v3'],
    ])('refuses a predefined migration from @payloadcms through %s', async (flag, file) => {
      await expect(migrate(['migrate:create', flag, file])).rejects.toThrow('exit:1');

      expect(mocks.adapter.createMigration).not.toHaveBeenCalled();
      expect(String(error.mock.calls[0]?.[0])).toContain(`can't use ${file}`);
    });

    it('creates from a FrogBot predefined migration', async () => {
      await expect(
        migrate(['migrate:create', 'upgrade', '--file', 'frogbot/migrations/upgrade-0.34']),
      ).rejects.toThrow('exit:0');

      expect(mocks.adapter.createMigration).toHaveBeenCalledWith(
        expect.objectContaining({ file: 'frogbot/migrations/upgrade-0.34' }),
      );
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
  }, 20_000);
});

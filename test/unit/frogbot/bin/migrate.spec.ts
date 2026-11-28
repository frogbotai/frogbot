import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import type * as PayloadModule from 'payload';
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
    migrateRefresh: vi.fn(
      async (): Promise<{
        cancelled?: true;
        migrated: string[];
        rolledBack: string[];
      } | void> => {},
    ),
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

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadModule>()),
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

  const setTTY = (value: boolean | undefined) => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockResolvedValue({ docs: [] });
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

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

  describe('success path', () => {
    for (const [command, method] of COMMAND_TABLE) {
      it(`\`${command}\` runs the adapter and logs completion`, async () => {
        await expect(migrate([command])).resolves.toBeDefined();
        expect(mocks.adapter[method]).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledWith(`[frogbot] ${command} complete.`);
      });
    }
  });

  describe('failure path', () => {
    it('throws the failure, exiting 1, when the adapter command rejects', async () => {
      mocks.adapter.migrateStatus.mockRejectedValueOnce(new Error('boom'));

      await expect(migrate(['migrate:status'])).rejects.toMatchObject({
        message: '[frogbot] migrate:status failed: boom',
        exitCode: 1,
        code: 'MIGRATE_FAILED',
      });
    });

    it('prints the driver cause under a migrate failure', async () => {
      mocks.adapter.migrateStatus.mockRejectedValueOnce(
        new Error('Failed query: select * from "posts"', {
          cause: new Error('relation "posts" does not exist'),
        }),
      );

      await expect(migrate(['migrate:status'])).rejects.toHaveProperty(
        'message',
        expect.stringMatching(
          /^\[frogbot\] migrate:status failed: Failed query: select \* from "posts"\n {2}Caused by: Error: relation "posts" does not exist/,
        ),
      );
    });
  });

  describe('dev-push marker pre-check', () => {
    it('fails fast with exit 2 without migrating when a marker row exists and stdin is not a TTY', async () => {
      mocks.find.mockResolvedValue({ docs: [{ batch: -1 }] });
      setTTY(undefined);

      await expect(migrate(['migrate'])).rejects.toMatchObject({
        exitCode: 2,
        code: 'CONFIRM_REQUIRED',
        message:
          '[frogbot] migrate failed: payload_migrations has a dev-mode row (batch -1): this database was changed by schema push in dev mode.\n' +
          'Run `frogbot migrate --yes` to apply migrations anyway, or delete that row if the database already matches your migrations.',
      });
      expect(mocks.find).toHaveBeenCalledWith({
        collection: 'payload-migrations',
        limit: 1,
        overrideAccess: true,
        where: { batch: { equals: -1 } },
      });
      expect(mocks.adapter.migrate).not.toHaveBeenCalled();
    });

    it('migrates without the pre-check when --force-accept-warning is set and stdin is not a TTY', async () => {
      mocks.find.mockResolvedValue({ docs: [{ batch: -1 }] });
      setTTY(undefined);

      await expect(migrate(['migrate', '--force-accept-warning'])).resolves.toBeDefined();
      expect(mocks.find).not.toHaveBeenCalled();
      expect(mocks.adapter.migrate).toHaveBeenCalledWith({ forceAcceptWarning: true });
    });

    it('passes --force-accept-warning to the adapter in a TTY so Payload does not prompt', async () => {
      mocks.find.mockResolvedValue({ docs: [{ batch: -1 }] });
      setTTY(true);

      await expect(migrate(['migrate', '--force-accept-warning'])).resolves.toBeDefined();
      expect(mocks.adapter.migrate).toHaveBeenCalledWith({ forceAcceptWarning: true });
    });

    it('migrates normally with --force-accept-warning and no marker row', async () => {
      setTTY(undefined);

      await expect(migrate(['migrate', '--yes'])).resolves.toBeDefined();
      expect(mocks.adapter.migrate).toHaveBeenCalledWith({ forceAcceptWarning: true });
    });

    it('still delegates to the adapter when a marker row exists in a TTY', async () => {
      mocks.find.mockResolvedValue({ docs: [{ batch: -1 }] });
      setTTY(true);

      await expect(migrate(['migrate'])).resolves.toBeDefined();
      expect(mocks.adapter.migrate).toHaveBeenCalledWith({ shouldPrompt: true });
    });

    it('proceeds when the marker query itself fails', async () => {
      mocks.find.mockRejectedValue(new Error('relation does not exist'));
      setTTY(undefined);

      await expect(migrate(['migrate'])).resolves.toBeDefined();
      expect(mocks.adapter.migrate).toHaveBeenCalledTimes(1);
    });
  });

  it('fails migrate:refresh when it stopped at a dev-mode row', async () => {
    mocks.adapter.migrateRefresh.mockResolvedValueOnce({
      cancelled: true,
      migrated: [],
      rolledBack: [],
    });

    await expect(migrate(['migrate:refresh'])).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringContaining('dev-mode row'),
    });
  });

  describe('without a terminal', () => {
    beforeEach(() => setTTY(undefined));

    it.each([
      ['migrate', 'migrate', 'apply migrations over dev-mode changes'],
      ['migrate:fresh', 'migrateFresh', 'drop every table'],
    ] as const)(
      'stops `%s` with exit 2 naming --yes instead of asking',
      async (command, method, what) => {
        mocks.adapter[method].mockResolvedValueOnce({
          cancelled: true,
          migrated: [],
          rolledBack: [],
        } as never);

        await expect(migrate([command])).rejects.toMatchObject({
          exitCode: 2,
          code: 'CONFIRM_REQUIRED',
          message: `[frogbot] ${command} would ask whether to ${what}, and there's no terminal to answer. Run \`frogbot ${command} --yes\` to go ahead.`,
        });
        expect(mocks.adapter[method]).toHaveBeenCalledWith(
          expect.objectContaining({ shouldPrompt: false }),
        );
      },
    );

    it('stops migrate:create of an empty migration with exit 2 naming --yes', async () => {
      mocks.adapter.createMigration.mockResolvedValueOnce({ created: false });

      await expect(migrate(['migrate:create', 'empty'])).rejects.toMatchObject({
        exitCode: 2,
        code: 'CONFIRM_REQUIRED',
      });
      expect(mocks.adapter.createMigration).toHaveBeenCalledWith(
        expect.objectContaining({ shouldPrompt: false }),
      );
    });

    it('drops tables with --yes, as with --force-accept-warning', async () => {
      await expect(migrate(['migrate:fresh', '--yes'])).resolves.toBeDefined();

      expect(mocks.adapter.migrateFresh).toHaveBeenCalledWith({
        forceAcceptWarning: true,
        shouldPrompt: false,
      });
    });
  });

  it('resolves to the migrations migrate:status found, for --json', async () => {
    const status = [{ Name: '20260101_000000_init', Batch: 1, Ran: 'Yes' }];

    mocks.adapter.migrateStatus.mockResolvedValueOnce(status as never);

    await expect(migrate(['migrate:status'])).resolves.toEqual({ migrations: status });
  });

  it('resolves to what migrate applied, for --json', async () => {
    mocks.adapter.migrate.mockResolvedValueOnce({ migrated: ['a'], rolledBack: [] } as never);

    await expect(migrate(['migrate'])).resolves.toEqual({ migrated: ['a'], rolledBack: [] });
  });

  it('throws a usage error, exiting 2, for an unknown migrate command', async () => {
    await expect(migrate(['migrate:nope'])).rejects.toMatchObject({ exitCode: 2 });
  });

  it.each([
    ['migrate:fresh', '--yse'],
    ['migrate', '-x'],
    ['migrate:create', '--bogus=1'],
  ])(
    'throws a usage error, exiting 2, without touching the database for `%s %s`',
    async (...args) => {
      await expect(migrate(args)).rejects.toMatchObject({ exitCode: 2 });

      expect(mocks.adapter.migrateFresh).not.toHaveBeenCalled();
      expect(mocks.adapter.migrate).not.toHaveBeenCalled();
    },
  );

  it('still accepts `-y` and `--skip-empty`', async () => {
    await expect(migrate(['migrate:status', '-y', '--skip-empty'])).resolves.toBeDefined();
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

      await expect(migrate(['migrate:create', 'init'])).resolves.toEqual({ path: file });
      expect(await readFile(file, 'utf8')).toBe(
        "import { MigrateUpArgs, MigrateDownArgs, sql } from '@frogbotai/db-postgres'\n\nexport async function up({ db, req }: MigrateUpArgs): Promise<void> {\n}\n",
      );
    });

    it.each([
      ['--file', '@payloadcms/db-postgres/relationships-v2-v3'],
      ['--name', '@payloadcms/db-mongodb/relationships-v2-v3'],
    ])('refuses a predefined migration from @payloadcms through %s', async (flag, file) => {
      await expect(migrate(['migrate:create', flag, file])).rejects.toThrow(`can't use ${file}`);

      expect(mocks.adapter.createMigration).not.toHaveBeenCalled();
    });

    it('creates from a FrogBot predefined migration', async () => {
      await expect(
        migrate(['migrate:create', 'upgrade', '--file', 'frogbot/migrations/upgrade-0.34']),
      ).resolves.toBeDefined();

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

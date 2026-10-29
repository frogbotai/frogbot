import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { loadConfig } from 'frogbot/internal';
import { FrogBot } from 'frogbot/test';
import { BasePayload } from 'payload';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  type DataInventory,
  describeData,
  takeInventory,
} from '../../packages/plugins/plugin-dojo/src/cli/data/inventory.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import {
  appRoot,
  databasePath,
  dealsSlug,
  filesSlug,
  reminderTaskSlug,
  scansSlug,
  trainingSessionsSlug,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const password = 'frogbot-int-password';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const laptopTables = [
  'payload_jobs',
  'frogbot_waitpoints',
  'payload_locked_documents',
  'payload_locked_documents_rels',
  'payload_kv',
  'frogbot_trigger_subscriptions',
  'users_sessions',
];

const sha256 = async (file: string) =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');

function query(file: string, sql: string): Record<string, unknown>[] {
  const db = new DatabaseSync(file, { readOnly: true });

  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}

const count = (file: string, table: string) =>
  Number(query(file, `SELECT COUNT(*) AS count FROM ${table}`)[0]?.count);

async function seed(): Promise<void> {
  const booted = await bootFrogBot(dirname);

  try {
    const { frogbot, payload } = booted;

    await vi.waitFor(async () => {
      expect(await frogbot.triggers.list()).toContainEqual(
        expect.objectContaining({ agent: 'ops', status: 'active' }),
      );
    });

    const deals = [];

    for (let index = 0; index < 43; index++) {
      deals.push(
        await payload.create({
          collection: dealsSlug,
          data: { title: `Deal ${index + 1}` },
          overrideAccess: true,
        }),
      );
    }

    await payload.update({
      collection: dealsSlug,
      id: deals[42].id,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
    });

    const users = [];

    for (const name of ['ada', 'bob', 'cy']) {
      users.push(
        await payload.create({
          collection: usersSlug,
          data: { email: `${name}@frogbot.local`, password, name },
          overrideAccess: true,
        }),
      );
    }

    await payload.login({
      collection: usersSlug,
      data: { email: 'ada@frogbot.local', password },
    });

    for (let index = 0; index < 12; index++) {
      await payload.create({
        collection: filesSlug,
        data: {},
        file: { data: PNG, mimetype: 'image/png', name: `scan-${index + 1}.png`, size: PNG.length },
        overrideAccess: true,
      });
    }

    await payload.create({
      collection: trainingSessionsSlug,
      data: { topic: 'Onboarding' },
      overrideAccess: true,
    });

    await payload.create({
      collection: 'chats',
      data: { title: 'Pipeline review', user: users[0].id },
      overrideAccess: true,
    });

    const job = await payload.jobs.queue({
      task: reminderTaskSlug,
      input: {},
      waitUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      overrideAccess: true,
    });

    await payload.create({
      collection: 'frogbot-waitpoints',
      data: { jobId: String(job.id), holder: job.id, name: 'wait', token: 'laptop', kind: 'delay' },
      overrideAccess: true,
    });

    await payload.create({
      collection: 'payload-locked-documents',
      data: {
        document: { relationTo: dealsSlug, value: deals[0].id },
        user: { relationTo: usersSlug, value: users[0].id },
      },
      overrideAccess: true,
    });

    await frogbot.kv.set('laptop-state', { channel: 'alerts' });
  } finally {
    await booted.shutdown();
  }
}

describe('takeInventory on an app seeded through FrogBot', () => {
  const previousConfigPath = process.env.FROGBOT_CONFIG_PATH;
  let inventory: DataInventory;
  let hashBefore: string;
  let hashAfter: string;
  let frogbotInit: ReturnType<typeof vi.spyOn>;
  let payloadInit: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    await rm(appRoot, { recursive: true, force: true });
    await mkdir(path.join(appRoot, scansSlug), { recursive: true });
    await writeFile(path.join(appRoot, scansSlug, 'stored-elsewhere.png'), PNG);

    process.env.FROGBOT_CONFIG_PATH = path.join(dirname, 'config.ts');

    await seed();

    hashBefore = await sha256(databasePath);

    frogbotInit = vi.spyOn(FrogBot.prototype, 'init');
    payloadInit = vi.spyOn(BasePayload.prototype, 'init');

    const config = await loadConfig({ cwd: appRoot, mode: 'codegen' });
    const result = await takeInventory({
      root: appRoot,
      config: await config._internal.payloadConfig,
    });

    if (!result || result === 'unsupported') throw new Error(`No inventory: ${result}`);

    inventory = result;
    hashAfter = await sha256(databasePath);
  });

  afterAll(async () => {
    vi.restoreAllMocks();

    if (previousConfigPath === undefined) delete process.env.FROGBOT_CONFIG_PATH;
    else process.env.FROGBOT_CONFIG_PATH = previousConfigPath;

    await inventory?.dispose();
    await rm(appRoot, { recursive: true, force: true });
  });

  it('counts the visible records, without trash or anything internal', () => {
    expect(describeData(inventory)).toBe('42 deals, 3 users, 12 files');
  });

  it('empties what belongs to the laptop in the snapshot, and only there', () => {
    for (const table of laptopTables) {
      expect(count(databasePath, table), `${table} seeded`).toBeGreaterThan(0);
      expect(count(inventory.snapshotPath, table), `${table} in the snapshot`).toBe(0);
    }
  });

  it('keeps users, chats, a *_sessions collection and the dev migration marker', () => {
    const { snapshotPath } = inventory;

    expect(count(snapshotPath, 'users')).toBe(3);
    expect(count(snapshotPath, 'deals')).toBe(43);
    expect(count(snapshotPath, 'chats')).toBe(1);
    expect(count(snapshotPath, 'training_sessions')).toBe(1);

    const adaHash = "SELECT hash FROM users WHERE email = 'ada@frogbot.local'";

    expect(query(snapshotPath, adaHash)).toEqual(query(databasePath, adaHash));

    const migrations = query(snapshotPath, 'SELECT name, batch FROM payload_migrations');

    expect(migrations).toEqual(query(databasePath, 'SELECT name, batch FROM payload_migrations'));
    expect(migrations).toContainEqual({ name: 'dev', batch: -1 });
  });

  it('lists every local upload file at <slug>/<filename>, and none from local storage turned off', async () => {
    const onDisk = await readdir(path.join(appRoot, filesSlug));
    const keys = inventory.files.map(({ key }) => key).sort();

    expect(keys).toEqual(onDisk.map((name) => `${filesSlug}/${name}`).sort());

    for (const { filename } of query(databasePath, 'SELECT filename FROM files')) {
      expect(keys).toContain(`${filesSlug}/${String(filename)}`);
    }

    expect(onDisk.length).toBeGreaterThanOrEqual(12);
    expect(keys.some((key) => key.startsWith(`${scansSlug}/`))).toBe(false);
  });

  it('never inits FrogBot or Payload and leaves the app database unchanged', () => {
    expect(frogbotInit).not.toHaveBeenCalled();
    expect(payloadInit).not.toHaveBeenCalled();
    expect(hashAfter).toBe(hashBefore);
  });
});

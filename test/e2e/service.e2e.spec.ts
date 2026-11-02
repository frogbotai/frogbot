import { execFile } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const bin = join(repoRoot, 'packages', 'frogbot', 'bin.js');
const fixture = join(repoRoot, 'test', 'e2e', 'fixtures', 'service-app');
const apps = join(fixture, '.apps');
const one = join(apps, 'one');
const two = join(apps, 'two');

type Registration = {
  id: string;
  dir: string;
  url: string;
  pid: number;
  serverPid?: number;
  state: string;
  lastError?: string;
};

let state: string;

function env(): NodeJS.ProcessEnv {
  const vars: NodeJS.ProcessEnv = { ...process.env, XDG_STATE_HOME: state };

  for (const key of ['NODE_ENV', 'NODE_PATH', 'NODE_OPTIONS', 'FROGBOT_DIST_DIR']) delete vars[key];

  for (const key of Object.keys(vars)) if (key.startsWith('VITEST')) delete vars[key];

  return vars;
}

function frogbot(cwd: string, ...args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((done) => {
    execFile(
      process.execPath,
      [bin, ...args],
      { cwd, env: env(), timeout: 300_000 },
      (error, stdout, stderr) => {
        done({
          code: error ? Number((error as { code?: number }).code ?? 1) : 0,
          output: `${stdout}${stderr}`,
        });
      },
    );
  });
}

function registrations(): Registration[] {
  const dir = join(state, 'frogbot', 'services');

  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as Registration);
}

const registrationOf = (dir: string) => registrations().find((found) => found.dir === dir);

function alive(pid: number | undefined): boolean {
  if (!pid) return false;

  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
}

async function get(url: string): Promise<{ status: number; text: string }> {
  const response = await fetch(url);

  return { status: response.status, text: await response.text() };
}

const write = (dir: string, file: string, text: string) => writeFileSync(join(dir, file), text);
const setText = (dir: string, value: string) =>
  write(dir, 'src/text.ts', `export const text: string = ${value};\n`);

function copyApp(to: string) {
  for (const name of readdirSync(fixture)) {
    if (/^(node_modules|\.apps|\.frogbot)$|\.db(-.*)?$/.test(name)) continue;

    cpSync(join(fixture, name), join(to, name), {
      recursive: true,
      filter: (source) => !source.endsWith('importMap.js'),
    });
  }
}

function columns(db: string) {
  const read = new DatabaseSync(db, { readOnly: true });

  try {
    return read.prepare('PRAGMA table_info(notes)').all() as { name: string; notnull: number }[];
  } finally {
    read.close();
  }
}

const BUILD = { timeout: 240_000, interval: 250 };

describe('frogbot up, status and down', { timeout: 600_000 }, () => {
  beforeAll(() => {
    state = mkdtempSync(join(tmpdir(), 'frogbot-service-e2e-'));
    rmSync(apps, { recursive: true, force: true });
    copyApp(one);
    copyApp(two);
  });

  afterAll(() => {
    for (const found of registrations()) {
      for (const pid of [found.pid, found.serverPid]) {
        if (!pid) continue;
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {}

        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }
    }

    rmSync(apps, { recursive: true, force: true });
    rmSync(state, { recursive: true, force: true });
  });

  it('runs two apps on different URLs, a repeat `up` keeps the URL, and `status` lists both from anywhere', async () => {
    const first = await frogbot(one, 'up');

    expect(first.code, first.output).toBe(0);

    const second = await frogbot(two, 'up');

    expect(second.code, second.output).toBe(0);

    const a = registrationOf(one)!;
    const b = registrationOf(two)!;

    expect(a.url).not.toBe(b.url);
    expect(await get(`${a.url}/text`)).toEqual({ status: 200, text: 'first' });
    expect(await get(`${b.url}/text`)).toEqual({ status: 200, text: 'first' });

    const again = await frogbot(one, 'up');

    expect(again).toEqual({ code: 0, output: expect.stringContaining(`already up at ${a.url}`) });

    const listed = await frogbot(tmpdir(), 'status');

    expect(listed.code).toBe(0);
    expect(listed.output).toContain(one);
    expect(listed.output).toContain(two);
    expect(listed.output).toMatch(/running/);
  });

  it('finishes a stream on the old server while an edit goes live, with no failed request', async () => {
    const { url } = registrationOf(one)!;
    const stream = get(`${url}/stream?chunks=60`);
    const seen = new Set<string>();

    setText(one, "'second'");

    await vi.waitFor(async () => {
      const response = await get(`${url}/text`);

      expect(response.status).toBe(200);

      seen.add(response.text);

      expect(response.text).toBe('second');
    }, BUILD);

    const streamed = await stream;

    expect(streamed.status).toBe(200);
    expect(streamed.text.trim().split('\n')).toHaveLength(60);
    expect([...seen].every((text) => ['first', 'second'].includes(text))).toBe(true);
  });

  it('keeps the old version serving on a type error, then serves the fix', async () => {
    const { url } = registrationOf(one)!;

    setText(one, '42');
    await vi.waitFor(() => expect(registrationOf(one)?.state).toBe('update failed'), BUILD);

    expect(registrationOf(one)?.lastError).toMatch(/build failed/);
    expect(await get(`${url}/text`)).toEqual({ status: 200, text: 'second' });

    setText(one, "'third'");
    await vi.waitFor(async () => expect((await get(`${url}/text`)).text).toBe('third'), BUILD);

    expect(registrationOf(one)).toMatchObject({ state: 'running' });
    expect(registrationOf(one)?.lastError).toBeUndefined();
  });

  it('adds a new required field to the database on the next update, keeping rows', async () => {
    const db = join(one, 'frogbot.db');
    const conn = new DatabaseSync(db);

    conn.prepare('INSERT INTO notes (title) VALUES (?)').run('kept');
    conn.close();

    write(
      one,
      'src/fields.ts',
      `import type { CollectionConfig } from 'frogbot';

export const noteFields: NonNullable<CollectionConfig['fields']> = [
  { name: 'title', type: 'text' },
  { name: 'dueDate', type: 'date', required: true },
];
`,
    );

    await vi.waitFor(() => expect(columns(db).map((c) => c.name)).toContain('due_date'), BUILD);
    await vi.waitFor(() => expect(registrationOf(one)?.state).toBe('running'), BUILD);

    expect(columns(db).find((c) => c.name === 'due_date')?.notnull).toBe(0);

    const read = new DatabaseSync(db, { readOnly: true });

    expect(read.prepare("SELECT count(*) AS n FROM notes WHERE title = 'kept'").get()).toEqual({
      n: 1,
    });

    read.close();
  });

  it('restarts a killed server on the same build: `crashed`, then `running` within 2 s', async () => {
    const before = registrationOf(one)!;

    process.kill(-before.serverPid!, 'SIGKILL');

    await vi.waitFor(() => expect(registrationOf(one)?.state).toBe('crashed'), {
      timeout: 5000,
      interval: 20,
    });

    const crashedAt = Date.now();

    await vi.waitFor(() => expect(registrationOf(one)?.state).toBe('running'), {
      timeout: 10_000,
      interval: 20,
    });

    expect(Date.now() - crashedAt).toBeLessThan(2000);
    expect(registrationOf(one)?.serverPid).not.toBe(before.serverPid);
    expect(await get(`${before.url}/text`)).toEqual({ status: 200, text: 'third' });
  });

  it('stops a supervisor whose registration another one overwrote within 10 s', async () => {
    const found = registrationOf(two)!;
    const file = join(state, 'frogbot', 'services', `${found.id}.json`);

    writeFileSync(file, JSON.stringify({ ...found, id: 'someone-else' }));

    await vi.waitFor(() => expect(alive(found.pid)).toBe(false), {
      timeout: 10_000,
      interval: 100,
    });

    await vi.waitFor(() => expect(alive(found.serverPid)).toBe(false), {
      timeout: 5000,
      interval: 100,
    });

    rmSync(file);
  });

  it('`down` stops the app, leaving no process, registration or build', async () => {
    const found = registrationOf(one)!;
    const stopped = await frogbot(one, 'down');

    expect(stopped.code, stopped.output).toBe(0);
    expect(alive(found.pid)).toBe(false);
    expect(alive(found.serverPid)).toBe(false);
    expect(registrationOf(one)).toBeUndefined();
    expect(existsSync(join(one, '.frogbot', 'builds'))).toBe(false);

    expect(await frogbot(one, 'down')).toEqual({
      code: 0,
      output: expect.stringContaining('is not running'),
    });
  });
});

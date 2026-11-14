import { execFile, execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
  port: number;
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

const write = (dir: string, file: string, text: string) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
};

const catchAll = 'src/app/(frogbot)/api/[...slug]/route.ts';

function serversIn(dir: string): number[] {
  const pids = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.includes('next-server'))
    .map((line) => Number.parseInt(line, 10));

  return pids.filter((pid) => {
    try {
      const cwd = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
        encoding: 'utf8',
      });

      return cwd.split('\n').includes(`n${dir}`);
    } catch {
      return false;
    }
  });
}

function unusedPort(): Promise<number> {
  return new Promise((done) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };

      server.close(() => done(port));
    });
  });
}

const serviceLog = (dir: string) => readFileSync(join(dir, '.frogbot', 'service.log'), 'utf8');
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
    expect(a.port).toBeGreaterThanOrEqual(9696);
    expect(await get(`${a.url}/text`)).toEqual({ status: 200, text: 'first' });
    expect(await get(`http://[::1]:${a.port}/text`)).toEqual({ status: 200, text: 'first' });
    expect(await get(`${b.url}/text`)).toEqual({ status: 200, text: 'first' });

    const again = await frogbot(one, 'up');

    expect(again).toEqual({ code: 0, output: expect.stringContaining(`already up at ${a.url}`) });

    const listed = await frogbot(tmpdir(), 'status');

    expect(listed.code).toBe(0);
    expect(listed.output).toContain(one);
    expect(listed.output).toContain(two);
    expect(listed.output).toMatch(/running/);
  });

  it('regenerates the types on an update, with no second build from the write', async () => {
    const { url } = registrationOf(two)!;
    const types = join(two, 'src', 'frogbot-types.ts');
    const builds = () => serviceLog(two).split('building into').length - 1;

    expect(readFileSync(types, 'utf8')).not.toContain('summary');

    const before = builds();

    write(
      two,
      'src/fields.ts',
      "export const noteFields = [\n  { name: 'title', type: 'text' as const },\n  { name: 'summary', type: 'text' as const },\n];\n",
    );

    await vi.waitFor(() => expect(readFileSync(types, 'utf8')).toContain('summary'), BUILD);
    await vi.waitFor(() => expect(builds()).toBe(before + 1), BUILD);
    await vi.waitFor(() => expect(registrationOf(two)?.state).toBe('running'), BUILD);

    expect((await get(`${url}/text`)).status).toBe(200);
    expect(serviceLog(two).split('change seen; rebuilding')).toHaveLength(2);
    expect(builds()).toBe(before + 1);
  });

  it('restarts on an .env-only edit without a build, and rebuilds for a NEXT_PUBLIC_ key', async () => {
    const { url } = registrationOf(two)!;
    const builds = () => serviceLog(two).split('building into').length - 1;
    const before = builds();
    const { builtAt } = registrationOf(two) as Registration & { builtAt?: string };

    write(two, '.env', 'SERVICE_GREETING=hello\n');
    await vi.waitFor(async () => expect((await get(`${url}/env`)).text).toBe('hello|'), BUILD);

    expect(serviceLog(two)).toContain('only .env changed; restarting on the current build');
    expect(builds()).toBe(before);
    expect(registrationOf(two)).toMatchObject({ state: 'running', builtAt });

    write(two, '.env', 'SERVICE_GREETING=hello\nNEXT_PUBLIC_SERVICE_NAME=acme\n');
    await vi.waitFor(async () => expect((await get(`${url}/env`)).text).toBe('hello|acme'), BUILD);

    expect(serviceLog(two)).toContain('NEXT_PUBLIC_SERVICE_NAME changed; rebuilding');
    expect(builds()).toBe(before + 1);

    const again = await frogbot(two, 'up');

    expect(again.output).toMatch(/already up at .*, watching for changes \(last build \d+ s ago\)/);
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

    expect(registrationOf(one)?.lastError).toMatch(/^build failed \(exit 1\): .*src\/text\.ts/);
    expect(registrationOf(one)?.lastError).toMatch(/error TS2322|Type error/);
    expect(await get(`${url}/text`)).toEqual({ status: 200, text: 'second' });

    const listed = await frogbot(tmpdir(), 'status');

    expect(listed.output).toMatch(/update failed .*src\/text\.ts/);

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

  it('keeps updating after a route is deleted', async () => {
    const { url } = registrationOf(one)!;

    write(one, 'src/app/gone/route.ts', "export const GET = () => new Response('here');\n");
    await vi.waitFor(async () => expect((await get(`${url}/gone`)).text).toBe('here'), BUILD);

    rmSync(join(one, 'src', 'app', 'gone'), { recursive: true });
    await vi.waitFor(async () => expect((await get(`${url}/gone`)).status).toBe(404), BUILD);

    expect(registrationOf(one)).toMatchObject({ state: 'running' });

    setText(one, "'fourth'");
    await vi.waitFor(async () => expect((await get(`${url}/text`)).text).toBe('fourth'), BUILD);

    setText(one, "'third'");
    await vi.waitFor(async () => expect((await get(`${url}/text`)).text).toBe('third'), BUILD);
  });

  it('keeps the old version when the new one answers the API with an error', async () => {
    const { url } = registrationOf(one)!;
    const original = readFileSync(join(one, catchAll), 'utf8');

    expect((await get(`${url}/api/access`)).status).toBe(200);

    write(
      one,
      catchAll,
      "export function GET(): Response {\n  throw new Error('smoke: api blew up');\n}\n",
    );

    setText(one, "'broken api'");
    await vi.waitFor(() => expect(registrationOf(one)?.state).toBe('update failed'), BUILD);

    expect(registrationOf(one)?.lastError).toMatch(
      /\/api\/(health|access) with 500: Error: smoke: api blew up/,
    );
    expect(await get(`${url}/text`)).toEqual({ status: 200, text: 'third' });

    write(one, catchAll, original);
    setText(one, "'third'");
    await vi.waitFor(() => expect(registrationOf(one)?.state).toBe('running'), BUILD);
  });

  it('runs a `frogbot run` script without a terminal after a field was removed under `up`', async () => {
    const { url } = registrationOf(one)!;

    write(
      one,
      'src/fields.ts',
      `import type { CollectionConfig } from 'frogbot';

export const noteFields: NonNullable<CollectionConfig['fields']> = [{ name: 'title', type: 'text' }];
`,
    );

    setText(one, "'no due date'");

    await vi.waitFor(
      async () => expect((await get(`${url}/text`)).text).toBe('no due date'),
      BUILD,
    );

    expect(serviceLog(one)).toMatch(/Schema sync kept .*notes\.due_date/);
    expect(serviceLog(one)).not.toMatch(/ALTER TABLE/);
    expect(serviceLog(one)).not.toContain('\u001b[');

    write(
      one,
      'scripts/save.ts',
      `import { getFrogBot } from 'frogbot';

import config from '../src/frogbot.config';

const frogbot = await getFrogBot({ config });

await frogbot.create({ collection: 'notes', data: { title: 'saved' }, overrideAccess: true });
`,
    );

    const saved = await frogbot(one, 'run', 'scripts/save.ts');

    expect(saved.code, saved.output).toBe(0);
    expect(saved.output).not.toMatch(/data loss|unsettled top-level await/i);
    expect(columns(join(one, 'frogbot.db')).map((c) => c.name)).toContain('due_date');
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
    expect(await get(`${before.url}/text`)).toEqual({ status: 200, text: 'no due date' });
    expect(serviceLog(one)).toContain(`server back up (pid ${registrationOf(one)?.serverPid})`);
  });

  it('moves a running app to `--port <n>` without a rebuild, and keeps `n` after `down` and `up`', async () => {
    const port = await unusedPort();
    const moved = await frogbot(one, 'up', '--port', String(port));

    expect(moved.code, moved.output).toBe(0);
    expect(moved.output).toContain(`moved ${one} to http://127.0.0.1:${port}`);
    expect(await get(`http://127.0.0.1:${port}/text`)).toEqual({
      status: 200,
      text: 'no due date',
    });

    expect((await frogbot(one, 'down')).code).toBe(0);

    const again = await frogbot(one, 'up');

    expect(again.code, again.output).toBe(0);
    expect(registrationOf(one)?.url).toBe(`http://127.0.0.1:${port}`);
  });

  it('leaves no server behind when the supervisor is killed, and the next `up` starts one', async () => {
    const before = registrationOf(one)!;

    expect(serversIn(one)).toEqual([before.serverPid]);

    process.kill(before.pid, 'SIGKILL');

    await vi.waitFor(() => expect(serversIn(one)).toEqual([]), { timeout: 2000, interval: 50 });

    const listed = await frogbot(tmpdir(), 'status');

    expect(listed.output).toMatch(new RegExp(`${one}\\s+\\S+\\s+stopped\\s`));

    const again = await frogbot(one, 'up');

    expect(again.code, again.output).toBe(0);
    expect(serversIn(one)).toEqual([registrationOf(one)?.serverPid]);
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
    expect(await frogbot(one, 'down', '--bogus')).toEqual({
      code: 1,
      output: expect.stringContaining('unknown option --bogus; usage: frogbot down [folder]'),
    });
  });
});

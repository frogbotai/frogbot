// Cold REST e2e — boots `templates/blank` and makes the agent REST
// endpoint the FIRST API request the server sees, proving the cold-start
// path works with zero warm-up (issue #9). Readiness is polled via
// /admin/login only, which never initializes the Frogbot singleton.
// Gated by RUN_E2E=1 (`pnpm test:e2e`).

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RUN_E2E = process.env.RUN_E2E === '1';
const repoRoot = resolve(import.meta.dirname, '..', '..');

describe.skipIf(!RUN_E2E)('cold REST e2e — templates/blank via next dev', () => {
  const templateDir = join(repoRoot, 'templates', 'blank');
  const port = 3988;
  const baseURL = `http://localhost:${port}`;
  let server: ChildProcess;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'frogbot-e2e-cold-'));
    const require = createRequire(join(templateDir, 'package.json'));
    const nextBin = require.resolve('next/dist/bin/next');

    server = spawn(process.execPath, [nextBin, 'dev', '--port', String(port)], {
      cwd: templateDir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        OPENAI_API_KEY: 'sk-e2e-dummy',
        FROGBOT_SECRET: 'e2e-secret',
        DATABASE_URL: `file:${join(dataDir, 'e2e.db')}`,
      },
    });
    server.stdout?.resume();
    server.stderr?.resume();

    const deadline = Date.now() + 210000;
    for (;;) {
      try {
        const res = await fetch(`${baseURL}/admin/login`);
        if (res.ok) break;
      } catch {
        // Server not up yet.
      }
      if (Date.now() > deadline) throw new Error('cold REST dev server did not become ready');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }, 240000);

  afterAll(() => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, 'SIGKILL');
      } catch {
        server.kill('SIGKILL');
      }
    }
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('serves POST /api/agents/:slug as the very first API request', async () => {
    const res = await fetch(`${baseURL}/api/agents/assistant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ prompt: 'Hello!' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    await reader.cancel();
    expect(new TextDecoder().decode(value)).toContain('data:');
  });

  it('lists agents at GET /api/agents after the cold request', async () => {
    const res = await fetch(`${baseURL}/api/agents`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ agents: [{ slug: 'assistant' }] });
  });
});

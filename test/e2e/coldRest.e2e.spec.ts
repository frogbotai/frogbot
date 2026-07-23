import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RUN_E2E = process.env.RUN_E2E === '1';
const repoRoot = resolve(import.meta.dirname, '..', '..');

function isListening(port: number): Promise<boolean> {
  return new Promise((resolveListening) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolveListening(true);
    });
    socket.once('error', () => resolveListening(false));
  });
}

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
      if (await isListening(port)) break;
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

  it('serves agent REST endpoints when POST /api/agents/:slug is the first HTTP request', async () => {
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
    const listResponse = await fetch(`${baseURL}/api/agents`);
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({ agents: [{ slug: 'assistant' }] });
  });
});

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FrogbotRESTClient } from '../__helpers/shared/FrogbotRESTClient';

const RUN_E2E = process.env.RUN_E2E === '1';
const hasSearchKey = Boolean(process.env.BRAVE_API_KEY || process.env.EXA_API_KEY);
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

describe.skipIf(!RUN_E2E || !hasSearchKey)('web search e2e', () => {
  const fixtureDir = join(repoRoot, 'e2e-fixtures', 'tool-agent');
  const tempRoot = join(repoRoot, '.idea', 'tmp');
  const port = 3990;
  const client = new FrogbotRESTClient(`http://localhost:${port}`);
  let server: ChildProcess;
  let dataDir: string;
  let token: string;

  beforeAll(async () => {
    mkdirSync(tempRoot, { recursive: true });
    dataDir = mkdtempSync(join(tempRoot, 'web-search-'));
    const require = createRequire(join(fixtureDir, 'package.json'));
    const nextBin = require.resolve('next/dist/bin/next');
    server = spawn(process.execPath, [nextBin, 'dev', '--port', String(port)], {
      cwd: fixtureDir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DATABASE_URL: `file:${join(dataDir, 'e2e.db')}`, FROGBOT_SECRET: 'e2e-secret' },
    });
    server.stdout?.resume();
    server.stderr?.pipe(process.stderr);
    const deadline = Date.now() + 210000;
    while (!(await isListening(port))) {
      if (Date.now() > deadline) throw new Error('web search agent dev server did not become ready');
      await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
    }
    const registration = await client.post<{ token: string }>('/api/users/first-register', {
      email: 'web-search@frogbot.test',
      password: 'frogbot-e2e-password',
      name: 'Web Search Test',
    });
    expect(registration.status, JSON.stringify(registration.body)).toBe(200);
    token = registration.body.token;
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

  it.skipIf(!process.env.BRAVE_API_KEY)('performs and persists a Brave search', async () => {
    await runSearch('brave-search', 'brave_web_search');
  });

  it.skipIf(!process.env.EXA_API_KEY)('performs and persists an Exa search', async () => {
    await runSearch('exa-search', 'exa_perform_search');
  });

  async function runSearch(agent: string, toolType: string): Promise<void> {
    const auth = { headers: { authorization: `Bearer ${token}` } };
    const response = await client.post<{ text: string; threadId: string | number }>(
      `/api/agents/${agent}`,
      { prompt: 'Search the web for the official FrogBot GitHub repository.' },
      auth,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.text).toMatch(/https?:\/\//);
    const messages = await client.get<{ docs: Array<{ parts: Array<Record<string, unknown>> }> }>(
      `/api/messages?where[thread][equals]=${response.body.threadId}&sort=createdAt`,
      auth,
    );
    expect(messages.status, JSON.stringify(messages.body)).toBe(200);
    const output = messages.body.docs.flatMap(({ parts }) => parts).find(({ type }) => type === `tool-${toolType}`)?.output;
    expect(output).toBeDefined();
    expect(JSON.stringify(output)).toMatch(/title|url/);
  }
});

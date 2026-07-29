import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FrogbotRESTClient } from '../__helpers/shared/FrogbotRESTClient';

const RUN_E2E = process.env.RUN_E2E === '1';
const repoRoot = resolve(import.meta.dirname, '..', '..');
const prompt = 'Call get_secret_code now, then reply with only the exact code returned by the tool.';
const sentinel = 'FROGBOT-E2E-7421';

type RegisterBody = {
  token: string;
  user: { id: string | number };
};

type AgentBody = {
  text: string;
  threadId: string | number;
};

type FindBody<T> = {
  docs: T[];
};

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

describe.skipIf(!RUN_E2E)('agent tool calling e2e', () => {
  const fixtureDir = join(repoRoot, 'e2e-fixtures', 'tool-agent');
  const tempRoot = join(repoRoot, '.idea', 'tmp');
  const port = 3989;
  const client = new FrogbotRESTClient(`http://localhost:${port}`);
  let server: ChildProcess;
  let dataDir: string;
  let token: string;
  let userId: string | number;
  let threadId: string | number;

  beforeAll(async () => {
    mkdirSync(tempRoot, { recursive: true });
    dataDir = mkdtempSync(join(tempRoot, 'tool-calling-'));
    const require = createRequire(join(fixtureDir, 'package.json'));
    const nextBin = require.resolve('next/dist/bin/next');

    server = spawn(process.execPath, [nextBin, 'dev', '--port', String(port)], {
      cwd: fixtureDir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DATABASE_URL: `file:${join(dataDir, 'e2e.db')}`,
        E2E_ZEN_MODEL: process.env.E2E_ZEN_MODEL,
        FROGBOT_SECRET: 'e2e-secret',
      },
    });
    server.stdout?.resume();
    server.stderr?.pipe(process.stderr);

    const deadline = Date.now() + 210000;
    while (!(await isListening(port))) {
      if (Date.now() > deadline) throw new Error('tool agent dev server did not become ready');
      await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
    }

    const registration = await client.post<RegisterBody>('/api/users/first-register', {
      email: 'tool-calling@frogbot.test',
      password: 'frogbot-e2e-password',
      name: 'Tool Calling Test',
    });
    expect(registration.status, JSON.stringify(registration.body)).toBe(200);
    token = registration.body.token;
    userId = registration.body.user.id;
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

  it(
    'round-trips a tool result into the final answer',
    { retry: 2 },
    async () => {
      const response = await client.post<AgentBody>(
        '/api/agents/tool-demo',
        { prompt },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.text).toContain(sentinel);
      expect(response.body.threadId).toBeDefined();
      threadId = response.body.threadId;
    },
  );

  it(
    'persists one transcript with the completed tool call',
    { retry: 2 },
    async () => {
      const auth = { headers: { authorization: `Bearer ${token}` } };
      const threads = await client.get<
        FindBody<{ id: string | number; agent: string; user: string | number | { id: string | number } }>
      >('/api/threads', auth);

      expect(threads.status, JSON.stringify(threads.body)).toBe(200);
      expect(threads.body.docs).toHaveLength(1);
      expect(threads.body.docs[0]?.agent).toBe('tool-demo');
      const owner = threads.body.docs[0]?.user;
      expect(typeof owner === 'object' ? owner.id : owner).toBe(userId);

      const messages = await client.get<
        FindBody<{ role: string; parts: Array<Record<string, unknown>> }>
      >(`/api/messages?where[thread][equals]=${threadId}&sort=createdAt`, auth);

      expect(messages.status, JSON.stringify(messages.body)).toBe(200);
      expect(messages.body.docs).toHaveLength(2);
      expect(messages.body.docs.map(({ role }) => role)).toEqual(['user', 'assistant']);
      const assistant = messages.body.docs.find(({ role }) => role === 'assistant');
      expect(assistant).toBeDefined();
      expect(
        assistant?.parts.some(
          (part) =>
            part.type === 'tool-get_secret_code' &&
            JSON.stringify(part.output).includes(sentinel),
        ),
        JSON.stringify(assistant?.parts),
      ).toBe(true);
      expect(
        assistant?.parts.some(
          (part) => part.type === 'text' && String(part.text).includes(sentinel),
        ),
        JSON.stringify(assistant?.parts),
      ).toBe(true);
    },
  );
});

// Scaffold e2e — boots `templates/blank` (the exact app `create-frogbot-app`
// ships) through the real Next.js dev server and asserts the public surface:
// admin panel up + FrogBot-branded, agent listing, agent SSE streaming, and
// the gateway auth gate. Gated by RUN_E2E=1 (`pnpm test:e2e`).

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FrogbotChatTransport, prepareChatRequest } from '../../packages/ui/src/chat/transport';

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

describe('branding gate', () => {
  it('finds zero Payload references in scaffold + example files', async () => {
    const result = await new Promise<{ code: number; output: string }>((resolveExit) => {
      const child = spawn(process.execPath, [join(repoRoot, 'scripts', 'check-branding.mjs')]);
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => (output += chunk));
      child.stderr.on('data', (chunk: Buffer) => (output += chunk));
      child.on('close', (code) => resolveExit({ code: code ?? 1, output }));
    });

    expect(result.output).toContain('zero Payload references');
    expect(result.code).toBe(0);
  });
});

describe.skipIf(!RUN_E2E)('scaffold e2e — templates/blank via next dev', () => {
  const templateDir = join(repoRoot, 'templates', 'blank');
  const port = 3987;
  const baseURL = `http://localhost:${port}`;
  let server: ChildProcess;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'frogbot-e2e-'));
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
      if (Date.now() > deadline) throw new Error('scaffold dev server did not become ready');
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

  it('serves a FrogBot-branded admin login page', async () => {
    const res = await fetch(`${baseURL}/admin/login`);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toMatch(/<title>[^<]*- FrogBot<\/title>/);
    expect(html).toContain('frogbot-graphic-logo');
    expect(html).not.toMatch(/<title>[^<]*Payload[^<]*<\/title>/);
  });

  it('lists the scaffold agent at /api/agents', async () => {
    const res = await fetch(`${baseURL}/api/agents`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ agents: [{ slug: 'assistant' }] });
  });

  it('streams SSE from the agent endpoint', async () => {
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

  it('sends homepage chat messages through the FrogBot transport', async () => {
    const page = await fetch(baseURL);
    expect(page.status).toBe(200);

    let responseStatus: number | undefined;
    const transport = new FrogbotChatTransport({
      agentSlug: 'assistant',
      apiBase: `${baseURL}/api`,
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        responseStatus = response.status;
        return response;
      },
      prepareSendMessagesRequest: prepareChatRequest(),
    });
    try {
      const stream = await transport.sendMessages({
        chatId: 'new:assistant',
        messageId: 'user-1',
        messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hello!' }] }],
        trigger: 'submit-message',
      });
      const { value } = await stream.getReader().read();
      expect(value).toBeDefined();
    } catch (error) {
      expect(String(error)).not.toContain('Body must include');
    }
    expect(responseStatus).toBeDefined();
    expect(responseStatus).not.toBe(400);
  });

  it('serves the REST API under /api', async () => {
    const res = await fetch(`${baseURL}/api/users/me`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: unknown };
    expect(body.user).toBeNull();
  });

  it('rejects unauthenticated gateway requests with 401', async () => {
    const res = await fetch(`${baseURL}/api/ai/v1/models`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { message: 'Unauthorized', type: 'authentication_error' },
    });
  });
});

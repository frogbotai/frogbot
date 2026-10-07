// Scaffold e2e — boots `templates/blank` (the exact app `create-frogbot-app`
// ships) through the real Next.js dev server and asserts the public surface:
// admin panel up + FrogBot-branded, agent listing, agent SSE streaming, and
// the gateway auth gate. Gated by RUN_E2E=1 (`pnpm test:e2e`).

import '../live/env';

import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createFrogBotSDK } from '@frogbotai/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FrogBotChatTransport, prepareChatRequest } from '../../packages/ui/src/chat/transport';
import { getFreePort, spawnServer, terminateProcess, waitForServer } from './process';

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
      child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
      child.on('close', (code) => resolveExit({ code: code ?? 1, output }));
    });

    expect(result.output).toContain('zero Payload references');
    expect(result.code).toBe(0);
  });
});

describe.skipIf(!RUN_E2E)('scaffold e2e — templates/blank via next dev', () => {
  const templateDir = join(repoRoot, 'templates', 'blank');
  let baseURL: string;
  let server: ChildProcess;
  let dataDir: string;
  let token: string;

  beforeAll(async () => {
    const port = await getFreePort();
    baseURL = `http://localhost:${port}`;
    dataDir = mkdtempSync(join(tmpdir(), 'frogbot-e2e-'));
    const require = createRequire(join(templateDir, 'package.json'));
    const nextBin = require.resolve('next/dist/bin/next');

    server = spawnServer(process.execPath, [nextBin, 'dev', '--port', String(port)], {
      cwd: templateDir,
      env: {
        ...process.env,
        FROGBOT_SECRET: 'e2e-secret',
        DATABASE_URL: `file:${join(dataDir, 'e2e.db')}`,
      },
    });

    server.stdout?.resume();
    server.stderr?.pipe(process.stderr);

    await waitForServer(server, () => isListening(port), {
      name: 'scaffold dev server',
      timeout: 210000,
      interval: 2000,
    });

    const registration = await fetch(`${baseURL}/api/users/first-register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'scaffold@frogbot.test',
        password: 'frogbot-e2e-password',
        name: 'Scaffold Test',
      }),
    });

    const body = (await registration.json()) as { token: string };
    if (registration.status !== 200) {
      throw new Error(`first-register returned ${registration.status}: ${JSON.stringify(body)}`);
    }

    token = body.token;
  }, 240000);

  afterAll(async () => {
    await terminateProcess(server);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it('serves a FrogBot-branded admin login page', async () => {
    const res = await fetch(`${baseURL}/login`);

    expect(res.status).toBe(200);

    const html = await res.text();

    expect(html).toMatch(/<title>[^<]*- FrogBot<\/title>/);
    expect(html).toContain('frogbot-graphic-logo');
    expect(html).not.toMatch(/<title>[^<]*Payload[^<]*<\/title>/);
  });

  it('lists the scaffold agent at /api/agents', async () => {
    const res = await fetch(`${baseURL}/api/agents`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    // `reasoning` levels vary by model; assert the agent/model wiring only.
    // `general()` offers the whole configured catalog, so only its default is fixed.
    expect(await res.json()).toMatchObject({
      defaultAgent: 'general',
      agents: [
        expect.objectContaining({
          slug: 'general',
          defaultModel: 'openai/gpt-5.4-mini',
          models: expect.arrayContaining(['openai/gpt-5.4-mini']),
        }),
        expect.objectContaining({
          slug: 'assistant',
          defaultModel: 'openai/gpt-5.4-mini',
          models: ['openai/gpt-5.4-mini'],
        }),
      ],
    });
  });

  it('streams SSE from the agent endpoint', async () => {
    const res = await fetch(`${baseURL}/api/agents/assistant`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt: 'Hello!' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    await reader.cancel();

    expect(new TextDecoder().decode(value)).toContain('data:');
  });

  // The template's default model must actually answer — a scaffold whose first
  // chat errors (as the old Zen free-tier default did) must fail here.
  it.skipIf(!process.env.OPENAI_API_KEY)(
    'answers the first chat with the default model',
    async () => {
      const res = await fetch(`${baseURL}/api/agents/assistant`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: 'Reply with exactly the word: ribbit' }),
      });

      expect(res.status).toBe(200);

      const stream = await res.text();

      expect(stream).not.toContain('"type":"error"');
      expect(stream).toContain('"type":"text-delta"');

      const text = [...stream.matchAll(/"type":"text-delta"[^\n]*?"delta":"((?:[^"\\]|\\.)*)"/g)]
        .map((match) => JSON.parse(`"${match[1]}"`) as string)
        .join('');

      expect(text.toLowerCase()).toContain('ribbit');
    },
    120000,
  );

  function expectPersisted(chatId: string | number) {
    const db = new DatabaseSync(join(dataDir, 'e2e.db'));
    const chat = db.prepare('SELECT count(*) AS count FROM chats WHERE id = ?').get(chatId) as {
      count: number;
    };

    const messages = db
      .prepare('SELECT role FROM messages WHERE chat_id = ? ORDER BY role')
      .all(chatId) as Array<{ role: string }>;

    db.close();

    expect(chat.count).toBe(1);
    expect(messages.map(({ role }) => role)).toEqual(['assistant', 'user']);
  }

  it('JSON agent POST returns 200 and persists one complete turn', async () => {
    const response = await fetch(`${baseURL}/api/agents/assistant`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt: 'Reply with exactly: hello' }),
    });

    const body = (await response.json()) as {
      text: string;
      finishReason: string;
      chatId: string | number;
    };

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.text).toBe('hello');
    expect(body.finishReason).toBe('stop');

    expectPersisted(body.chatId);
  });

  it('fully consumed SSE agent POST persists one complete turn', async () => {
    const response = await fetch(`${baseURL}/api/agents/assistant`, {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt: 'Reply with exactly: hello' }),
    });

    expect(response.status).toBe(200);

    const reader = response.body!.getReader();

    for (;;) {
      if ((await reader.read()).done) break;
    }

    const chatId = response.headers.get('X-FrogBot-Chat-Id');

    expect(chatId).not.toBeNull();

    expectPersisted(chatId!);
  });

  it('sends homepage chat messages through the FrogBot transport', async () => {
    const page = await fetch(baseURL);

    expect(page.status).toBe(200);

    let responseStatus: number | undefined;
    const transport = new FrogBotChatTransport({
      agentSlug: 'assistant',
      sdk: createFrogBotSDK({
        baseURL: `${baseURL}/api`,
        headers: { authorization: `Bearer ${token}` },
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const response = await fetch(input, init);
          responseStatus = response.status;

          return response;
        },
      }),
      prepareSendMessagesRequest: prepareChatRequest(),
    });

    const stream = await transport.sendMessages({
      chatId: 'new:assistant',
      messageId: 'user-1',
      messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hello!' }] }],
      trigger: 'submit-message',
      abortSignal: undefined,
    });

    const chunks = [];
    const reader = stream.getReader();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    expect(responseStatus).toBe(200);
    expect(chunks.length).toBeGreaterThan(0);
    expect(
      chunks.some((chunk) => chunk.type === 'text-delta'),
      JSON.stringify(chunks),
    ).toBe(true);
    expect(transport.chatId).toBeDefined();

    expectPersisted(transport.chatId!);
  });

  it('serves the REST API under /api', async () => {
    const res = await fetch(`${baseURL}/api/users/me`);

    expect(res.status).toBe(200);

    const body = (await res.json()) as { user: unknown };

    expect(body.user).toBeNull();
  });

  it('rejects unauthenticated gateway requests with 401', async () => {
    const res = await fetch(`${baseURL}/api/v1/models`);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { message: 'Unauthorized', type: 'authentication_error' },
    });
  });
});

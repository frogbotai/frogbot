import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

describe.skipIf(!RUN_E2E)('cold REST e2e — templates/blank via next dev', () => {
  const templateDir = join(repoRoot, 'templates', 'blank');
  let port: number;
  let baseURL: string;
  let server: ChildProcess;
  let dataDir: string;
  let token: string;

  beforeAll(async () => {
    port = await getFreePort();
    baseURL = `http://localhost:${port}`;
    dataDir = mkdtempSync(join(tmpdir(), 'frogbot-e2e-cold-'));
    const require = createRequire(join(templateDir, 'package.json'));
    const nextBin = require.resolve('next/dist/bin/next');

    server = spawnServer(process.execPath, [nextBin, 'dev', '--port', String(port)], {
      cwd: templateDir,
      env: {
        ...process.env,
        OPENAI_API_KEY: 'sk-e2e-dummy',
        FROGBOT_SECRET: 'e2e-secret',
        DATABASE_URL: `file:${join(dataDir, 'e2e.db')}`,
      },
    });
    server.stdout?.resume();
    server.stderr?.resume();

    await waitForServer(server, () => isListening(port), {
      name: 'cold REST dev server',
      timeout: 210000,
      interval: 2000,
    });

    const registration = await fetch(`${baseURL}/api/users/first-register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'cold-rest@frogbot.test',
        password: 'frogbot-e2e-password',
        name: 'Cold REST Test',
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

  it('serves agent REST endpoints after cold initialization', async () => {
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

  it('lists agents at GET /api/agents after the cold request', async () => {
    const listResponse = await fetch(`${baseURL}/api/agents`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.status).toBe(200);
    const model = 'openai/gpt-5.4-mini';
    const reasoning = {
      [model]: [
        { key: 'none', label: 'Off' },
        { key: 'low', label: 'Low' },
        { key: 'medium', label: 'Medium' },
        { key: 'high', label: 'High' },
        { key: 'xhigh', label: 'Extra High' },
      ],
    };
    const names = { [model]: 'GPT-5.4 mini' };
    const inputs = { [model]: ['text', 'image'] };
    const agent = (slug: string) => ({
      slug,
      label: slug,
      source: 'config',
      defaultModel: model,
      models: [model],
      names,
      reasoning,
      inputs,
    });

    const body = (await listResponse.json()) as { agents: { models: string[] }[] };

    expect(body).toEqual({
      defaultAgent: 'general',
      agents: [
        {
          ...agent('general'),
          models: expect.arrayContaining([model]),
          names: expect.objectContaining(names),
          reasoning: expect.objectContaining(reasoning),
          inputs: expect.objectContaining(inputs),
        },
        agent('assistant'),
      ],
    });
    expect(body.agents[0].models.every((id) => id.startsWith('openai/'))).toBe(true);
  });
});

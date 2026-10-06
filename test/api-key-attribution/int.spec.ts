import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeCapture } from '../../packages/plugins/plugin-capture/src/index.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { captureBlobs, upstreamPort } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Row = Record<string, unknown>;

describe('API key attribution on usage rows and captures', () => {
  let booted: BootedFrogBot;
  let upstream: Server;
  let ownerId: number | string;
  let sessionToken: string;
  const credentials = {
    email: 'attribution-owner@frogbot.local',
    password: 'frogbot-test-password',
  };

  beforeAll(async () => {
    upstream = createServer((request, response) => {
      let body = '';

      request.on('data', (chunk) => (body += chunk));

      request.on('end', () => {
        const { model } = JSON.parse(body) as { model: string };

        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: 'chatcmpl-attribution',
            created: 1,
            model,
            object: 'chat.completion',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
            ],
            usage: {
              prompt_tokens: 1_000_000,
              completion_tokens: 1_000_000,
              total_tokens: 2_000_000,
            },
          }),
        );
      });
    });
    await new Promise<void>((resolve) => upstream.listen(upstreamPort, '127.0.0.1', resolve));
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    const owner = await booted.frogbot.create({
      collection: 'accounts',
      data: { ...credentials, spendThisPeriodUSD: 0 },
      overrideAccess: true,
    });

    ownerId = owner.id;

    const login = await booted.restClient.post<{ token: string }>(
      '/api/accounts/login',
      credentials,
    );

    if (login.status !== 200) throw new Error(`Login failed with ${login.status}.`);

    sessionToken = login.body.token;
  });

  const mint = async (name: string) => {
    const response = await booted.restClient.post<{ id: number | string; token: string }>(
      '/api/credentials/mint',
      { name },
      { headers: { Authorization: `JWT ${sessionToken}` } },
    );

    if (response.status !== 201) throw new Error(`Mint failed with ${response.status}.`);

    return response.body;
  };

  const complete = async (headers: Record<string, string>) => {
    const response = await booted.restClient.post(
      '/api/v1/chat/completions',
      { model: 'test/priced', messages: [{ role: 'user', content: 'Hello' }] },
      { headers },
    );

    expect(response.status).toBe(200);

    return response.headers.get('x-request-id')!;
  };

  const findOne = (collection: string, requestId: string) =>
    vi.waitFor(async () => {
      const result = await booted.frogbot.find({
        collection: collection as never,
        where: { requestId: { equals: requestId } },
        depth: 0,
        overrideAccess: true,
      });

      expect(result.docs).toHaveLength(1);

      return result.docs[0] as Row;
    });

  const totalCost = async (id: number | string) =>
    (
      (await booted.frogbot.findByID({
        collection: 'credentials',
        id,
        overrideAccess: true,
      })) as Row
    ).totalCostUSD;

  it('attributes a keyed request to the key on the usage row and the capture', async () => {
    const key = await mint('Keyed');

    const requestId = await complete({ Authorization: `Bearer ${key.token}` });

    const usage = await findOne('usage-logs', requestId);

    expect(usage.apiKey).toStrictEqual(key.id);
    expect(usage.user).toStrictEqual(ownerId);
    expect(await totalCost(key.id)).toBe(3);

    const capture = await findOne('captures', requestId);
    const blob = await decodeCapture(captureBlobs.get(String(capture.blobKey))!);

    expect(capture.apiKey).toBe(String(key.id));
    expect(blob.apiKey).toBe(String(key.id));
  });

  it('keeps usage and Total Cost separate for two keys of the same user', async () => {
    const first = await mint('First');
    const second = await mint('Second');

    const firstRequest = await complete({ Authorization: `Bearer ${first.token}` });
    const secondRequest = await complete({ Authorization: `Bearer ${second.token}` });

    expect((await findOne('usage-logs', firstRequest)).apiKey).toStrictEqual(first.id);
    expect((await findOne('usage-logs', secondRequest)).apiKey).toStrictEqual(second.id);
    expect(await totalCost(first.id)).toBe(3);
    expect(await totalCost(second.id)).toBe(3);
  });

  it('does not attribute a session request whose user carries an apiKeyId field', async () => {
    const key = await mint('Not used');

    await booted.frogbot.update({
      collection: 'accounts',
      id: ownerId,
      data: { apiKeyId: key.id },
      overrideAccess: true,
    });

    const sessionUser = await booted.restClient.get<{ user: Row }>('/api/accounts/me', {
      headers: { Authorization: `JWT ${sessionToken}` },
    });

    expect(sessionUser.body.user.apiKeyId).toStrictEqual(key.id);

    const requestId = await complete({ Authorization: `JWT ${sessionToken}` });

    const usage = await findOne('usage-logs', requestId);

    expect(usage.user).toStrictEqual(ownerId);
    expect(usage.apiKey ?? null).toBeNull();
    expect(await totalCost(key.id)).toBe(0);

    const capture = await findOne('captures', requestId);
    const blob = await decodeCapture(captureBlobs.get(String(capture.blobKey))!);

    expect(capture.apiKey ?? null).toBeNull();
    expect(blob.apiKey).toBeUndefined();

    await booted.frogbot.update({
      collection: 'accounts',
      id: ownerId,
      data: { apiKeyId: null },
      overrideAccess: true,
    });
  });

  it('exports only the captures made with the key given to export:captures --api-key', async () => {
    const { exportCaptures } = await import('../../packages/frogbot/dist/bin/exportCaptures.js');
    const key = await mint('Export');
    const other = await mint('Other');

    const keyedRequest = await complete({ Authorization: `Bearer ${key.token}` });
    const otherRequest = await complete({ Authorization: `Bearer ${other.token}` });

    await findOne('captures', keyedRequest);
    await findOne('captures', otherRequest);

    const directory = await mkdtemp(path.join(tmpdir(), 'frogbot-export-captures-'));
    const output = path.join(directory, 'captures.jsonl');
    const env = {
      FROGBOT_CONFIG_PATH: process.env.FROGBOT_CONFIG_PATH,
      PAYLOAD_DROP_DATABASE: process.env.PAYLOAD_DROP_DATABASE,
    };

    process.env.FROGBOT_CONFIG_PATH = path.join(dirname, 'config.ts');
    delete process.env.PAYLOAD_DROP_DATABASE;

    try {
      await exportCaptures(['--api-key', String(key.id), '--output', output]);

      expect(process.exitCode ?? 0).toBe(0);

      const lines = (await readFile(output, 'utf8')).trim().split('\n');
      const records = lines.map((line) => JSON.parse(line) as Row);

      expect(records.map((record) => record.requestId)).toEqual([keyedRequest]);
      expect(records[0]?.apiKey).toBe(String(key.id));
    } finally {
      for (const [name, value] of Object.entries(env)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }

      await rm(directory, { recursive: true, force: true });
    }
  });
});

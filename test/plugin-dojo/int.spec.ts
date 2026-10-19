import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { loadConfig } from 'frogbot/internal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { isServiceReachable, storageServices } from '../__helpers/shared/storage/storageServices';
import type { StubChatModel } from '../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../__helpers/shared/StubChatModel';
import {
  appModel,
  bucket,
  dojoEnv,
  filesSlug,
  gatewayPort,
  modelPort,
  routedAgentSlug,
  s3ClientConfig,
  thumbnailSize,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const password = 'frogbot-int-password';

const prompt = 'Hi';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type StoredFile = { _objectKey: string; prefix: string; filename: string };

const storedFile = (doc: object) => doc as StoredFile;

type GatewayRequest = { path: string; authorization?: string; model: string };

type FakeGateway = { requests: GatewayRequest[]; close: () => Promise<void> };

async function startFakeGateway(port: number, upstream: string): Promise<FakeGateway> {
  const requests: GatewayRequest[] = [];

  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];

    for await (const chunk of req) chunks.push(Buffer.from(chunk));

    const body = Buffer.concat(chunks).toString();

    requests.push({
      path: req.url ?? '',
      authorization: req.headers.authorization,
      model: (JSON.parse(body) as { model: string }).model,
    });

    const response = await fetch(`${upstream}${req.url}`, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body,
    });

    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? '' });
    res.end(Buffer.from(await response.arrayBuffer()));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  return {
    requests,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

describe('dojo() on a template app', () => {
  const client = new S3Client(s3ClientConfig);
  const keys: string[] = [];
  const previousEnv = { ...process.env };
  let booted: BootedFrogBot;
  let model: StubChatModel;
  let gateway: FakeGateway;
  let skipSuite = false;
  let token: string;
  let sequence = 0;

  beforeAll(async () => {
    const service = storageServices.s3;

    if (!(await isServiceReachable(service))) {
      if (process.env.CI === 'true') {
        throw new Error(`${service.name} is required in CI but is not reachable.`);
      }

      skipSuite = true;

      console.warn(
        `\x1b[33m⚠ Skipping dojo() round trip — ${service.name} not reachable. ` +
          `Start with: docker compose -f test/docker-compose.yml --profile storage up -d\x1b[0m`,
      );

      return;
    }

    delete process.env.OPENAI_API_KEY;
    Object.assign(process.env, dojoEnv, { FROGBOT_CONFIG_PATH: path.join(dirname, 'config.ts') });

    model = await startStubChatModel(modelPort);
    gateway = await startFakeGateway(gatewayPort, `http://127.0.0.1:${modelPort}`);

    await loadConfig({ cwd: dirname });

    booted = await bootFrogBot(dirname);
  });

  beforeEach(async (ctx) => {
    if (skipSuite) {
      ctx.skip();

      return;
    }

    model.reset();
    gateway.requests.length = 0;

    await clearAndSeed(booted.frogbot, 'empty');

    const email = `owner-${++sequence}@frogbot.local`;

    await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password },
      overrideAccess: true,
    });

    const login = await fetch(`${booted.baseUrl}/api/${usersSlug}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    token = ((await login.json()) as { token: string }).token;
  });

  afterEach(async () => {
    if (skipSuite) return;

    await vi.waitFor(async () => {
      const chats = await booted.frogbot.find({
        collection: 'chats',
        depth: 0,
        pagination: false,
        overrideAccess: true,
      });

      if (chats.docs.some(({ title }) => !title || title === prompt)) {
        throw new Error('Chat titles are still being generated');
      }

      const { totalDocs } = await booted.frogbot.count({
        collection: 'usage-logs',
        overrideAccess: true,
      });

      if (totalDocs < gateway.requests.length) throw new Error('AI usage is still being logged');
    });
  });

  afterAll(async () => {
    if (!skipSuite) {
      if (keys.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
      }

      await booted?.shutdown();
      await gateway?.close();
      await model?.close();
    }

    client.destroy();
    process.env = previousEnv;
  });

  function fileURL(filename: string): string {
    return `${booted.baseUrl}/api/${filesSlug}/file/${encodeURIComponent(filename)}`;
  }

  async function download(filename: string, auth = true) {
    return fetch(fileURL(filename), auth ? { headers: { authorization: `JWT ${token}` } } : {});
  }

  it('stores an upload in files at files/<uuid>/<filename> and serves it through the app', async () => {
    const body = new FormData();

    body.set('_payload', '{}');
    body.set('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), `${randomUUID()}.png`);

    const response = await fetch(`${booted.baseUrl}/api/${filesSlug}`, {
      method: 'POST',
      headers: { authorization: `JWT ${token}` },
      body,
    });

    expect(response.status).toBe(201);

    const { doc } = (await response.json()) as { doc: { id: number | string; filename: string } };

    const stored = storedFile(
      await booted.frogbot.findByID({
        collection: filesSlug,
        id: doc.id,
        depth: 0,
        overrideAccess: true,
        showHiddenFields: true,
      }),
    );

    expect(stored.prefix).toBe(filesSlug);
    expect(stored._objectKey).toMatch(UUID);

    const key = `${filesSlug}/${stored._objectKey}/${doc.filename}`;

    keys.push(key);

    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));

    expect(object.ContentType).toBe('image/png');

    const served = await download(doc.filename);

    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG);
  });

  it('refuses an anonymous read of a non-public file', async () => {
    const filename = `${randomUUID()}.txt`;
    const data = Buffer.from('private');

    const stored = storedFile(
      await booted.frogbot.create({
        collection: filesSlug,
        data: {},
        file: { data, mimetype: 'text/plain', name: filename, size: data.length },
        overrideAccess: true,
      }),
    );

    keys.push(`${filesSlug}/${stored._objectKey}/${stored.filename}`);

    const anonymous = await download(stored.filename, false);

    expect(anonymous.status).toBe(403);
    await expect(anonymous.text()).resolves.not.toContain('private');

    const owner = await download(stored.filename);

    expect(owner.status).toBe(200);
    await expect(owner.text()).resolves.toBe('private');
  });

  it('loads a file and its resized copy brought without a prefix from files/<filename>', async () => {
    const filename = `${randomUUID()}.png`;
    const thumbnail = filename.replace(/\.png$/, '-16x16.png');

    for (const name of [filename, thumbnail]) {
      const key = `${filesSlug}/${name}`;

      keys.push(key);

      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: PNG, ContentType: 'image/png' }),
      );
    }

    await booted.payload.db.create({
      collection: filesSlug,
      data: {
        filename,
        mimeType: 'image/png',
        filesize: PNG.length,
        width: 1,
        height: 1,
        variants: {
          [thumbnailSize]: {
            filename: thumbnail,
            mimeType: 'image/png',
            filesize: PNG.length,
            width: 16,
            height: 16,
          },
        },
      },
    });

    for (const name of [filename, thumbnail]) {
      const served = await download(name);

      expect(served.status, name).toBe(200);
      expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG);
    }
  });

  it("answers a chat turn through Dojo's gateway with the app's key", async () => {
    model.respond({ text: 'Hello from Dojo.' });

    const response = await fetch(`${booted.baseUrl}/api/agents/assistant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `JWT ${token}` },
      body: JSON.stringify({ prompt }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Hello from Dojo.');
    expect(gateway.requests[0]).toEqual({
      path: '/v1/chat/completions',
      authorization: `Bearer ${dojoEnv.DOJO_AI_API_KEY}`,
      model: appModel,
    });
  });

  it('runs an agent configured with openai/gpt-5.4-mini through the router', async () => {
    model.respond({ text: 'Routed.' });

    const response = await fetch(`${booted.baseUrl}/api/agents/${routedAgentSlug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `JWT ${token}` },
      body: JSON.stringify({ prompt }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Routed.');
    expect(gateway.requests.map(({ model: id }) => id)).toContain(appModel);
    expect(
      gateway.requests.every(
        ({ authorization }) => authorization === `Bearer ${dojoEnv.DOJO_AI_API_KEY}`,
      ),
    ).toBe(true);
  });
});

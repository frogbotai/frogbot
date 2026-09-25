import { Buffer } from 'node:buffer';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { createResend } from '@frogbotai/piece-resend';
import { ConnectionError, definePiece, type FrogBotConfig, type FrogBotRequest } from 'frogbot';
import { type FrogBot, getFrogBot } from 'frogbot/test';
import { BasePayload } from 'payload';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';
import { resend, Users } from './config.js';
import { usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fetch = vi.fn<typeof globalThis.fetch>();
const message = { to: 'recipient@example.com', subject: 'Hello', text: 'Welcome' };
const runtimes: FrogBot[] = [];

function requestBody(index = 0) {
  return JSON.parse(fetch.mock.calls[index]![1]!.body as string);
}

async function bootRuntime(overrides: Partial<FrogBotConfig>) {
  const config = await buildTestConfig({
    db: await getTestDatabaseAdapter({
      sqlite: sqliteAdapter({ client: { url: 'file::memory:' } }),
    }),
    admin: { user: usersSlug, importMap: { autoGenerate: false } },
    collections: [Users],
    serverURL: 'https://email.example.com',
    telemetry: false,
    ...overrides,
  });

  await new BasePayload().init({ config: config._internal.payloadConfig });

  const runtime = await getFrogBot({ config });

  runtimes.push(runtime);

  await vi.waitFor(async () => {
    expect(await runtime.kv.get('trigger:reconcile')).toBeNull();
  });

  return runtime;
}

function instrumentedPiece() {
  const clients: { apiKey: string }[] = [];
  const deliveries: { client: { apiKey: string }; req: FrogBotRequest }[] = [];
  const createEmail = definePiece({
    slug: 'transactional',
    label: 'Transactional',
    auth: z.object({ apiKey: z.string() }),
    options: z.object({ from: z.string() }),
    client({ auth }) {
      const client = { apiKey: auth.apiKey };

      clients.push(client);

      return client;
    },
    actions: [],
    email: {
      async send({ client, message, req }) {
        deliveries.push({ client, req });

        const response = await globalThis.fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${client.apiKey}` },
          body: JSON.stringify(message),
        });

        return response.json();
      },
    },
  });

  const piece = createEmail({ auth: { apiKey: 'instrumented-key' }, from: 'sender@example.com' });

  return { piece, clients, deliveries };
}

beforeEach(() => {
  vi.stubEnv('PAYLOAD_FORCE_DRIZZLE_PUSH', 'true');

  fetch.mockReset();
  fetch.mockImplementation(async (url) => {
    if (String(url) !== 'https://api.resend.com/emails') {
      throw new Error(`Unexpected email request: ${String(url)}`);
    }

    return Response.json({ id: 'sent-email' });
  });

  vi.stubGlobal('fetch', fetch);
});

afterEach(async () => {
  try {
    for (const runtime of runtimes.splice(0).reverse()) {
      await runtime.destroy();
    }
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

describe('piece-backed transactional email', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted?.shutdown();
  });

  it('boots the native piece and sends through payload.sendEmail with factory defaults', async () => {
    const result = await booted.payload.sendEmail(message);

    expect(result).toEqual({ id: 'sent-email' });
    expect(booted.frogbot.email).toBe(booted.payload.email);
    expect(booted.payload.email).toMatchObject({
      name: 'resend',
      defaultFromAddress: 'sender@example.com',
      defaultFromName: 'FrogBot',
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer email-factory-key', 'Content-Type': 'application/json' },
    });
    expect(requestBody()).toEqual({ ...message, from: '"FrogBot" <sender@example.com>' });
    expect(message).not.toHaveProperty('from');
  });

  it('maps explicit senders, recipients, bodies, and attachments through the public email getter', async () => {
    await booted.frogbot.email.sendEmail({
      from: { name: 'Override', address: 'override@example.com' },
      to: ['one@example.com', { name: 'Two', address: 'two@example.com' }],
      cc: 'copy@example.com',
      bcc: ['hidden@example.com'],
      replyTo: { name: 'Support', address: 'support@example.com' },
      subject: 'Files',
      html: '<p>Files</p>',
      text: Buffer.from('Files'),
      attachments: [
        { filename: 'text.txt', content: 'Hello' },
        { filename: 'binary.bin', content: Buffer.from([0, 128, 255]) },
        { filename: 'encoded.txt', content: 'SGVsbG8=', encoding: 'base64' },
      ],
    });

    expect(requestBody()).toEqual({
      from: 'Override <override@example.com>',
      to: ['one@example.com', 'Two <two@example.com>'],
      cc: 'copy@example.com',
      bcc: ['hidden@example.com'],
      reply_to: 'Support <support@example.com>',
      subject: 'Files',
      html: '<p>Files</p>',
      text: 'Files',
      attachments: [
        { filename: 'text.txt', content: 'SGVsbG8=' },
        { filename: 'binary.bin', content: 'AID/' },
        { filename: 'encoded.txt', content: 'SGVsbG8=' },
      ],
    });
  });

  it('delivers a usable verification token when a user is created', async () => {
    const user = await booted.payload.create({
      collection: usersSlug,
      data: { email: 'verify@example.com', password: 'initial-password' },
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(requestBody()).toMatchObject({
      from: '"FrogBot" <sender@example.com>',
      to: user.email,
      subject: expect.any(String),
    });

    const token = requestBody().html.match(/\/users\/verify\/([a-f0-9]+)/)?.[1];

    expect(token).toMatch(/^[a-f0-9]+$/);

    const before = await booted.payload.findByID({ collection: usersSlug, id: user.id });

    expect(before._verified).toBe(false);

    await expect(booted.payload.verifyEmail({ collection: usersSlug, token })).resolves.toBe(true);

    const verified = await booted.payload.findByID({ collection: usersSlug, id: user.id });
    const login = await booted.payload.login({
      collection: usersSlug,
      data: { email: user.email, password: 'initial-password' },
    });

    expect(verified._verified).toBe(true);
    expect(login.user.id).toBe(user.id);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('delivers a usable password-reset token using factory auth despite a linked user credential', async () => {
    const user = await booted.payload.create({
      collection: usersSlug,
      disableVerificationEmail: true,
      data: { email: 'reset@example.com', password: 'old-password', _verified: true },
    });

    const req = await booted.frogbot.createRequest({ user: { ...user, collection: usersSlug } });
    const store = await booted.frogbot.connections.store;
    const owner = { id: user.id, collection: usersSlug };

    await store.upsert({
      owner,
      piece: 'resend',
      method: 'secret',
      credential: { apiKey: 'user-connection-key' },
    });

    expect(await booted.frogbot.connections.resolve({ piece: resend, req })).toEqual({
      apiKey: 'user-connection-key',
    });

    const token = await booted.payload.forgotPassword({
      collection: usersSlug,
      data: { email: user.email },
      req,
    });

    expect(token).toMatch(/^[a-f0-9]+$/);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1]!.headers).toMatchObject({
      Authorization: 'Bearer email-factory-key',
    });
    expect(requestBody()).toMatchObject({
      from: '"FrogBot" <sender@example.com>',
      to: user.email,
      html: expect.stringContaining(`/reset/${token}`),
    });

    await booted.payload.resetPassword({
      collection: usersSlug,
      data: { token: token!, password: 'new-password' },
    });

    const login = await booted.payload.login({
      collection: usersSlug,
      data: { email: user.email, password: 'new-password' },
    });

    expect(login.user.id).toBe(user.id);
    expect(await store.get({ owner, piece: 'resend' })).toMatchObject({
      credential: { apiKey: 'user-connection-key' },
    });
  });

  it('does not send password-reset email for an unknown user', async () => {
    await expect(
      booted.payload.forgotPassword({
        collection: usersSlug,
        data: { email: 'absent@example.com' },
      }),
    ).resolves.toBeNull();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('propagates provider failure through forgotPassword and permits a subsequent request', async () => {
    const user = await booted.payload.create({
      collection: usersSlug,
      disableVerificationEmail: true,
      data: { email: 'retry@example.com', password: 'password' },
    });

    fetch.mockResolvedValueOnce(Response.json({ message: 'Rate limit reached' }, { status: 429 }));

    await expect(
      booted.payload.forgotPassword({ collection: usersSlug, data: { email: user.email } }),
    ).rejects.toThrow('Resend request failed (429): Rate limit reached');

    expect(fetch).toHaveBeenCalledOnce();

    const token = await booted.payload.forgotPassword({
      collection: usersSlug,
      data: { email: user.email },
    });

    expect(requestBody(1).html).toContain(token);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('propagates a provider rejection from account verification delivery', async () => {
    fetch.mockResolvedValueOnce(Response.json({ message: 'Invalid sender' }, { status: 422 }));

    await expect(
      booted.payload.create({
        collection: usersSlug,
        data: { email: 'rejected@example.com', password: 'password' },
      }),
    ).rejects.toThrow('Resend request failed (422): Invalid sender');

    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects unsupported attachments before reaching the provider', async () => {
    await expect(
      booted.payload.sendEmail({
        ...message,
        attachments: [{ filename: 'stream.txt', content: Readable.from(['body']) }],
      }),
    ).rejects.toThrow("Piece 'resend' email attachments must be a string or Buffer");

    expect(fetch).not.toHaveBeenCalled();
  });

  it('propagates network failures without retrying delivery', async () => {
    const error = new Error('Connection closed');

    fetch.mockRejectedValueOnce(error);

    await expect(booted.payload.sendEmail(message)).rejects.toBe(error);

    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('email piece boot and runtime isolation', () => {
  it.each([
    {
      email: definePiece({ slug: 'quickbooks', label: 'QuickBooks', actions: [] })(),
      error: "Piece 'quickbooks' does not implement email",
    },
    {
      email: createResend({ auth: { apiKey: 'test-key' } }),
      error: "Piece 'resend' is used as email but has no from",
    },
    { email: () => ({}), error: 'email must be a piece that implements email' },
  ])('rejects promised invalid configuration at real boot: $error', async ({ email, error }) => {
    const config = await buildTestConfig({
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({ client: { url: 'file::memory:' } }),
      }),
      admin: { user: usersSlug, importMap: { autoGenerate: false } },
      collections: [Users],
      telemetry: false,
      email: Promise.resolve(email) as FrogBotConfig['email'],
    });

    const payload = new BasePayload();

    try {
      await expect(payload.init({ config: config._internal.payloadConfig })).rejects.toThrow(error);

      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await payload.destroy();
    }
  });

  it('resolves a promised native piece once and can send during onInit', async () => {
    let resolutions = 0;
    const piece = createResend({
      auth: { apiKey: 'promised-key' },
      from: { address: 'promised@example.com' },
    });

    const email = Promise.resolve().then(() => {
      resolutions += 1;

      return piece;
    });

    const runtime = await bootRuntime({
      email,
      onInit: async (frogbot) => {
        await frogbot.email.sendEmail(message);
      },
    });

    await runtime.payload.sendEmail(message);

    expect(resolutions).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requestBody()).toMatchObject({ from: '"resend" <promised@example.com>' });
    expect(requestBody(1)).toEqual(requestBody());
    expect(
      fetch.mock.calls.every(
        ([, init]) => new Headers(init!.headers).get('Authorization') === 'Bearer promised-key',
      ),
    ).toBe(true);
  });

  it('shares clients across concurrent sends while keeping a shared piece isolated across real runtimes', async () => {
    const { piece, clients, deliveries } = instrumentedPiece();
    const first = await bootRuntime({ email: piece });
    const second = await bootRuntime({ email: piece });

    expect(first).not.toBe(second);
    expect(clients).toHaveLength(0);

    await Promise.all([
      first.payload.sendEmail(message),
      first.payload.sendEmail(message),
      second.payload.sendEmail(message),
    ]);
    await first.payload.sendEmail(message);

    expect(clients).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(new Set(deliveries.map(({ req }) => req)).size).toBe(4);

    const firstDeliveries = deliveries.filter(({ req }) => req.frogbot === first);
    const secondDeliveries = deliveries.filter(({ req }) => req.frogbot === second);

    expect(firstDeliveries).toHaveLength(3);
    expect(secondDeliveries).toHaveLength(1);
    expect(new Set(firstDeliveries.map(({ client }) => client)).size).toBe(1);
    expect(firstDeliveries[0]!.client).not.toBe(secondDeliveries[0]!.client);
    expect(firstDeliveries.every(({ req }) => req.payload === first.payload && !req.user)).toBe(
      true,
    );
    expect(secondDeliveries[0]!.req.payload).toBe(second.payload);
    expect(requestBody().from).toBe('"transactional" <sender@example.com>');
  });

  it('fails with a named ConnectionError when only a user connection has credentials', async () => {
    const piece = createResend({ from: { address: 'sender@example.com' } });
    const runtime = await bootRuntime({ email: piece, connections: [{ piece, secret: true }] });
    const user = await runtime.payload.create({
      collection: usersSlug,
      disableVerificationEmail: true,
      data: { email: 'linked@example.com', password: 'password' },
    });

    const req = await runtime.createRequest({ user: { ...user, collection: usersSlug } });
    const store = await runtime.connections.store;

    await store.upsert({
      owner: { id: user.id, collection: usersSlug },
      piece: 'resend',
      method: 'secret',
      credential: { apiKey: 'user-only-key' },
    });

    expect(await runtime.connections.resolve({ piece, req })).toEqual({ apiKey: 'user-only-key' });

    await expect(runtime.payload.sendEmail(message)).rejects.toBeInstanceOf(ConnectionError);
    await expect(
      runtime.payload.forgotPassword({
        collection: usersSlug,
        data: { email: user.email },
        req,
      }),
    ).rejects.toMatchObject({ code: 'missing', piece: 'resend' });

    expect(fetch).not.toHaveBeenCalled();
  });
});

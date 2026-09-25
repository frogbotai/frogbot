import type * as payloadModule from 'payload';
import type { Payload, SendEmailOptions } from 'payload';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ConnectionError, Connections } from '../../../../packages/frogbot/src/connections/api.js';
import { createCredentialEncryption } from '../../../../packages/frogbot/src/connections/encryption.js';
import { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import { registerFrogBotInstance } from '../../../../packages/frogbot/src/instanceRegistry.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { isEmailPiece, pieceEmailAdapter } from '../../../../packages/frogbot/src/pieces/email.js';
import type { PieceEmail } from '../../../../packages/frogbot/src/pieces/types.js';

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof payloadModule>()),
  createLocalReq: vi.fn(async ({ req }, payload) => ({ ...req, payload, user: null })),
}));

function runtime(payload = {} as Payload) {
  const frogbot = new FrogBot();

  frogbot.payload = payload;
  frogbot.config = {
    _internal: { payloadConfig: Promise.resolve({ admin: { user: 'users' } }) },
  } as never;

  frogbot.connections = new Connections(frogbot, {
    enabled: false,
    entries: {},
    encryption: createCredentialEncryption({ secret: 'email-test-secret' }),
  });

  registerFrogBotInstance(payload, frogbot);

  return { frogbot, payload };
}

function fixture({
  from = 'sender@example.com',
  auth = true,
}: { from?: unknown; auth?: boolean } = {}) {
  const send = vi.fn<PieceEmail<object, unknown>['send']>().mockResolvedValue({ id: 'sent' });
  const client = vi.fn(async ({ auth }: { auth: unknown }) => ({ auth }));
  const createEmail = definePiece({
    slug: 'mailer',
    label: 'Mailer',
    auth: z.object({ token: z.string() }),
    options: z.object({ from: z.unknown().optional(), region: z.string().default('us') }),
    client,
    actions: [],
    email: { send },
  });

  const piece = createEmail({ from, ...(auth ? { auth: { token: 'factory-token' } } : {}) });

  return { piece, send, client };
}

const message = { to: 'recipient@example.com', subject: 'Hello', text: 'Welcome' };

describe('piece email adapter', () => {
  it.each([undefined, null, false, '', 42, () => ({}), { slug: 'fake', email: { send() {} } }])(
    'rejects non-piece values: %s',
    (value) => {
      expect(isEmailPiece(value)).toBe(false);
      expect(() => pieceEmailAdapter(value)).toThrow('email must be a piece that implements email');
    },
  );

  it('rejects a real piece without an email capability', () => {
    const piece = definePiece({ slug: 'quickbooks', label: 'QuickBooks', actions: [] })();

    expect(isEmailPiece(piece)).toBe(false);
    expect(() => pieceEmailAdapter(piece)).toThrow("Piece 'quickbooks' does not implement email");
  });

  it.each([null, '', '  ', {}, { address: '' }, { address: 42 }, { address: 'a@b.com', name: 42 }])(
    'rejects missing or unusable factory from: %s',
    (from) => {
      const { piece } = fixture({ from });

      expect(() => pieceEmailAdapter(piece)).toThrow(
        "Piece 'mailer' is used as email but has no from",
      );
    },
  );

  it('rejects an email piece whose factory has no from option', () => {
    const piece = definePiece({
      slug: 'no-sender',
      label: 'No sender',
      actions: [],
      email: { async send() {} },
    })();

    expect(() => pieceEmailAdapter(piece)).toThrow(
      "Piece 'no-sender' is used as email but has no from",
    );
  });

  it.each([
    { from: 'sender@example.com', name: 'mailer' },
    { from: { address: 'sender@example.com' }, name: 'mailer' },
    { from: { address: 'sender@example.com', name: 'FrogBot' }, name: 'FrogBot' },
  ])('exposes sender defaults and supplies them at send time: $name', async ({ from, name }) => {
    const { piece, send, client } = fixture({ from });
    const payload = {} as Payload;
    const adapter = pieceEmailAdapter(piece)({ payload });

    expect(isEmailPiece(piece)).toBe(true);
    expect(piece).not.toHaveProperty('email');
    expect(client).not.toHaveBeenCalled();
    expect(adapter).toMatchObject({
      name: 'mailer',
      defaultFromAddress: 'sender@example.com',
      defaultFromName: name,
    });

    const { frogbot } = runtime(payload);
    const result = await adapter.sendEmail({ ...message, from: undefined });

    expect(result).toEqual({ id: 'sent' });
    expect(send).toHaveBeenCalledWith({
      message: { ...message, from: `"${name}" <sender@example.com>` },
      client: { auth: { token: 'factory-token' } },
      options: { from, region: 'us' },
      req: expect.objectContaining({ frogbot, payload, user: null }),
    });
    expect(message).not.toHaveProperty('from');
  });

  it.each<NonNullable<SendEmailOptions['from']>>([
    'Override <other@example.com>',
    { address: 'other@example.com', name: 'Override' },
  ])('preserves an explicit sender unchanged: %s', async (from) => {
    const { piece, send } = fixture();
    const adapter = pieceEmailAdapter(piece)(runtime());
    const original = Object.freeze({ ...message, from });

    await adapter.sendEmail(original);

    expect(send.mock.calls[0]![0].message).toEqual(original);
    expect(send.mock.calls[0]![0].message.from).toBe(from);
  });

  it('uses the instance slug for adapter identity and unnamed senders', () => {
    const piece = definePiece({
      slug: 'mailer',
      label: 'Mailer',
      options: z.object({ from: z.string() }),
      actions: [],
      email: { async send() {} },
    })({ slug: 'transactional', from: 'sender@example.com' });

    expect(pieceEmailAdapter(piece)({ payload: {} as Payload })).toMatchObject({
      name: 'transactional',
      defaultFromName: 'transactional',
    });
  });

  it('preserves an auth-flow sender assembled from the public adapter defaults', async () => {
    const { piece, send } = fixture({ from: { address: 'sender@example.com', name: 'FrogBot' } });
    const { frogbot, payload } = runtime();

    payload.email = pieceEmailAdapter(piece)({ payload });

    const email = frogbot.email;
    const from = `"${email.defaultFromName}" <${email.defaultFromAddress}>`;

    await email.sendEmail({ ...message, from });

    expect(from).toBe('"FrogBot" <sender@example.com>');
    expect(send.mock.calls[0]![0].message.from).toBe(from);
  });

  it('shares one pending client across concurrent sends and later sends', async () => {
    const { piece, send, client } = fixture();
    let release!: (value: { auth: unknown }) => void;
    const pending = new Promise<{ auth: unknown }>((resolve) => {
      release = resolve;
    });

    client.mockReturnValueOnce(pending);

    const adapter = pieceEmailAdapter(piece)(runtime());

    const sends = [adapter.sendEmail(message), adapter.sendEmail(message)];

    await vi.waitFor(() => expect(client).toHaveBeenCalledOnce());
    expect(send).not.toHaveBeenCalled();

    const sharedClient = { auth: 'resolved' };

    release(sharedClient);
    await Promise.all(sends);
    await adapter.sendEmail(message);

    expect(client).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.every(([args]) => args.client === sharedClient)).toBe(true);
    expect(new Set(send.mock.calls.map(([args]) => args.req)).size).toBe(3);
  });

  it('keeps clients and requests isolated by runtime for a shared piece', async () => {
    const { piece, send, client } = fixture();
    const first = runtime();
    const second = runtime();
    const factory = pieceEmailAdapter(piece);

    await factory(first).sendEmail(message);
    await factory(second).sendEmail(message);

    expect(client).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0].req.frogbot).toBe(first.frogbot);
    expect(send.mock.calls[1]![0].req.frogbot).toBe(second.frogbot);
    expect(send.mock.calls[0]![0].client).not.toBe(send.mock.calls[1]![0].client);
  });

  it('fails loudly before registration and permits sending after registration', async () => {
    const { piece, client, send } = fixture();
    const payload = {} as Payload;
    const adapter = pieceEmailAdapter(piece)({ payload });

    await expect(adapter.sendEmail(message)).rejects.toThrow(
      "Piece 'mailer' cannot send email before FrogBot is initialized",
    );
    expect(client).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();

    runtime(payload);

    await expect(adapter.sendEmail(message)).resolves.toEqual({ id: 'sent' });
  });

  it('propagates a named ConnectionError when factory credentials are absent', async () => {
    const { piece, client, send } = fixture({ auth: false });
    const adapter = pieceEmailAdapter(piece)(runtime());

    await expect(adapter.sendEmail(message)).rejects.toBeInstanceOf(ConnectionError);
    await expect(adapter.sendEmail(message)).rejects.toMatchObject({
      code: 'missing',
      piece: 'mailer',
    });
    expect(client).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('propagates a shared client failure and allows a later retry', async () => {
    const { piece, client, send } = fixture();
    const error = new Error('client unavailable');
    let reject!: (error: Error) => void;

    client.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );

    const adapter = pieceEmailAdapter(piece)(runtime());
    const results = Promise.allSettled([adapter.sendEmail(message), adapter.sendEmail(message)]);

    await vi.waitFor(() => expect(client).toHaveBeenCalledOnce());
    reject(error);

    expect(await results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    expect(send).not.toHaveBeenCalled();

    await expect(adapter.sendEmail(message)).resolves.toEqual({ id: 'sent' });
    expect(client).toHaveBeenCalledTimes(2);
  });

  it('propagates provider errors without discarding a healthy client', async () => {
    const { piece, client, send } = fixture();
    const error = new Error('provider rejected message');

    send.mockRejectedValueOnce(error);

    const adapter = pieceEmailAdapter(piece)(runtime());

    await expect(adapter.sendEmail(message)).rejects.toBe(error);
    await expect(adapter.sendEmail(message)).resolves.toEqual({ id: 'sent' });
    expect(client).toHaveBeenCalledOnce();
  });
});

import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createResendClient } from '../../../packages/pieces/piece-resend/src/client.js';
import { resendEmail } from '../../../packages/pieces/piece-resend/src/email.js';

type ResendEmailMessage = Parameters<typeof resendEmail.send>[0]['message'];
type ResendEmailOptions = Parameters<typeof resendEmail.send>[0]['options'];

const fetch = vi.fn<typeof globalThis.fetch>();

function sendEmail(
  message: ResendEmailMessage,
  options: ResendEmailOptions = { from: { address: 'from@example.com', name: 'FrogBot' } },
) {
  return resendEmail.send({
    message,
    client: createResendClient({ apiKey: 'sk-test' }),
    options,
    req: {} as never,
  });
}

function requestBody() {
  return JSON.parse(fetch.mock.calls[0]?.[1]?.body as string);
}

beforeEach(() => {
  fetch.mockReset();
  fetch.mockImplementation(async () => Response.json({ id: 'email-id' }));

  vi.stubGlobal('fetch', fetch);
});

afterEach(() => vi.unstubAllGlobals());

describe('Resend native email mapping', () => {
  it('posts mapped email fields through the authenticated client and returns the provider result', async () => {
    const result = await sendEmail({
      from: { address: 'sender@example.com', name: 'Sender' },
      to: ['to@example.com', { address: 'other@example.com', name: 'Other' }],
      cc: { address: 'cc@example.com', name: 'Copy' },
      bcc: 'bcc@example.com',
      replyTo: ['reply@example.com', { address: 'support@example.com', name: 'Support' }],
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
    });

    expect(result).toEqual({ id: 'email-id' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://api.resend.com/emails');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
    });
    expect(requestBody()).toEqual({
      from: 'Sender <sender@example.com>',
      to: ['to@example.com', 'Other <other@example.com>'],
      cc: 'Copy <cc@example.com>',
      bcc: 'bcc@example.com',
      reply_to: ['reply@example.com', 'Support <support@example.com>'],
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
  });

  it.each([
    { from: undefined, expected: 'FrogBot <from@example.com>' },
    { from: 'Explicit <sender@example.com>', expected: 'Explicit <sender@example.com>' },
    { from: { address: 'sender@example.com', name: '' }, expected: 'sender@example.com' },
  ])('maps from $expected', async ({ from, expected }) => {
    await sendEmail({ from, to: 'to@example.com', subject: 'Hello', text: 'Body' });

    expect(requestBody().from).toBe(expected);
  });

  it('uses an unnamed factory sender and omits absent optional fields', async () => {
    await sendEmail(
      { to: 'to@example.com', subject: 'Hello', text: 'Body' },
      { from: { address: 'from@example.com' } },
    );

    expect(requestBody()).toEqual({
      from: 'from@example.com',
      to: 'to@example.com',
      subject: 'Hello',
      text: 'Body',
    });
  });

  it('accepts an explicit sender without a factory default', async () => {
    await sendEmail({ from: 'sender@example.com', to: 'to@example.com', text: 'Body' }, {});

    expect(requestBody().from).toBe('sender@example.com');
  });

  it('rejects a missing sender before making a request', async () => {
    await expect(sendEmail({ to: 'to@example.com', text: 'Body' }, {})).rejects.toThrow(
      '[frogbot] Resend email requires a from address.',
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps Buffer bodies to UTF-8 strings and defaults a missing subject', async () => {
    await sendEmail({
      to: 'to@example.com',
      html: Buffer.from('<p>Bonjour 🐸</p>'),
      text: Buffer.from('Bonjour 🐸'),
    });

    expect(requestBody()).toEqual({
      from: 'FrogBot <from@example.com>',
      to: 'to@example.com',
      subject: '',
      html: '<p>Bonjour 🐸</p>',
      text: 'Bonjour 🐸',
    });
  });

  it('preserves explicitly empty subject and bodies', async () => {
    await sendEmail({ to: 'to@example.com', subject: '', html: '', text: '' });

    expect(requestBody()).toMatchObject({ subject: '', html: '', text: '' });
  });

  it('base64-encodes attachments without mutating their contents or forwarding local options', async () => {
    const binary = Buffer.from([0, 128, 255]);
    const attachments = [
      { filename: 'hello.txt', content: 'Hello 🐸' },
      { filename: 'binary.bin', content: binary },
      { filename: 'encoded.txt', content: 'SGVsbG8=', encoding: 'base64' },
      { filename: 'hex.bin', content: '0080ff', encoding: 'hex' },
      { filename: 'latin.txt', content: 'é', encoding: 'latin1' },
      { filename: 'empty.txt', content: '' },
      { filename: 'empty.bin', content: Buffer.alloc(0) },
    ];

    await sendEmail({ to: 'to@example.com', subject: 'Files', attachments });

    expect(requestBody().attachments).toEqual([
      { filename: 'hello.txt', content: 'SGVsbG8g8J+QuA==' },
      { filename: 'binary.bin', content: 'AID/' },
      { filename: 'encoded.txt', content: 'SGVsbG8=' },
      { filename: 'hex.bin', content: 'AID/' },
      { filename: 'latin.txt', content: '6Q==' },
      { filename: 'empty.txt', content: '' },
      { filename: 'empty.bin', content: '' },
    ]);
    expect(binary).toEqual(Buffer.from([0, 128, 255]));
    expect(attachments[0]?.content).toBe('Hello 🐸');
    expect(attachments[2]?.content).toBe('SGVsbG8=');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('accepts an empty attachment list', async () => {
    await sendEmail({ to: 'to@example.com', subject: 'No files', attachments: [] });

    expect(requestBody().attachments).toEqual([]);
  });

  it.each([
    ['stream', () => ({ content: Readable.from(['file']) })],
    ['byte array', () => ({ content: new Uint8Array([1, 2]) })],
    ['number', () => ({ content: 42 })],
    ['null content', () => ({ content: null })],
    ['missing content', () => ({})],
    ['local path', () => ({ path: '/tmp/attachment.txt' })],
    ['remote path', () => ({ path: 'https://files.example.com/attachment.txt' })],
    ['URL path', () => ({ path: new URL('https://files.example.com/attachment.txt') })],
    ['href', () => ({ href: 'https://files.example.com/attachment.txt' })],
    ['raw attachment', () => ({ raw: 'raw MIME content' })],
  ])('rejects %s attachments before any fetch', async (_name, attachment) => {
    const message = {
      to: 'to@example.com',
      subject: 'Files',
      attachments: [
        { filename: 'valid.txt', content: 'Valid' },
        { filename: 'invalid.txt', ...attachment() },
      ],
    } as ResendEmailMessage;

    await expect(sendEmail(message)).rejects.toThrow(
      "Piece 'resend' email attachments must be a string or Buffer",
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses supplied attachment content without fetching its path', async () => {
    await sendEmail({
      to: 'to@example.com',
      subject: 'Files',
      attachments: [
        { filename: 'local.txt', content: '', path: 'https://files.example.com/ignored.txt' },
      ],
    });

    expect(requestBody().attachments).toEqual([{ filename: 'local.txt', content: '' }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://api.resend.com/emails');
  });

  it.each([401, 422, 429, 500])('throws Resend errors for HTTP %s', async (status) => {
    fetch.mockResolvedValueOnce(Response.json({ message: 'Provider error' }, { status }));

    await expect(sendEmail({ to: 'to@example.com', text: 'Body' })).rejects.toThrow(
      `Resend request failed (${status}): Provider error`,
    );

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves the client fallback for non-JSON errors', async () => {
    fetch.mockResolvedValueOnce(
      new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' }),
    );

    await expect(sendEmail({ to: 'to@example.com', text: 'Body' })).rejects.toThrow(
      'Resend request failed (502): Bad Gateway',
    );
  });

  it('propagates network failures without retrying the send', async () => {
    const error = new Error('Connection closed');

    fetch.mockRejectedValueOnce(error);

    await expect(sendEmail({ to: 'to@example.com', text: 'Body' })).rejects.toBe(error);

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

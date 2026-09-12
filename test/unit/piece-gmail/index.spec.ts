import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createGmail,
  gmailActions,
  gmailScopes,
  gmailTriggers,
} from '../../../packages/pieces/piece-gmail/src/index.js';

const auth = { accessToken: 'google-test', refreshToken: 'refresh-test' };
const key = {};
const findByID = vi.fn();
const create = vi.fn();
const req = {
  headers: new Headers(),
  signal: undefined,
  url: 'https://app.test/api',
  user: null,
  frogbot: {
    config: {
      files: { slug: 'files' },
      _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
    },
    create,
    findByID,
    connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key }) },
  },
} as never;

function response(data: unknown, config: unknown) {
  return { data, config, headers: new Headers(), status: 200, statusText: 'OK' };
}
async function fixture() {
  const gmail = createGmail({ auth });
  const client = await gmail.client({ req });
  const transport = vi.fn(async (config: any) => {
    const url = String(config.url);
    if (url.endsWith('/profile')) return response({ emailAddress: 'user@example.com' }, config);
    if (url.includes('/messages/original/attachments/attachment')) {
      return response({ data: Buffer.from('downloaded').toString('base64') }, config);
    }
    if (url.includes('/messages/original')) {
      return response(
        {
          id: 'original',
          threadId: 'thread',
          payload: {
            headers: [
              { name: 'From', value: 'sender@example.com' },
              { name: 'To', value: 'user@example.com' },
              { name: 'Cc', value: 'copy@example.com' },
              { name: 'Subject', value: 'Hello' },
              { name: 'Message-ID', value: '<message@example.com>' },
            ],
            parts: [
              {
                filename: 'download.txt',
                mimeType: 'text/plain',
                body: { attachmentId: 'attachment' },
              },
            ],
          },
        },
        config,
      );
    }
    if (url.endsWith('/messages') && config.method === 'GET') {
      return response({ messages: [{ id: 'found', threadId: 'thread' }] }, config);
    }
    if (url.includes('/messages/found')) {
      return response({ id: 'found', threadId: 'thread', snippet: 'Result' }, config);
    }
    if (url.endsWith('/messages/send')) {
      return response({ id: 'sent', threadId: config.data?.threadId ?? 'thread' }, config);
    }
    if (url.endsWith('/drafts')) {
      return response(
        { message: { id: 'draft', threadId: config.data?.message?.threadId ?? 'thread' } },
        config,
      );
    }
    return response({ ok: true }, config);
  });
  (client.context._options.auth as any).transporter = { request: transport };
  return { gmail, client, transport };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('attachment data')));
  findByID.mockResolvedValue({
    id: 'file',
    url: '/api/files/file/document.txt',
    filename: 'document.txt',
    mimeType: 'text/plain',
  });
  create.mockResolvedValue({ id: 'uploaded', url: '/api/files/uploaded/download.txt' });
});

describe('gmail', () => {
  it('declares semantic actions, polling, and Google OAuth', () => {
    const gmail = createGmail({ oauth: { clientId: 'client', clientSecret: 'secret' } });
    expect(pieceInstanceTools(gmail)?.map(({ slug }) => slug)).toEqual(
      gmailActions.map((slug) => `gmail_${slug}`),
    );
    expect(Object.keys(gmail.triggers)).toEqual(gmailTriggers);
    const definition = pieceFactoryDefinition(createGmail);
    expect(definition.oauth).toMatchObject({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: [...gmailScopes],
      params: { access_type: 'offline', prompt: 'consent' },
    });
    expect(
      definition.oauth?.toAuth?.({ tokens: { access_token: 'access', refresh_token: 'refresh' } }),
    ).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
  });

  it('maps send and file attachments to Gmail MIME transport', async () => {
    const { gmail, transport } = await fixture();
    await gmail.send({
      input: {
        to: ['to@example.com'],
        cc: ['cc@example.com'],
        subject: 'Subject',
        body: 'Body',
        attachments: [{ fileId: 'file' }],
      },
      req,
    });
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'files', id: 'file', overrideAccess: false }),
    );
    const call = transport.mock.calls.find(([config]) =>
      String(config.url).endsWith('/messages/send'),
    )?.[0];
    if (!call) throw new Error('Missing Gmail send request.');
    expect(call.data).toMatchObject({ raw: expect.any(String) });
    const raw = Buffer.from(
      call.data.raw.replaceAll('-', '+').replaceAll('_', '/'),
      'base64',
    ).toString();
    expect(raw).toContain('To: to@example.com');
    expect(raw).toContain('filename="document.txt"');
    expect(raw).toContain(Buffer.from('attachment data').toString('base64'));
  });

  it('maps replies and draft replies to their SDK endpoints', async () => {
    const { gmail, transport } = await fixture();
    await gmail.replyToEmail({
      input: { messageId: 'original', replyType: 'replyAll', body: 'Reply' },
      req,
    });
    await gmail.createDraftReply({ input: { messageId: 'original', body: 'Draft' }, req });
    expect(
      transport.mock.calls.some(([config]) => String(config.url).endsWith('/messages/send')),
    ).toBe(true);
    expect(transport.mock.calls.some(([config]) => String(config.url).endsWith('/drafts'))).toBe(
      true,
    );
  });

  it('maps get, search, and custom API calls', async () => {
    const { gmail, transport } = await fixture();
    await expect(gmail.getEmail({ input: { messageId: 'original' }, req })).resolves.toMatchObject({
      id: 'original',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'files',
        file: expect.objectContaining({ name: 'download.txt', mimetype: 'text/plain' }),
        overrideAccess: false,
      }),
    );
    await expect(
      gmail.searchEmails({
        input: { from: 'sender@example.com', subject: 'Hello', maxResults: 5 },
        req,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: 'found' })]);
    await expect(
      gmail.customApiCall({
        input: {
          method: 'POST',
          path: '/users/me/labels',
          query: { view: 'full' },
          body: { name: 'Work' },
        },
        req,
      }),
    ).resolves.toEqual({ ok: true });
    expect(
      transport.mock.calls.some(
        ([config]) =>
          config.url === 'https://gmail.googleapis.com/gmail/v1/users/me/labels' &&
          config.params.view === 'full',
      ),
    ).toBe(true);
  });

  it('resolves OAuth account identity through the SDK transport', async () => {
    const { client } = await fixture();
    await expect(
      pieceFactoryDefinition(createGmail).oauth?.account?.({ tokens: {}, client, req } as never),
    ).resolves.toEqual({
      id: 'user@example.com',
      label: 'user@example.com',
      email: 'user@example.com',
    });
  });

  it('polls directly with the previous cursor and returns a replacement cursor', async () => {
    const { client, transport } = await fixture();
    const trigger = pieceFactoryDefinition(createGmail).triggers?.[0];
    if (!trigger) throw new Error('Missing Gmail polling trigger.');
    const result = await trigger.run({
      client,
      input: trigger.input.parse({ from: 'sender@example.com' }),
      cursor: 1_700_000_000_000,
      options: {},
      req,
    } as never);
    expect(result.events).toEqual([expect.objectContaining({ id: 'found' })]);
    expect(typeof result.cursor).toBe('number');
    const call = transport.mock.calls.find(([config]) => String(config.url).endsWith('/messages'));
    expect(call?.[0].params.q).toBe('from:sender@example.com after:1700000000');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

vi.mock(
  '@frogbotai/piece-microsoft',
  () => import('../../../packages/pieces/piece-microsoft/src/index.js'),
);

import { pieceInstanceTools } from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createMicrosoftOutlook,
  microsoftOutlookActions,
} from '../../../packages/pieces/piece-microsoft-outlook/src/index.js';
import { appOnly, body, calls, filesReq, json, req, stubGraph } from './fixtures.js';

const graph = 'https://graph.microsoft.com/v1.0';
const outlook = createMicrosoftOutlook({});
const email = {
  id: 'm1',
  subject: 'Quote',
  from: { emailAddress: { name: 'Dana', address: 'dana@acme.com' } },
  receivedDateTime: '2026-11-03T10:00:00Z',
  conversationId: 'c1',
  categories: ['Blue'],
};

afterEach(() => vi.unstubAllGlobals());

describe('Outlook mail actions', () => {
  it('registers every action named in microsoftOutlookActions', () => {
    expect(pieceInstanceTools(outlook)?.map((tool) => tool.slug)).toEqual(
      microsoftOutlookActions.map((slug) => `microsoft-outlook_${slug}`),
    );
  });

  it('sends an email with recipients, body and a FrogBot file attached', async () => {
    const files = filesReq();

    files.findByID.mockResolvedValue({
      id: 7,
      url: '/api/files/file/quote.pdf',
      filename: 'quote.pdf',
      mimeType: 'application/pdf',
    });

    stubGraph((call) =>
      call.url.startsWith('https://app.test/')
        ? new Response('PDF')
        : new Response(null, { status: 202 }),
    );

    const result = await outlook.sendEmail({
      input: {
        to: ['dana@acme.com'],
        cc: ['lee@acme.com'],
        subject: 'Quote',
        body: '<b>Hi</b>',
        bodyType: 'html',
        attachments: [{ fileId: 7 }],
      },
      req: files.req,
    });

    expect(result).toEqual({ sent: true });
    expect(calls[0]).toMatchObject({ url: 'https://app.test/api/files/file/quote.pdf' });
    expect(calls[0]?.headers.get('cookie')).toBe('session=1');
    expect(calls[1]).toMatchObject({ url: `${graph}/me/sendMail`, method: 'POST' });
    expect(body(calls[1])).toEqual({
      message: {
        subject: 'Quote',
        body: { contentType: 'html', content: '<b>Hi</b>' },
        toRecipients: [{ emailAddress: { address: 'dana@acme.com' } }],
        ccRecipients: [{ emailAddress: { address: 'lee@acme.com' } }],
        attachments: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: 'quote.pdf',
            contentType: 'application/pdf',
            contentBytes: Buffer.from('PDF').toString('base64'),
          },
        ],
      },
      saveToSentItems: true,
    });
  });

  it("doesn't forward the caller's cookie to a file stored on another origin", async () => {
    const files = filesReq();

    files.findByID.mockResolvedValue({ id: 7, url: 'https://cdn.test/quote.pdf' });

    stubGraph((call) =>
      call.url.startsWith('https://cdn.test/')
        ? new Response('PDF')
        : new Response(null, { status: 202 }),
    );

    await outlook.sendEmail({
      input: { to: ['dana@acme.com'], subject: 'Quote', body: 'Hi', attachments: [{ fileId: 7 }] },
      req: files.req,
    });

    expect(calls[0]?.headers.get('cookie')).toBeNull();
  });

  it('creates a draft and sends it', async () => {
    stubGraph((call) =>
      call.url.endsWith('/send') ? new Response(null, { status: 202 }) : json({ id: 'd1' }, 201),
    );

    const draft = await outlook.createDraftEmail({
      input: { to: ['dana@acme.com'], subject: 'Hi', body: 'Hello' },
      req: req(),
    });

    const sent = await outlook.sendDraft({ input: { messageId: draft.id }, req: req() });

    expect(calls[0]).toMatchObject({ url: `${graph}/me/messages`, method: 'POST' });
    expect(body(calls[0])).toMatchObject({
      subject: 'Hi',
      body: { contentType: 'text', content: 'Hello' },
    });
    expect(calls[1]).toMatchObject({ url: `${graph}/me/messages/d1/send`, method: 'POST' });
    expect(sent).toEqual({ messageId: 'd1', sent: true });
  });

  it('replies above the quoted thread and sends, or keeps the reply as a draft', async () => {
    stubGraph((call) =>
      call.url.endsWith('/send') ? new Response(null, { status: 202 }) : json({ id: 'r1' }, 201),
    );

    const sent = await outlook.replyToEmail({
      input: { messageId: 'm/1', body: 'Thanks!', cc: ['lee@acme.com'] },
      req: req(),
    });

    expect(calls[0]).toMatchObject({ url: `${graph}/me/messages/m%2F1/createReply` });
    expect(body(calls[0])).toEqual({
      comment: 'Thanks!',
      message: { ccRecipients: [{ emailAddress: { address: 'lee@acme.com' } }] },
    });
    expect(calls[1]).toMatchObject({ url: `${graph}/me/messages/r1/send`, method: 'POST' });
    expect(sent).toEqual({ draft: { id: 'r1' }, sent: true });

    calls.length = 0;

    const draft = await outlook.replyToEmail({
      input: { messageId: 'm1', body: 'Thanks!', replyAll: true, draft: true },
      req: req(),
    });

    expect(calls[0]).toMatchObject({ url: `${graph}/me/messages/m1/createReplyAll` });
    expect(calls).toHaveLength(1);
    expect(draft).toEqual({ draft: { id: 'r1' }, sent: false });
  });

  it('forwards with a comment', async () => {
    stubGraph(() => new Response(null, { status: 202 }));

    await expect(
      outlook.forwardEmail({
        input: { messageId: 'm1', to: ['lee@acme.com'], comment: 'FYI' },
        req: req(),
      }),
    ).resolves.toEqual({ messageId: 'm1', forwarded: true });
    expect(calls[0]).toMatchObject({ url: `${graph}/me/messages/m1/forward`, method: 'POST' });
    expect(body(calls[0])).toEqual({
      comment: 'FYI',
      toRecipients: [{ emailAddress: { address: 'lee@acme.com' } }],
    });
  });

  it('moves an email and returns it with its new id', async () => {
    stubGraph(() => json({ ...email, id: 'm2', parentFolderId: 'archive' }, 201));

    const moved = await outlook.moveEmail({
      input: { messageId: 'm1', folderId: 'archive' },
      req: req(),
    });

    expect(calls[0]).toMatchObject({ url: `${graph}/me/messages/m1/move`, method: 'POST' });
    expect(body(calls[0])).toEqual({ destinationId: 'archive' });
    expect(moved).toMatchObject({ id: 'm2', parentFolderId: 'archive', subject: 'Quote' });
  });

  it('adds categories once and removes only the named ones', async () => {
    let categories = ['Blue'];

    stubGraph((call) => {
      if (call.method === 'PATCH') categories = body(call).categories;

      return json({ id: 'm1', categories });
    });

    await expect(
      outlook.addCategory({ input: { messageId: 'm1', categories: ['Blue', 'Red'] }, req: req() }),
    ).resolves.toEqual({ id: 'm1', categories: ['Blue', 'Red'] });
    expect(calls[0]).toMatchObject({ url: `${graph}/me/messages/m1?%24select=categories` });
    expect(calls[1]).toMatchObject({ url: `${graph}/me/messages/m1`, method: 'PATCH' });

    await expect(
      outlook.removeCategory({ input: { messageId: 'm1', categories: ['Blue'] }, req: req() }),
    ).resolves.toEqual({ id: 'm1', categories: ['Red'] });
  });

  it('searches one folder with $search and returns the newest first', async () => {
    stubGraph((call) =>
      call.url.includes('/oauth2/')
        ? json({ access_token: 'app-token', expires_in: 3600 })
        : json({
            value: [
              { id: 'old', receivedDateTime: '2026-11-01T10:00:00Z' },
              { id: 'new', receivedDateTime: '2026-11-03T10:00:00Z' },
            ],
          }),
    );

    const found = await outlook.searchEmails({
      input: { query: 'subject:"Q4 quote"', folderId: 'inbox', limit: 10 },
      req: req(appOnly),
    });

    const url = new URL(calls.at(-1)!.url);

    expect(url.pathname).toBe('/v1.0/users/sales%40acme.com/mailFolders/inbox/messages');
    expect(url.searchParams.get('$search')).toBe('"subject:\\"Q4 quote\\""');
    expect(url.searchParams.get('$top')).toBe('10');
    expect(found.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('saves file attachments into FrogBot files and skips attached items', async () => {
    const files = filesReq();

    stubGraph(() =>
      json({
        value: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            id: 'a1',
            name: 'quote.pdf',
            contentType: 'application/pdf',
            contentBytes: Buffer.from('PDF').toString('base64'),
          },
          { '@odata.type': '#microsoft.graph.itemAttachment', id: 'a2', name: 'Meeting' },
        ],
      }),
    );

    const saved = await outlook.downloadAttachment({ input: { messageId: 'm1' }, req: files.req });

    expect(calls[0]).toMatchObject({ url: `${graph}/me/messages/m1/attachments` });
    expect(files.create).toHaveBeenCalledOnce();
    expect(files.create.mock.calls[0]?.[0]).toMatchObject({
      collection: 'files',
      overrideAccess: false,
      file: { name: 'quote.pdf', mimetype: 'application/pdf', size: 3 },
    });
    expect(saved).toEqual([
      {
        attachmentId: 'a1',
        fileId: 'file-quote.pdf',
        name: 'quote.pdf',
        mimeType: 'application/pdf',
        size: 3,
        url: '/api/files/file/quote.pdf',
      },
    ]);
  });

  it('downloads one attachment by id, and needs a files collection', async () => {
    const files = filesReq();

    stubGraph(() => json({ id: 'a1', name: 'a.txt', contentBytes: 'aGk=' }));

    await outlook.downloadAttachment({
      input: { messageId: 'm1', attachmentId: 'a1' },
      req: files.req,
    });

    expect(calls[0]).toMatchObject({ url: `${graph}/me/messages/m1/attachments/a1` });
    await expect(
      outlook.downloadAttachment({ input: { messageId: 'm1' }, req: req() }),
    ).rejects.toThrow('requires a files collection');
  });

  it('surfaces Graph errors from an action', async () => {
    stubGraph(() => json({ error: { code: 'ErrorItemNotFound', message: 'Not found.' } }, 404));

    await expect(outlook.sendDraft({ input: { messageId: 'x' }, req: req() })).rejects.toThrow(
      'Microsoft Graph request failed (404 ErrorItemNotFound): Not found.',
    );
  });
});

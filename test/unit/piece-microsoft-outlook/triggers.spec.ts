import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

vi.mock(
  '@frogbotai/piece-microsoft',
  () => import('../../../packages/pieces/piece-microsoft/src/index.js'),
);

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createMicrosoftOutlook,
  microsoftOutlookTriggers,
} from '../../../packages/pieces/piece-microsoft-outlook/src/index.js';
import { calls, filesReq, json, req, stubGraph } from './fixtures.js';

const outlook = createMicrosoftOutlook({});
const since = '2026-11-03T10:00:00.000Z';

function mail(id: string, receivedDateTime: string, extra: Record<string, unknown> = {}) {
  return { id, receivedDateTime, ...extra };
}

async function poll<T extends 'newEmail' | 'newEmailInFolder' | 'newAttachment'>(
  slug: T,
  input: object,
  cursor?: unknown,
  request = req(),
) {
  const trigger = outlook.triggers[slug] as unknown as {
    run(args: object): Promise<{ events: { id: string }[]; cursor: unknown }>;
  };

  return trigger.run({
    input,
    cursor,
    client: await outlook.client({ req: request }),
    options: {},
    req: request,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Outlook triggers', () => {
  it('declares three polling triggers on a 5-minute schedule', () => {
    const triggers = pieceFactoryDefinition(createMicrosoftOutlook).triggers ?? [];

    expect(triggers.map(({ slug }) => slug)).toEqual([...microsoftOutlookTriggers]);
    expect(triggers.every((trigger) => trigger.type === 'polling')).toBe(true);
    expect(
      triggers.map((trigger) => (trigger.type === 'polling' ? trigger.schedule : undefined)),
    ).toEqual(['*/5 * * * *', '*/5 * * * *', '*/5 * * * *']);
  });

  it('with no cursor, emits nothing, saves no files and starts at now', async () => {
    vi.useFakeTimers({ now: new Date(since) });
    stubGraph(() => json({ value: [mail('m1', since, { hasAttachments: true })] }));

    const files = filesReq();

    for (const slug of microsoftOutlookTriggers) {
      await expect(poll(slug, { folderId: 'inbox' }, undefined, files.req)).resolves.toEqual({
        events: [],
        cursor: { since, ids: [] },
      });
    }

    expect(calls).toHaveLength(0);
    expect(files.create).not.toHaveBeenCalled();
  });

  it('emits only newer mail, oldest first, skipping ids already seen at the cursor instant', async () => {
    stubGraph(() =>
      json({
        value: [
          mail('m4', '2026-11-03T10:05:00Z'),
          mail('m3', '2026-11-03T10:05:00Z'),
          mail('m2', since),
          mail('m1', since),
        ],
      }),
    );

    const result = await poll('newEmailInFolder', { folderId: 'sales' }, { since, ids: ['m1'] });

    expect(result.events.map((event) => event.id)).toEqual(['m2', 'm3', 'm4']);
    expect(result.cursor).toEqual({ since: '2026-11-03T10:05:00.000Z', ids: ['m3', 'm4'] });

    const url = new URL(calls[0].url);

    expect(url.pathname).toBe('/v1.0/me/mailFolders/sales/messages');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      $filter: `receivedDateTime ge ${since}`,
      $orderby: 'receivedDateTime desc',
      $top: '50',
    });
  });

  it('adds same-instant ids to the cursor and keeps it when nothing is new', async () => {
    stubGraph(() => json({ value: [mail('m2', since), mail('m1', since)] }));

    const result = await poll('newEmail', {}, { since, ids: ['m1'] });

    expect(result.events.map((event) => event.id)).toEqual(['m2']);
    expect(result.cursor).toEqual({ since, ids: ['m1', 'm2'] });

    const again = await poll('newEmail', {}, result.cursor);

    expect(again).toEqual({ events: [], cursor: { since, ids: ['m1', 'm2'] } });
  });

  it('filters new inbox mail by sender and recipient', async () => {
    const later = '2026-11-03T11:00:00Z';

    stubGraph(() =>
      json({
        value: [
          mail('m3', later, {
            from: { emailAddress: { address: 'Dana@Acme.com' } },
            ccRecipients: [{ emailAddress: { address: 'sales@acme.com' } }],
          }),
          mail('m2', later, { from: { emailAddress: { address: 'dana@acme.com' } } }),
          mail('m1', later, { from: { emailAddress: { address: 'lee@acme.com' } } }),
        ],
      }),
    );

    const result = await poll(
      'newEmail',
      { from: 'dana@acme.com', to: 'sales@acme.com' },
      { since, ids: [] },
    );

    expect(new URL(calls[0].url).pathname).toBe('/v1.0/me/mailFolders/inbox/messages');
    expect(result.events.map((event) => event.id)).toEqual(['m3']);
  });

  it('saves new attachments into FrogBot files and emits them with the email', async () => {
    const files = filesReq();

    stubGraph((call) =>
      call.url.includes('/attachments')
        ? json({
            value: [
              {
                id: 'a1',
                name: 'quote.pdf',
                contentType: 'application/pdf',
                contentBytes: Buffer.from('PDF').toString('base64'),
              },
            ],
          })
        : json({ value: [mail('m1', '2026-11-03T11:00:00Z', { hasAttachments: true })] }),
    );

    const result = await poll('newAttachment', {}, { since, ids: [] }, files.req);

    expect(Object.fromEntries(new URL(calls[0].url).searchParams)).toMatchObject({
      $filter: `receivedDateTime ge ${since} and hasAttachments eq true`,
    });
    expect(calls[1].url).toBe('https://graph.microsoft.com/v1.0/me/messages/m1/attachments');
    expect(files.create).toHaveBeenCalledOnce();
    expect(result.events).toEqual([
      expect.objectContaining({
        id: 'm1',
        attachments: [
          {
            attachmentId: 'a1',
            fileId: 'file-quote.pdf',
            name: 'quote.pdf',
            mimeType: 'application/pdf',
            size: 3,
            url: '/api/files/file/quote.pdf',
          },
        ],
      }),
    ]);
  });
});

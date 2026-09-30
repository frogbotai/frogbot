import { describe, expect, it } from 'vitest';

import { baseURL, createClients } from './clients';

const cases: { name: string; args: Record<string, unknown> }[] = [
  {
    name: 'nested and/or where with equals, in, contains, and greater_than',
    args: {
      where: {
        and: [
          { title: { equals: 'Frogs & toads' } },
          {
            or: [
              { status: { in: ['draft', 'published'] } },
              { 'group.field': { contains: 'pond' } },
              { views: { greater_than: 10 } },
            ],
          },
        ],
      },
    },
  },
  {
    name: 'select, populate, and joins',
    args: {
      select: { title: true, group: { field: true } },
      populate: { 'sdk-media': { alt: true } },
      joins: { related: { limit: 5, sort: '-createdAt', where: { title: { exists: true } } } },
    },
  },
  { name: 'joins disabled', args: { joins: false } },
  { name: 'sort as a string', args: { sort: '-createdAt' } },
  { name: 'sort as an array', args: { sort: ['title', '-createdAt'] } },
  {
    name: 'paging, drafts, trash, and locales',
    args: {
      depth: 0,
      draft: true,
      fallbackLocale: 'en',
      limit: 25,
      locale: 'fr',
      page: 2,
      pagination: false,
      trash: false,
    },
  },
  {
    name: 'where values of every JSON type',
    args: {
      where: {
        tags: { in: [] },
        deletedAt: { equals: null },
        published: { equals: false },
        publishedAt: { less_than: new Date('2026-01-02T03:04:05.000Z') },
        count: { not_in: [1, 2, 3] },
      },
    },
  },
  { name: 'no arguments', args: {} },
];

describe('FrogBotSDK query strings', () => {
  it.each(cases)('find encodes $name exactly as the Payload client does', async ({ args }) => {
    const { frogbot, frogbotRequests, payload, payloadRequests } = createClients(() =>
      Response.json({ docs: [] }),
    );

    await frogbot.find({ collection: 'sdk-pages', ...args } as never);
    await payload.find({ collection: 'sdk-pages', ...args } as never);

    expect(frogbotRequests[0]?.url).toBe(payloadRequests[0]?.url);
    expect(frogbotRequests[0]?.url.startsWith(`${baseURL}/sdk-pages`)).toBe(true);
  });
});

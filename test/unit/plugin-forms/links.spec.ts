import type { Field, FrogBotRequest } from 'frogbot';
import { describe, expect, it } from 'vitest';

import {
  expiryChoices,
  linksListPath,
} from '../../../packages/plugins/plugin-forms/src/client/links.js';
import { linksWhere } from '../../../packages/plugins/plugin-forms/src/links/access.js';
import { linkStatus } from '../../../packages/plugins/plugin-forms/src/links/collection.js';
import { parseDuration } from '../../../packages/plugins/plugin-forms/src/links/duration.js';
import {
  createLinkToken,
  hashLinkToken,
  linkLifetime,
  resolveLinkLimits,
} from '../../../packages/plugins/plugin-forms/src/links/token.js';
import {
  checkForm,
  collectFields,
  type FormTarget,
} from '../../../packages/plugins/plugin-forms/src/questions.js';
import type { FormDocument } from '../../../packages/plugins/plugin-forms/src/types.js';

const DAY = 86_400;

describe('link tokens', () => {
  it('are 32 random base64url bytes, stored as their hex SHA-256', () => {
    const token = createLinkToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createLinkToken()).not.toBe(token);
    expect(hashLinkToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkToken(token)).toBe(hashLinkToken(token));
    expect(hashLinkToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('link lengths', () => {
  it('parses seconds and lengths like 7d', () => {
    expect(parseDuration(90)).toBe(90);
    expect(parseDuration('30m')).toBe(1800);
    expect(parseDuration('12h')).toBe(12 * 3600);
    expect(parseDuration('7d')).toBe(7 * DAY);
    expect(parseDuration('2w')).toBe(14 * DAY);

    for (const bad of [0, -5, 1.5, '0d', '7', '7 days', 'd', '', null, {}]) {
      expect(parseDuration(bad)).toBeUndefined();
    }
  });

  it('defaults to 7 days, at most 30, and checks the options at boot', () => {
    expect(resolveLinkLimits()).toEqual({ defaultExpiry: 7 * DAY, maxExpiry: 30 * DAY });
    expect(resolveLinkLimits({ defaultExpiry: '14d', maxExpiry: '60d' })).toEqual({
      defaultExpiry: 14 * DAY,
      maxExpiry: 60 * DAY,
    });
    expect(resolveLinkLimits({ maxExpiry: '1d' })).toEqual({ defaultExpiry: DAY, maxExpiry: DAY });

    expect(() => resolveLinkLimits({ defaultExpiry: '40d' })).toThrow('longer than maxExpiry');
    expect(() => resolveLinkLimits({ maxExpiry: 'soon' as never })).toThrow('maxExpiry');
  });

  it('gives a link the default, its own shorter length, or refuses one over the maximum', () => {
    const limits = resolveLinkLimits();

    expect(linkLifetime(undefined, limits)).toBe(7 * DAY);
    expect(linkLifetime('2d', limits)).toBe(2 * DAY);
    expect(linkLifetime('30d', limits)).toBe(30 * DAY);
    expect(linkLifetime('31d', limits)).toEqual({ error: 'Links can last at most 30 days.' });
    expect(linkLifetime('forever', limits)).toEqual({ error: expect.stringContaining('7d') });
  });
});

describe('link status', () => {
  const now = new Date('2026-11-03T12:00:00Z');
  const active = { expiresAt: '2026-11-04T00:00:00Z', submissions: 0 };

  it('is revoked, used up, expired or active, in that order', () => {
    expect(linkStatus(active, now)).toBe('active');
    expect(linkStatus({ ...active, maxSubmissions: 1, submissions: 1 }, now)).toBe('used up');
    expect(linkStatus({ ...active, expiresAt: '2026-11-03T11:59:59Z' }, now)).toBe('expired');
    expect(
      linkStatus(
        { ...active, maxSubmissions: 1, submissions: 1, revokedAt: now.toISOString() },
        now,
      ),
    ).toBe('revoked');
  });
});

describe('form-links access', () => {
  it('covers whole collections, listed records, or nothing', () => {
    expect(linksWhere([])).toBe(false);
    expect(linksWhere([{ collection: 'applications', ids: [] }])).toBe(false);
    expect(linksWhere([{ collection: 'applications' }])).toEqual({
      collection: { equals: 'applications' },
    });
    expect(
      linksWhere([{ collection: 'applications' }, { collection: 'clients', ids: ['1', '2'] }]),
    ).toEqual({
      or: [
        { collection: { equals: 'applications' } },
        { and: [{ collection: { equals: 'clients' } }, { recordId: { in: ['1', '2'] } }] },
      ],
    });
  });
});

describe('form modes on save', () => {
  const fields = [
    { name: 'email', type: 'email', required: true },
    { name: 'phone', type: 'text' },
    { name: 'source', type: 'text' },
    { name: 'status', type: 'text', access: { update: () => false } },
    { name: 'score', type: 'number', access: { read: ({ req }) => Boolean(req.user) } },
    { name: 'origin', type: 'text', access: { create: () => false } },
    { name: 'cv', type: 'upload', relationTo: 'files' },
  ] as Field[];

  const targets = new Map<string, FormTarget>([
    ['applications', { slug: 'applications', fields: collectFields(fields) }],
    ['drafted', { slug: 'drafted', fields: collectFields(fields), drafts: true }],
    ['files', { slug: 'files', fields: new Map(), upload: true }],
  ]);

  const req = { user: { id: 1, collection: 'users' }, context: {} } as unknown as FrogBotRequest;

  function check(questions: string[], extra: Partial<FormDocument>) {
    return checkForm({
      form: {
        slug: 'apply',
        collection: 'applications',
        steps: [{ questions: questions.map((field) => ({ field })) }],
        ...extra,
      },
      targets,
      req,
    });
  }

  it('lets an update form leave out required fields and fields it cannot create', async () => {
    expect(await check(['phone', 'origin'], { mode: 'update' })).toEqual([]);
    expect(await check(['phone'], { mode: 'both' })).toEqual([
      expect.objectContaining({ path: 'steps', message: expect.stringContaining('"email"') }),
    ]);
  });

  it('refuses, by name, fields a link could not read or update', async () => {
    for (const mode of ['update', 'both'] as const) {
      expect(await check(['email', 'status', 'score'], { mode })).toEqual([
        {
          path: 'steps.0.questions.1.field',
          message: expect.stringContaining('"status" can\'t be changed through an edit link'),
        },
        {
          path: 'steps.0.questions.2.field',
          message: expect.stringContaining('"score" can\'t be changed through an edit link'),
        },
      ]);
    }

    expect(await check(['email', 'status', 'score'], { mode: 'create' })).toEqual([]);
  });

  it('keeps create rules on both forms, and refuses drafts and file questions for links', async () => {
    expect(await check(['email', 'origin'], { mode: 'both' })).toEqual([
      expect.objectContaining({ message: expect.stringContaining('create access') }),
    ]);

    expect(await check(['email'], { mode: 'update', collection: 'drafted' })).toEqual([
      expect.objectContaining({ path: 'mode', message: expect.stringContaining('drafts') }),
    ]);

    expect(await check(['email', 'cv'], { mode: 'update' })).toEqual([
      expect.objectContaining({
        path: 'steps.0.questions.1.field',
        message: expect.stringContaining('"cv" is a file question'),
      }),
    ]);
  });
});

describe('the link dialog', () => {
  it('offers lengths up to the maximum, marking the default', () => {
    expect(expiryChoices(7 * DAY, 30 * DAY)).toEqual([
      { seconds: 3600, label: '1 hour' },
      { seconds: DAY, label: '1 day' },
      { seconds: 3 * DAY, label: '3 days' },
      { seconds: 7 * DAY, label: '1 week (default)' },
      { seconds: 14 * DAY, label: '2 weeks' },
      { seconds: 30 * DAY, label: '30 days' },
    ]);
    expect(expiryChoices(2 * 3600, 5 * 3600).map(({ seconds }) => seconds)).toEqual([
      3600, 7200, 18_000,
    ]);
  });

  it("links to one record's links", () => {
    expect(decodeURIComponent(linksListPath('applications', 4))).toBe(
      '/collections/form-links?where[and][0][collection][equals]=applications&where[and][1][recordId][equals]=4',
    );
  });
});

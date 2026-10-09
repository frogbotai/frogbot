/// <reference types="vite/client" />

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

vi.mock(
  '@frogbotai/piece-google',
  () => import('../../../packages/pieces/piece-google/src/index.js'),
);

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceDefinition } from '../../../packages/frogbot/src/pieces/types.js';
import { createAirtable } from '../../../packages/pieces/piece-airtable/src/index.js';
import { createAttio } from '../../../packages/pieces/piece-attio/src/index.js';
import { createBraveSearch } from '../../../packages/pieces/piece-brave-search/src/index.js';
import { createDiscord } from '../../../packages/pieces/piece-discord/src/index.js';
import { createDropbox } from '../../../packages/pieces/piece-dropbox/src/index.js';
import { createGithub } from '../../../packages/pieces/piece-github/src/index.js';
import { createGmail } from '../../../packages/pieces/piece-gmail/src/index.js';
import { createGoogleCalendar } from '../../../packages/pieces/piece-google-calendar/src/index.js';
import { createGoogleDrive } from '../../../packages/pieces/piece-google-drive/src/index.js';
import { createGoogleSheets } from '../../../packages/pieces/piece-google-sheets/src/index.js';
import { createMicrosoftTeams } from '../../../packages/pieces/piece-microsoft-teams/src/index.js';
import { createNotion } from '../../../packages/pieces/piece-notion/src/index.js';
import { createPagerduty } from '../../../packages/pieces/piece-pagerduty/src/index.js';
import { createPosthog } from '../../../packages/pieces/piece-posthog/src/index.js';
import { createResend } from '../../../packages/pieces/piece-resend/src/index.js';
import { createSlack } from '../../../packages/pieces/piece-slack/src/index.js';
import { createStripe } from '../../../packages/pieces/piece-stripe/src/index.js';
import { createTelegramBot } from '../../../packages/pieces/piece-telegram-bot/src/index.js';
import { createTrello } from '../../../packages/pieces/piece-trello/src/index.js';
import { createTwilio } from '../../../packages/pieces/piece-twilio/src/index.js';
import { createXero } from '../../../packages/pieces/piece-xero/src/index.js';
import { createZoom } from '../../../packages/pieces/piece-zoom/src/index.js';

type RawAction = (args: { input: unknown; req: unknown }) => Promise<unknown>;

type OriginRow = {
  factory: (options: Record<string, unknown>) => object;
  auth: Record<string, unknown>;
  options?: Record<string, unknown>;
  env?: Record<string, string>;
  slug: string;
  field: string;
  input?: Record<string, unknown>;
  safe: string;
  origins: string[];
};

type RawActionPiece = Pick<PieceDefinition, 'slug' | 'auth'> & {
  actions: readonly { slug: string }[];
};

const rawActionSlugs = ['customApiCall', 'sendRequest', 'sendApiRequest'];

const attacks = [
  '/https://x.test/',
  '/\\x.test/',
  '//x.test/',
  '.x.test/',
  '@x.test/',
  '%2F%2Fx.test/',
  '/\\\\x.test/',
  '/http://x.test/',
  '/https:\\\\x.test/',
  '/\t//x.test/',
  ':8443/x',
];

const google = { accessToken: 'google-token', refreshToken: 'google-refresh' };

const rows: OriginRow[] = [
  {
    factory: createAirtable,
    auth: { personalAccessToken: 'airtable-token' },
    slug: 'customApiCall',
    field: 'path',
    safe: '/v0/meta/bases',
    origins: ['https://api.airtable.com'],
  },
  {
    factory: createAttio,
    auth: { accessToken: 'attio-token' },
    slug: 'customApiCall',
    field: 'path',
    safe: '/v2/self',
    origins: ['https://api.attio.com'],
  },
  {
    factory: createBraveSearch,
    auth: { apiKey: 'brave-token' },
    slug: 'customApiCall',
    field: 'path',
    safe: '/res/v1/web/search',
    origins: ['https://api.search.brave.com'],
  },
  {
    factory: createDiscord,
    auth: { botToken: 'discord-token' },
    options: { apiUrl: 'https://discord.proxy.test/api/v10' },
    slug: 'sendApiRequest',
    field: 'path',
    safe: '/users/@me',
    origins: ['https://discord.proxy.test'],
  },
  {
    factory: createDropbox,
    auth: { accessToken: 'dropbox-token' },
    slug: 'customApiCall',
    field: 'path',
    input: { method: 'POST' },
    safe: '/users/get_current_account',
    origins: ['https://api.dropboxapi.com', 'https://content.dropboxapi.com'],
  },
  {
    factory: createGithub,
    auth: { accessToken: 'github-token' },
    slug: 'customApiCall',
    field: 'path',
    safe: '/user',
    origins: ['https://api.github.com'],
  },
  {
    factory: createGmail,
    auth: google,
    slug: 'customApiCall',
    field: 'path',
    safe: '/users/me/profile',
    origins: ['https://gmail.googleapis.com'],
  },
  {
    factory: createGoogleCalendar,
    auth: google,
    slug: 'customApiCall',
    field: 'path',
    safe: '/users/me/calendarList',
    origins: ['https://www.googleapis.com'],
  },
  {
    factory: createGoogleDrive,
    auth: google,
    slug: 'customApiCall',
    field: 'path',
    safe: '/files',
    origins: ['https://www.googleapis.com', 'https://drive.googleapis.com'],
  },
  {
    factory: createGoogleSheets,
    auth: google,
    slug: 'customApiCall',
    field: 'path',
    safe: '/spreadsheets/sheet-id',
    origins: ['https://sheets.googleapis.com'],
  },
  {
    factory: createMicrosoftTeams,
    auth: { accessToken: 'teams-token' },
    slug: 'customApiCall',
    field: 'path',
    safe: 'me',
    origins: ['https://graph.microsoft.com'],
  },
  {
    factory: createNotion,
    auth: { accessToken: 'notion-token' },
    slug: 'customApiCall',
    field: 'path',
    safe: '/v1/users/me',
    origins: ['https://api.notion.com'],
  },
  {
    factory: createPagerduty,
    auth: { apiKey: 'pagerduty-token' },
    slug: 'customApiCall',
    field: 'path',
    safe: '/users/me',
    origins: ['https://api.pagerduty.com'],
  },
  {
    factory: createPosthog,
    auth: { personalApiKey: 'posthog-token' },
    slug: 'customApiCall',
    field: 'path',
    safe: '/api/users/@me',
    origins: ['https://app.posthog.com'],
  },
  {
    factory: createResend,
    auth: { apiKey: 'resend-token' },
    slug: 'customApiCall',
    field: 'url',
    safe: '/emails',
    origins: ['https://api.resend.com'],
  },
  {
    factory: createSlack,
    auth: { botToken: 'slack-token' },
    slug: 'customApiCall',
    field: 'path',
    safe: 'auth.test',
    origins: ['https://slack.com'],
  },
  {
    factory: createStripe,
    auth: { apiKey: 'stripe-token' },
    slug: 'sendRequest',
    field: 'path',
    safe: '/balance',
    origins: ['https://api.stripe.com'],
  },
  {
    factory: createTelegramBot,
    auth: { botToken: 'telegram-token' },
    env: { TELEGRAM_API_BASE_URL: 'https://telegram.proxy.test' },
    slug: 'customApiCall',
    field: 'endpoint',
    safe: 'getMe',
    origins: ['https://telegram.proxy.test'],
  },
  {
    factory: createTrello,
    auth: { username: 'trello-key', password: 'trello-token', applicationSecret: 'trello-secret' },
    slug: 'customApiCall',
    field: 'path',
    safe: '/members/me',
    origins: ['https://api.trello.com'],
  },
  {
    factory: createTwilio,
    auth: { username: 'AC123', password: 'twilio-token' },
    slug: 'customApiCall',
    field: 'path',
    safe: '/2010-04-01/Accounts.json',
    origins: ['https://api.twilio.com'],
  },
  {
    factory: createXero,
    auth: { accessToken: 'xero-token' },
    slug: 'customApiCall',
    field: 'path',
    input: { tenantId: 'tenant-1' },
    safe: '/Invoices',
    origins: ['https://api.xero.com'],
  },
  {
    factory: createZoom,
    auth: { accessToken: 'zoom-token' },
    slug: 'customApiCall',
    field: 'path',
    safe: '/users/me',
    origins: ['https://api.zoom.us'],
  },
];

const recorded: string[] = [];

function record(input: RequestInfo | URL): Promise<Response> {
  recorded.push(new Request(input).url);

  return Promise.resolve(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function redirectOffOrigin(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  recorded.push(new Request(input).url);

  if (init?.redirect !== 'manual') return record('https://x.test/');

  return Promise.resolve(
    new Response(null, { status: 302, headers: { location: 'https://x.test/' } }),
  );
}

function rowName(row: OriginRow): string {
  return `${pieceFactoryDefinition(row.factory).slug}.${row.slug}`;
}

async function call(
  row: OriginRow,
  value: string,
  extra: Record<string, unknown> = {},
  frogbot: Record<string, unknown> = {},
): Promise<{ urls: string[]; error?: string }> {
  recorded.length = 0;

  Object.entries(row.env ?? {}).forEach(([name, env]) => vi.stubEnv(name, env));

  const instance = row.factory({ auth: row.auth, ...row.options }) as Record<string, RawAction>;
  const req = {
    frogbot: {
      ...frogbot,
      connections: {
        resolvePieceCredential: () => Promise.resolve({ auth: row.auth, key: instance }),
      },
    },
    headers: new Headers(),
    user: null,
  };

  const error = await instance[row.slug]({
    input: { method: 'GET', ...row.input, ...extra, [row.field]: value },
    req,
  }).then(
    () => undefined,
    (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)),
  );

  return { urls: [...recorded], error };
}

function uncoveredRawActions(pieces: RawActionPiece[], covered: string[]): string[] {
  return pieces.flatMap((piece) =>
    piece.auth
      ? piece.actions
          .filter(({ slug }) => rawActionSlugs.includes(slug))
          .map(({ slug }) => `${piece.slug}.${slug}`)
          .filter((name) => !covered.includes(name))
      : [],
  );
}

async function loadPieces(): Promise<RawActionPiece[]> {
  const modules = import.meta.glob<Record<string, unknown>>(
    '../../../packages/pieces/*/src/index.ts',
  );

  const loaded = await Promise.all(Object.values(modules).map((load) => load()));
  const definitions = new Set<PieceDefinition>();

  loaded.flatMap(Object.values).forEach((value) => {
    if (typeof value !== 'function') return;

    try {
      definitions.add(pieceFactoryDefinition(value));
    } catch {
      return;
    }
  });

  return [...definitions];
}

beforeAll(() => {
  vi.stubGlobal('window', {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('raw piece requests', () => {
  it.each(rows.map((row) => [rowName(row), row] as const))(
    '%s sends a safe path to its origin',
    async (_name, row) => {
      vi.stubGlobal('fetch', record);

      const { urls } = await call(row, row.safe);

      expect(urls.length).toBeGreaterThan(0);
      expect(urls.filter((url) => !row.origins.includes(new URL(url).origin))).toEqual([]);
    },
  );

  it.each(rows.map((row) => [rowName(row), row] as const))(
    '%s never sends a request off its origin',
    async (_name, row) => {
      vi.stubGlobal('fetch', record);

      const secrets = Object.values(row.auth).filter((value) => typeof value === 'string');
      const leaks: string[] = [];

      for (const attack of attacks) {
        const { urls, error } = await call(row, attack);

        urls
          .filter((url) => !row.origins.includes(new URL(url).origin))
          .forEach((url) => leaks.push(`${JSON.stringify(attack)} -> ${url}`));

        if (secrets.some((secret) => error?.includes(secret))) {
          leaks.push(`${JSON.stringify(attack)} error: ${error}`);
        }
      }

      expect(leaks).toEqual([]);
    },
  );

  it('has a row for every raw action of a piece with auth', async () => {
    const pieces = await loadPieces();

    expect(pieces.length).toBeGreaterThan(rows.length);
    expect(uncoveredRawActions(pieces, rows.map(rowName))).toEqual([]);
  });

  it('fails for a piece whose raw action has no row', () => {
    const fake: RawActionPiece = {
      slug: 'fake',
      auth: {} as RawActionPiece['auth'],
      actions: [{ slug: 'customApiCall' }, { slug: 'listThings' }],
    };

    expect(uncoveredRawActions([fake], rows.map(rowName))).toEqual(['fake.customApiCall']);
  });
});

describe('raw piece credentials', () => {
  const row = (name: string): OriginRow => {
    const found = rows.find((candidate) => rowName(candidate) === name);

    if (!found) throw new Error(`No row ${name}`);

    return found;
  };

  it.each(['key', 'token', 'Token'])('trello refuses a query that sets %s', async (name) => {
    vi.stubGlobal('fetch', record);

    const { urls, error } = await call(row('trello.customApiCall'), '/members/me', {
      query: { [name]: 'other' },
    });

    expect(error).toBe('[frogbot] Trello query must not set `key` or `token`.');
    expect(urls).toEqual([]);
  });

  it.each(['?key=other', '?token=other', '?a=1&Token=other'])(
    'trello refuses a path query %s',
    async (query) => {
      vi.stubGlobal('fetch', record);

      const { urls, error } = await call(row('trello.customApiCall'), `/members/me${query}`);

      expect(error).toBe('[frogbot] Trello query must not set `key` or `token`.');
      expect(urls).toEqual([]);
    },
  );

  it.each(['Authorization', 'authorization', 'AUTHORIZATION'])(
    'resend refuses a caller %s header',
    async (name) => {
      vi.stubGlobal('fetch', record);

      const { urls, error } = await call(row('resend.customApiCall'), '/emails', {
        headers: { [name]: 'Bearer other' },
      });

      expect(error).toBe('[frogbot] Resend request headers must not set `Authorization`.');
      expect(urls).toEqual([]);
    },
  );

  it('resend saves a binary response with the caller req and access checks', async () => {
    vi.stubGlobal('fetch', record);

    const create = vi.fn((_args: { overrideAccess: boolean; req?: { frogbot?: unknown } }) =>
      Promise.resolve({ id: 'file-1', url: '/files/output.json' }),
    );

    const { error } = await call(
      row('resend.customApiCall'),
      '/emails',
      { response_is_binary: true },
      { config: { files: { slug: 'files' } }, create },
    );

    expect(error).toBeUndefined();
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({ collection: 'files', overrideAccess: false });
    expect(create.mock.calls[0]?.[0].req?.frogbot).toMatchObject({ create });
  });
});

describe('raw piece redirects', () => {
  const redirectRows = [
    'airtable.customApiCall',
    'attio.customApiCall',
    'discord.sendApiRequest',
    'gmail.customApiCall',
    'notion.customApiCall',
    'pagerduty.customApiCall',
    'resend.customApiCall',
    'stripe.sendRequest',
    'telegramBot.customApiCall',
    'trello.customApiCall',
    'twilio.customApiCall',
  ].map((name) => {
    const row = rows.find((candidate) => rowName(candidate) === name);

    if (!row) throw new Error(`No row ${name}`);

    return [name, row] as const;
  });

  it.each(redirectRows)('%s refuses a redirect off its origin', async (_name, row) => {
    vi.stubGlobal('fetch', redirectOffOrigin);

    const { urls, error } = await call(row, row.safe);

    expect(error).toMatch(/ API redirected \(302\) to https:\/\/x\.test\/\.$/);
    expect(urls).toHaveLength(1);
    expect(row.origins).toContain(new URL(urls[0] ?? '').origin);
  });
});

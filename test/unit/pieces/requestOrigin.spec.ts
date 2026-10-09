/// <reference types="vite/client" />

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

vi.mock(
  '@frogbotai/piece-google',
  () => import('../../../packages/pieces/piece-google/src/index.js'),
);

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceDefinition } from '../../../packages/frogbot/src/pieces/types.js';
import {
  callRawRequest,
  type RawRequestRow,
  rawRequestRow,
  rawRequestRowName,
  rawRequestRows,
} from './rawRequestRows.js';

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
  '/../x',
  'https://x.test/',
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

async function call(
  row: RawRequestRow,
  value: string,
  extra: Record<string, unknown> = {},
  frogbot: Record<string, unknown> = {},
): Promise<{ urls: string[]; error?: string }> {
  recorded.length = 0;

  const { error } = await callRawRequest(row, { ...extra, path: value }, frogbot);

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
  it.each(rawRequestRows.map((row) => [rawRequestRowName(row), row] as const))(
    '%s sends a safe path to its origin',
    async (_name, row) => {
      vi.stubGlobal('fetch', record);

      const { urls } = await call(row, row.safe);

      expect(urls.length).toBeGreaterThan(0);
      expect(urls.filter((url) => !row.origins.includes(new URL(url).origin))).toEqual([]);
    },
  );

  it.each(rawRequestRows.map((row) => [rawRequestRowName(row), row] as const))(
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

    expect(pieces.length).toBeGreaterThan(rawRequestRows.length);
    expect(uncoveredRawActions(pieces, rawRequestRows.map(rawRequestRowName))).toEqual([]);
  });

  it('fails for a piece whose raw action has no row', () => {
    const fake: RawActionPiece = {
      slug: 'fake',
      auth: {} as RawActionPiece['auth'],
      actions: [{ slug: 'customApiCall' }, { slug: 'listThings' }],
    };

    expect(uncoveredRawActions([fake], rawRequestRows.map(rawRequestRowName))).toEqual([
      'fake.customApiCall',
    ]);
  });
});

describe('raw piece credentials', () => {
  const row = rawRequestRow;

  it.each(rawRequestRows.map((entry) => [rawRequestRowName(entry), entry] as const))(
    '%s refuses a caller Authorization header',
    async (_name, entry) => {
      vi.stubGlobal('fetch', record);

      for (const header of ['Authorization', 'authorization', 'AUTHORIZATION']) {
        const { urls, error } = await call(entry, entry.safe, {
          headers: { [header]: 'Bearer other' },
        });

        expect(error).toMatch(/custom API calls cannot set the 'authorization' header\.$/i);
        expect(urls).toEqual([]);
      }
    },
  );

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

  it('resend saves a binary response with the caller req and access checks', async () => {
    vi.stubGlobal('fetch', record);

    const create = vi.fn((_args: { overrideAccess: boolean; req?: { frogbot?: unknown } }) =>
      Promise.resolve({ id: 'file-1', url: '/files/output.json' }),
    );

    const { error } = await call(
      row('resend.customApiCall'),
      '/emails',
      { responseType: 'binary' },
      { config: { files: { slug: 'files' } }, create },
    );

    expect(error).toBeUndefined();
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({ collection: 'files', overrideAccess: false });
    expect(create.mock.calls[0]?.[0].req?.frogbot).toMatchObject({ create });
  });
});

describe('raw piece redirects', () => {
  it.each(rawRequestRows.map((row) => [rawRequestRowName(row), row] as const))(
    '%s refuses a redirect off its origin',
    async (_name, row) => {
      vi.stubGlobal('fetch', redirectOffOrigin);

      const { urls, error } = await call(row, row.safe);

      expect(error).toMatch(/ API redirected \(302\) to https:\/\/x\.test\/\.$/);
      expect(urls).toHaveLength(1);
      expect(row.origins).toContain(new URL(urls[0] ?? '').origin);
    },
  );
});

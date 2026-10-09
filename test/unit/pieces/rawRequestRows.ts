import { vi } from 'vitest';

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
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

export type RawAction = (args: { input: unknown; req: unknown }) => Promise<unknown>;

export type RawRequestRow = {
  factory: (options: Record<string, unknown>) => object;
  auth: Record<string, unknown>;
  options?: Record<string, unknown>;
  env?: Record<string, string>;
  input?: Record<string, unknown>;
  safe: string;
  origins: string[];
};

const google = { accessToken: 'google-token', refreshToken: 'google-refresh' };

export const rawRequestRows: RawRequestRow[] = [
  {
    factory: createAirtable,
    auth: { personalAccessToken: 'airtable-token' },
    safe: '/meta/bases',
    origins: ['https://api.airtable.com'],
  },
  {
    factory: createAttio,
    auth: { accessToken: 'attio-token' },
    safe: '/self',
    origins: ['https://api.attio.com'],
  },
  {
    factory: createBraveSearch,
    auth: { apiKey: 'brave-token' },
    safe: '/web/search',
    origins: ['https://api.search.brave.com'],
  },
  {
    factory: createDiscord,
    auth: { botToken: 'discord-token' },
    options: { apiUrl: 'https://discord.proxy.test/api/v10' },
    safe: '/users/@me',
    origins: ['https://discord.proxy.test'],
  },
  {
    factory: createDropbox,
    auth: { accessToken: 'dropbox-token' },
    input: { method: 'POST' },
    safe: '/users/get_current_account',
    origins: ['https://api.dropboxapi.com', 'https://content.dropboxapi.com'],
  },
  {
    factory: createGithub,
    auth: { accessToken: 'github-token' },
    safe: '/user',
    origins: ['https://api.github.com'],
  },
  {
    factory: createGmail,
    auth: google,
    safe: '/users/me/profile',
    origins: ['https://gmail.googleapis.com'],
  },
  {
    factory: createGoogleCalendar,
    auth: google,
    safe: '/users/me/calendarList',
    origins: ['https://www.googleapis.com'],
  },
  {
    factory: createGoogleDrive,
    auth: google,
    safe: '/files',
    origins: ['https://www.googleapis.com', 'https://drive.googleapis.com'],
  },
  {
    factory: createGoogleSheets,
    auth: google,
    safe: '/spreadsheets/sheet-id',
    origins: ['https://sheets.googleapis.com'],
  },
  {
    factory: createMicrosoftTeams,
    auth: { accessToken: 'teams-token' },
    safe: 'me',
    origins: ['https://graph.microsoft.com'],
  },
  {
    factory: createNotion,
    auth: { accessToken: 'notion-token' },
    safe: '/users/me',
    origins: ['https://api.notion.com'],
  },
  {
    factory: createPagerduty,
    auth: { apiKey: 'pagerduty-token' },
    safe: '/users/me',
    origins: ['https://api.pagerduty.com'],
  },
  {
    factory: createPosthog,
    auth: { personalApiKey: 'posthog-token' },
    safe: '/api/users/@me',
    origins: ['https://app.posthog.com'],
  },
  {
    factory: createResend,
    auth: { apiKey: 'resend-token' },
    safe: '/emails',
    origins: ['https://api.resend.com'],
  },
  {
    factory: createSlack,
    auth: { botToken: 'slack-token' },
    safe: 'auth.test',
    origins: ['https://slack.com'],
  },
  {
    factory: createStripe,
    auth: { apiKey: 'stripe-token' },
    safe: '/v1/balance',
    origins: ['https://api.stripe.com'],
  },
  {
    factory: createTelegramBot,
    auth: { botToken: 'telegram-token' },
    env: { TELEGRAM_API_BASE_URL: 'https://telegram.proxy.test' },
    safe: 'getMe',
    origins: ['https://telegram.proxy.test'],
  },
  {
    factory: createTrello,
    auth: { username: 'trello-key', password: 'trello-token', applicationSecret: 'trello-secret' },
    safe: '/members/me',
    origins: ['https://api.trello.com'],
  },
  {
    factory: createTwilio,
    auth: { username: 'AC123', password: 'twilio-token' },
    safe: '/2010-04-01/Accounts.json',
    origins: ['https://api.twilio.com'],
  },
  {
    factory: createXero,
    auth: { accessToken: 'xero-token' },
    input: { headers: { 'Xero-Tenant-Id': 'tenant-1' } },
    safe: '/Invoices',
    origins: ['https://api.xero.com'],
  },
  {
    factory: createZoom,
    auth: { accessToken: 'zoom-token' },
    safe: '/users/me',
    origins: ['https://api.zoom.us'],
  },
];

export function rawRequestRowName(row: RawRequestRow): string {
  return `${pieceFactoryDefinition(row.factory).slug}.customApiCall`;
}

export function rawRequestRow(name: string): RawRequestRow {
  const found = rawRequestRows.find((row) => rawRequestRowName(row) === name);

  if (!found) throw new Error(`No row ${name}`);

  return found;
}

/** Calls the row's `customApiCall` and returns the error message, if it threw. */
export async function callRawRequest(
  row: RawRequestRow,
  input: Record<string, unknown>,
  frogbot: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<{ result?: unknown; error?: string }> {
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
    signal,
    user: null,
  };

  return instance
    .customApiCall({
      input: {
        method: 'GET',
        path: row.safe,
        ...row.input,
        ...input,
        headers: { ...(row.input?.headers as object), ...(input.headers as object) },
      },
      req,
    })
    .then(
      (result) => ({ result }),
      (reason: unknown) => ({ error: reason instanceof Error ? reason.message : String(reason) }),
    );
}

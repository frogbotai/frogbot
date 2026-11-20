import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getApiKeyPrefix, hashApiKeyToken } from '@frogbotai/plugin-api-keys';
import { afterAll, beforeAll, beforeEach } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { adminEmail, memberEmail } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const adminToken = `fb_${'B'.repeat(43)}`;
const memberToken = `fb_${'C'.repeat(43)}`;

export type Row = Record<string, unknown> & { id: string; blockType: string };

export type Doc = Record<string, unknown>;

type ToolCallBody = {
  result: {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
};

function parse<T>(body: T | string): T {
  const json =
    typeof body === 'string'
      ? (body
          .split('\n')
          .find((line) => line.startsWith('data: '))
          ?.slice(6) ?? body)
      : JSON.stringify(body);

  return JSON.parse(json) as T;
}

/** The ids of the blocks in a stored blocks field value. */
export function ids(value: unknown): string[] {
  return Array.isArray(value) ? (value as Row[]).map(({ id }) => id) : [];
}

/**
 * Boots the access test config once per file, gives every test a fresh admin and member with API
 * keys, and calls the block tools over MCP as either of them.
 */
export function useAccessHarness(dbName: string) {
  const state = {} as {
    booted: BootedFrogBot;
    adminId: number | string;
    memberId: number | string;
  };

  beforeAll(async () => {
    state.booted = await bootFrogBot(dirname, dbName);
  });

  afterAll(async () => {
    await clearAndSeed(state.booted.frogbot, 'empty');
    await state.booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(state.booted.frogbot, 'empty');

    const make = async (email: string, token: string) => {
      const user = await state.booted.frogbot.create({
        collection: 'users',
        data: { email, password: 'frogbot-test' },
        overrideAccess: true,
      });

      await state.booted.frogbot.create({
        collection: 'api-keys',
        data: {
          name: email,
          owner: user.id,
          prefix: getApiKeyPrefix(token),
          tokenHash: hashApiKeyToken(token),
        },
        overrideAccess: true,
      });

      return user.id as number | string;
    };

    state.adminId = await make(adminEmail, adminToken);
    state.memberId = await make(memberEmail, memberToken);
  });

  async function call(token: string, name: string, args: Record<string, unknown>) {
    const response = await state.booted.restClient.post<ToolCallBody | string>(
      '/api/mcp',
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
      {
        headers: {
          accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const { result } = parse<ToolCallBody>(response.body);

    return {
      isError: result.isError === true,
      text: result.content.map(({ text }) => text).join(''),
      data: result.structuredContent ?? {},
    };
  }

  async function stored(collection: string, id: number | string, extra: Doc = {}): Promise<Doc> {
    const doc = await state.booted.frogbot.findByID({
      collection: collection as 'users',
      id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
      ...extra,
    });

    return JSON.parse(JSON.stringify(doc)) as Doc;
  }

  return {
    state,
    stored,
    admin: (name: string, args: Record<string, unknown>) => call(adminToken, name, args),
    member: (name: string, args: Record<string, unknown>) => call(memberToken, name, args),
  };
}

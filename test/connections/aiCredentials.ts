import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { vi } from 'vitest';
import { z } from 'zod';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import type { FrogBotConfig } from '../../packages/frogbot/src/config/types.js';
import type { Endpoint } from '../../packages/frogbot/src/endpoints/types.js';
import { FrogBot, getFrogBotPayload } from '../../packages/frogbot/src/frogbot.js';
import { definePiece } from '../../packages/frogbot/src/pieces/definePiece.js';
import type { Tool } from '../../packages/frogbot/src/tools/types.js';
import type { FrogBotRequest } from '../../packages/frogbot/src/types/request.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

export const MODEL = 'openai/gpt-4o-mini';

export const SETUP_ERROR =
  "OpenAI isn't set up. Add your OpenAI key in Settings → Linked accounts.";

export const RECONNECT_ERROR = 'Reconnect OpenAI in Settings → Linked accounts.';

const openaiAuth = z.object({ apiKey: z.string().startsWith('sk-') });

export const createTestOpenAI = definePiece({
  slug: 'openai',
  label: 'OpenAI',
  auth: openaiAuth,
  client: ({ auth }: { auth: unknown }) => openaiAuth.parse(auth),
  provider: {
    name: 'openai',
    credential: ({ auth }: { auth: unknown }) => ({ apiKey: openaiAuth.parse(auth).apiKey }),
  },
  actions: [],
});

export type Upstream = { url: string; authorization: string | null; body: string };

/** Every request sent to api.openai.com, and the replies to send next (default: text "ok"). */
export const openai = { requests: [] as Upstream[], replies: [] as Response[] };

export function textReply(text: string): Response {
  return Response.json({
    id: 'response-1',
    object: 'response',
    created_at: 1,
    model: 'gpt-4o-mini',
    output: [
      {
        id: 'message-1',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    status: 'completed',
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  });
}

export function toolReply(name: string): Response {
  return Response.json({
    id: 'response-tool',
    object: 'response',
    created_at: 1,
    model: 'gpt-4o-mini',
    output: [
      {
        id: 'call-item-1',
        type: 'function_call',
        call_id: 'call-1',
        name,
        arguments: '{}',
        status: 'completed',
      },
    ],
    status: 'completed',
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  });
}

export function stubOpenAI(): void {
  const realFetch = globalThis.fetch;

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (!url.startsWith('https://api.openai.com/')) return realFetch(input, init);

      openai.requests.push({
        url,
        authorization: new Headers(init?.headers).get('authorization'),
        body: String(init?.body),
      });

      return Promise.resolve(openai.replies.shift() ?? textReply('ok'));
    }),
  );
}

export function resetOpenAI(): void {
  openai.requests.length = 0;
  openai.replies.length = 0;
}

/** The authorization headers of the requests whose body mentions `marker`. */
export function keysFor(marker: string): (string | null)[] {
  return openai.requests
    .filter(({ body }) => body.includes(marker))
    .map(({ authorization }) => authorization);
}

export const lookup: Tool<z.ZodObject, string> = {
  slug: 'lookup',
  description: 'Look up a topic.',
  inputSchema: z.object({}),
  execute: () => 'Found it.',
};

export const AGENT_SLUG = 'support';

export async function bootLinked(overrides: Partial<FrogBotConfig>) {
  const config = await buildConfig({
    secret: 'ai-credentials-test-secret',
    db: await getTestDatabaseAdapter({
      sqlite: sqliteAdapter({ client: { url: 'file::memory:' } }),
    }),
    admin: { user: 'members', importMap: { autoGenerate: false } },
    typescript: { autoGenerate: false },
    collections: [{ slug: 'members', auth: true, fields: [] }],
    connections: [{ piece: createTestOpenAI(), secret: true }],
    agents: [
      {
        slug: AGENT_SLUG,
        instructions: 'Help.',
        model: { default: MODEL, options: [MODEL] },
        tools: [lookup],
      },
    ],
    ...overrides,
  });

  const frogbot = await new FrogBot().init({ config, disableOnInit: true });
  const payload = getFrogBotPayload(frogbot);
  const endpoint = (payload.collections.connections.config.endpoints || []).find(
    ({ method, path }) => method === 'post' && path === '/:piece',
  );

  if (!endpoint) throw new Error('The connection endpoint is missing.');

  const member = async (email: string): Promise<FrogBotRequest> => {
    const doc = await frogbot.create({
      collection: 'members',
      data: { email, password: 'password' },
      overrideAccess: true,
    });

    return frogbot.createRequest({ user: { ...doc, collection: 'members' } });
  };

  const link = (req: FrogBotRequest, body: unknown) =>
    endpoint.handler({
      frogbot,
      payload,
      user: req.user,
      routeParams: { piece: 'openai' },
      json: () => Promise.resolve(body),
    } as unknown as Parameters<Endpoint['handler']>[0]);

  const turn = (req: FrogBotRequest, prompt: string) =>
    frogbot.agents[AGENT_SLUG].aiAgent.generate({
      prompt,
      options: { req, overrideAccess: true },
    });

  return { frogbot, member, link, turn };
}

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { createOpenAI } from '@frogbotai/piece-openai';
import { buildConfig, type FrogBotConfig, type FrogBotRequest, type Tool } from 'frogbot';
import { FrogBot, getFrogBotPayload } from 'frogbot/test';
import { vi } from 'vitest';
import { z } from 'zod';

import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

export const MODEL = 'openai/gpt-4o-mini';

export const AGENT_MODELS = [MODEL, 'openai/gpt-4.1', 'openai/gpt-4o'] as const;

export const SETUP_ERROR =
  "OpenAI isn't set up. Add your OpenAI key in Settings → Linked accounts.";

export const RECONNECT_ERROR = 'Reconnect OpenAI in Settings → Linked accounts.';

export type Upstream = { url: string; authorization: string | null; body: string };

/**
 * The fake api.openai.com: every request it got, the model replies to send next (default: text
 * "ok"), and what `GET /v1/models` lists. The key `sk-rejected` gets a 401 there.
 */
export const openai = {
  requests: [] as Upstream[],
  replies: [] as Response[],
  models: ['gpt-4o-mini', 'gpt-4o', 'tts-1'],
  modelsDown: false,
};

/** The model calls sent upstream, without the `GET /v1/models` listings. */
export function modelCalls(): Upstream[] {
  return openai.requests.filter(({ url }) => !url.endsWith('/v1/models'));
}

/** The `GET /v1/models` listings sent upstream. */
export function modelListings(): Upstream[] {
  return openai.requests.filter(({ url }) => url.endsWith('/v1/models'));
}

function modelsReply(authorization: string | null): Response {
  if (authorization === 'Bearer sk-rejected') {
    return Response.json({ error: { message: 'Incorrect API key.' } }, { status: 401 });
  }

  if (openai.modelsDown) return new Response('unavailable', { status: 503 });

  return Response.json({ object: 'list', data: openai.models.map((id) => ({ id })) });
}

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

      const authorization = new Headers(init?.headers).get('authorization');

      openai.requests.push({ url, authorization, body: String(init?.body) });

      if (url.endsWith('/v1/models')) return Promise.resolve(modelsReply(authorization));

      return Promise.resolve(openai.replies.shift() ?? textReply('ok'));
    }),
  );
}

export function resetOpenAI(): void {
  openai.requests.length = 0;
  openai.replies.length = 0;
  openai.models = ['gpt-4o-mini', 'gpt-4o', 'tts-1'];
  openai.modelsDown = false;
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
    connections: [{ piece: createOpenAI(), secret: true }],
    agents: [
      {
        slug: AGENT_SLUG,
        instructions: 'Help.',
        model: { default: MODEL, options: [...AGENT_MODELS] },
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

  const manifest = (payload.config.endpoints || []).find(
    ({ method, path }) => method === 'get' && path === '/agents',
  );

  if (!endpoint || !manifest) throw new Error('The connection or agent endpoint is missing.');

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
    } as unknown as Parameters<typeof endpoint.handler>[0]);

  const turn = (req: FrogBotRequest, prompt: string) =>
    frogbot.agents[AGENT_SLUG].aiAgent.generate({
      prompt,
      options: { req, overrideAccess: true },
    });

  const picker = async (req: FrogBotRequest) => {
    const response = await manifest.handler({ ...req, payload } as unknown as Parameters<
      typeof manifest.handler
    >[0]);

    const { agents } = (await response.json()) as {
      agents: { slug: string; models: string[]; defaultModel?: string }[];
    };

    return agents.find(({ slug }) => slug === AGENT_SLUG);
  };

  return { frogbot, member, link, turn, picker };
}

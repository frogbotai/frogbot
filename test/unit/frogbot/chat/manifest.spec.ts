import { describe, expect, it, vi } from 'vitest';

import type { AgentInstance } from '../../../../packages/frogbot/src/agents/types.js';
import { buildManifestEndpoint } from '../../../../packages/frogbot/src/chat/manifest.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

function makeAgent(
  slug: string,
  access?: AgentInstance['config']['access'],
  profile?: { name?: string; avatar?: string; description?: string },
): AgentInstance {
  return {
    slug,
    config: {
      slug,
      model: { default: 'openai/test', options: ['openai/test'] },
      instructions: 'Help',
      access,
      profile,
    } as AgentInstance['config'],
    aiAgent: {} as AgentInstance['aiAgent'],
    generate: vi.fn() as AgentInstance['generate'],
    stream: vi.fn() as AgentInstance['stream'],
  };
}

function makeRequest({
  agents = [makeAgent('support')],
  chat = { enabled: true, chatsSlug: 'conversations', messagesSlug: 'turns' } as const,
  ai = {},
  user = { id: 'user-1' },
  files = { slug: 'uploads' },
}: {
  agents?: AgentInstance[];
  chat?: { enabled: false } | { enabled: true; chatsSlug: string; messagesSlug: string };
  ai?: Record<string, unknown>;
  user?: Record<string, unknown> | null;
  files?: { slug: string } | undefined;
} = {}): FrogBotRequest {
  return {
    frogbot: {
      agents: Object.fromEntries(agents.map((agent) => [agent.slug, agent])),
      config: {
        ai: {
          providers: {},
          routers: {},
          access: { transcribe: ({ req }: { req: FrogBotRequest }) => !!req.user },
          ...ai,
        },
        chat,
        files,
      },
    },
    user,
  } as unknown as FrogBotRequest;
}

describe('manifest endpoint', () => {
  it('returns configured agent profiles without instructions', async () => {
    const profile = { name: 'Ada', avatar: '/ada.png', description: 'Support' };
    const response = await buildManifestEndpoint().handler(
      makeRequest({ agents: [makeAgent('support', undefined, profile)] }),
    );
    const body = await response.json();

    expect(body.agents).toEqual([{ slug: 'support', profile }]);
    expect(JSON.stringify(body)).not.toContain('instructions');
  });

  it('omits the profile key when no profile is configured', async () => {
    const response = await buildManifestEndpoint().handler(makeRequest());
    expect(await response.json()).toEqual(
      expect.objectContaining({ agents: [{ slug: 'support' }] }),
    );
  });

  it('does not expose a denied agent profile', async () => {
    const response = await buildManifestEndpoint().handler(
      makeRequest({
        agents: [
          makeAgent('allowed', undefined, { name: 'Public' }),
          makeAgent('denied', () => false, { name: 'Secret' }),
        ],
      }),
    );
    const body = JSON.stringify(await response.json());
    expect(body).toContain('Public');
    expect(body).not.toContain('Secret');
  });

  it('returns renamed chat collection slugs', async () => {
    const response = await buildManifestEndpoint().handler(makeRequest());

    expect(await response.json()).toEqual({
      ai: { transcribe: false },
      chat: { enabled: true, chatsSlug: 'conversations', messagesSlug: 'turns' },
      files: { slug: 'uploads' },
      agents: [{ slug: 'support' }],
    });
  });

  it('omits files when no files collection exists', async () => {
    const req = makeRequest();

    delete (req.frogbot.config as { files?: unknown }).files;

    const response = await buildManifestEndpoint().handler(req);
    const body = await response.json();

    expect('files' in body).toBe(false);
  });

  it('filters agents with the request access rules', async () => {
    const allowed = vi.fn(() => true);
    const denied = vi.fn(() => false);
    const throwing = vi.fn(() => Promise.reject(new Error('access failed')));
    const req = makeRequest({
      agents: [
        makeAgent('allowed', allowed),
        makeAgent('denied', denied),
        makeAgent('throwing', throwing),
      ],
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({ agents: [{ slug: 'allowed' }] });
    expect(allowed).toHaveBeenCalledWith({ req, agent: req.frogbot.agents.allowed });
    expect(denied).toHaveBeenCalledWith({ req, agent: req.frogbot.agents.denied });
    expect(throwing).toHaveBeenCalledWith({ req, agent: req.frogbot.agents.throwing });
  });

  it('serves anonymous callers without exposing protected agents', async () => {
    const response = await buildManifestEndpoint().handler(
      makeRequest({
        agents: [makeAgent('protected'), makeAgent('public', () => true)],
        chat: { enabled: false },
        user: null,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ai: { transcribe: false },
      chat: { enabled: false },
      files: { slug: 'uploads' },
      agents: [{ slug: 'public' }],
    });
  });

  it('prevents shared and persistent caching', async () => {
    const response = await buildManifestEndpoint().handler(makeRequest());

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('reports unavailable transcription', async () => {
    const response = await buildManifestEndpoint().handler(makeRequest());

    expect(await response.json()).toMatchObject({ ai: { transcribe: false } });
  });

  it('reports unavailable transcription when the setting is unset and Groq is configured', async () => {
    const req = makeRequest({ ai: { providers: { groq: true } } });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({ ai: { transcribe: false } });
  });

  it.each(['google', 'mistral'])(
    'reports unavailable transcription when the setting is unset and %s is configured',
    async (provider) => {
      const req = makeRequest({ ai: { providers: { [provider]: true } } });

      const response = await buildManifestEndpoint().handler(req);

      expect(await response.json()).toMatchObject({ ai: { transcribe: false } });
    },
  );

  it('reports the configured transcription model', async () => {
    const req = makeRequest({
      ai: {
        providers: { openai: true },
        transcriptionModel: 'openai/gpt-4o-mini-transcribe',
      },
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({
      ai: { transcribe: { model: 'openai/gpt-4o-mini-transcribe' } },
    });
  });

  it('reports the model behind a transcription router', async () => {
    const req = makeRequest({
      ai: {
        providers: { openai: true },
        routers: { stt: { model: 'openai/gpt-4o-mini-transcribe' } },
        transcriptionModel: 'stt',
      },
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({
      ai: { transcribe: { model: 'openai/gpt-4o-mini-transcribe' } },
    });
  });

  it('reports unavailable transcription when the user allowlist excludes the model', async () => {
    const req = makeRequest({
      ai: { providers: { openai: true }, transcriptionModel: 'openai/gpt-4o-mini-transcribe' },
      user: { id: 'user-1', modelAccess: 'selected', models: ['openai/whisper-1'] },
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({ ai: { transcribe: false } });
  });

  it('reports unavailable transcription when the user allowlist names only the router slug', async () => {
    const req = makeRequest({
      ai: {
        providers: { openai: true },
        routers: { stt: { model: 'openai/gpt-4o-mini-transcribe' } },
        transcriptionModel: 'stt',
      },
      user: { id: 'user-1', modelAccess: 'selected', models: ['stt'] },
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({ ai: { transcribe: false } });
  });

  it('reports the router target when the user allowlist names it', async () => {
    const req = makeRequest({
      ai: {
        providers: { openai: true },
        routers: { stt: { model: 'openai/gpt-4o-mini-transcribe' } },
        transcriptionModel: 'stt',
      },
      user: { id: 'user-1', modelAccess: 'selected', models: ['openai/gpt-4o-mini-transcribe'] },
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({
      ai: { transcribe: { model: 'openai/gpt-4o-mini-transcribe' } },
    });
  });

  it('reports unavailable transcription when the access rule denies the user', async () => {
    const req = makeRequest({
      ai: {
        providers: { openai: true },
        transcriptionModel: 'openai/gpt-4o-mini-transcribe',
        access: { transcribe: () => false },
      },
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({ ai: { transcribe: false } });
  });

  it('reports unavailable transcription and still serves agents when the access rule rejects', async () => {
    const req = makeRequest({
      ai: {
        providers: { openai: true },
        transcriptionModel: 'openai/gpt-4o-mini-transcribe',
        access: { transcribe: () => Promise.reject(new Error('access failed')) },
      },
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ai: { transcribe: false },
      agents: [{ slug: 'support' }],
    });
  });

  it('reports unavailable transcription to an anonymous caller', async () => {
    const req = makeRequest({
      ai: { providers: { openai: true }, transcriptionModel: 'openai/gpt-4o-mini-transcribe' },
      user: null,
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({ ai: { transcribe: false } });
  });

  it('reports unavailable transcription to an anonymous caller the access rule allows', async () => {
    const req = makeRequest({
      ai: {
        providers: { openai: true },
        transcriptionModel: 'openai/gpt-4o-mini-transcribe',
        access: { transcribe: () => true },
      },
      user: null,
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({ ai: { transcribe: false } });
  });

  it('checks the transcribe access rule with the request', async () => {
    const transcribe = vi.fn(() => true);
    const req = makeRequest({
      ai: {
        providers: { openai: true },
        transcriptionModel: 'openai/gpt-4o-mini-transcribe',
        access: { transcribe },
      },
    });

    await buildManifestEndpoint().handler(req);

    expect(transcribe).toHaveBeenCalledWith({ req });
  });

  it('reports unavailable transcription when the access rule throws synchronously', async () => {
    const req = makeRequest({
      ai: {
        providers: { openai: true },
        transcriptionModel: 'openai/gpt-4o-mini-transcribe',
        access: {
          transcribe: () => {
            throw new Error('access failed');
          },
        },
      },
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ai: { transcribe: false } });
  });

  it('reports unavailable transcription when the user allowlist is selected and empty', async () => {
    const req = makeRequest({
      ai: { providers: { openai: true }, transcriptionModel: 'openai/gpt-4o-mini-transcribe' },
      user: { id: 'user-1', modelAccess: 'selected', models: [] },
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({ ai: { transcribe: false } });
  });

  it('reports the model to a user whose allowlist includes it', async () => {
    const req = makeRequest({
      ai: { providers: { openai: true }, transcriptionModel: 'openai/gpt-4o-mini-transcribe' },
      user: {
        id: 'user-1',
        modelAccess: 'selected',
        models: ['openai/gpt-4o-mini', 'openai/gpt-4o-mini-transcribe'],
      },
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({
      ai: { transcribe: { model: 'openai/gpt-4o-mini-transcribe' } },
    });
  });

  it('decides transcription per user with the same configuration', async () => {
    const ai = {
      providers: { openai: true },
      transcriptionModel: 'openai/gpt-4o-mini-transcribe',
      access: { transcribe: ({ req }: { req: FrogBotRequest }) => req.user?.id === 'allowed' },
    };

    const allowed = await buildManifestEndpoint().handler(
      makeRequest({ ai, user: { id: 'allowed' } }),
    );
    const denied = await buildManifestEndpoint().handler(
      makeRequest({ ai, user: { id: 'denied' } }),
    );

    expect(await allowed.json()).toMatchObject({
      ai: { transcribe: { model: 'openai/gpt-4o-mini-transcribe' } },
    });
    expect(await denied.json()).toMatchObject({ ai: { transcribe: false } });
  });

  it('does not run the transcribe access rule when the setting is unset', async () => {
    const transcribe = vi.fn(() => true);
    const req = makeRequest({ ai: { providers: { groq: true }, access: { transcribe } } });

    await buildManifestEndpoint().handler(req);

    expect(transcribe).not.toHaveBeenCalled();
  });

  it('keeps the response shape and cache header when transcription is available', async () => {
    const req = makeRequest({
      ai: { providers: { openai: true }, transcriptionModel: 'openai/gpt-4o-mini-transcribe' },
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(Object.keys(await response.json()).sort()).toEqual(['agents', 'ai', 'chat', 'files']);
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { AgentInstance } from '../types/agent.js';
import type { FrogbotRequest } from '../types/request.js';
import { buildManifestEndpoint } from './manifest.js';

function makeAgent(slug: string, access?: AgentInstance['config']['access']): AgentInstance {
  return {
    slug,
    config: { slug, model: 'openai/test', instructions: 'Help', access },
    aiAgent: {} as AgentInstance['aiAgent'],
    generate: vi.fn() as AgentInstance['generate'],
    stream: vi.fn() as AgentInstance['stream'],
  };
}

function makeRequest({
  agents = [makeAgent('support')],
  chat = { enabled: true, threadsSlug: 'conversations', messagesSlug: 'turns' } as const,
  user = { id: 'user-1' },
}: {
  agents?: AgentInstance[];
  chat?: { enabled: false } | { enabled: true; threadsSlug: string; messagesSlug: string };
  user?: { id: string } | null;
} = {}): FrogbotRequest {
  return {
    frogbot: {
      agents: Object.fromEntries(agents.map((agent) => [agent.slug, agent])),
      config: { chat },
    },
    user,
  } as unknown as FrogbotRequest;
}

describe('manifest endpoint', () => {
  it('returns renamed chat collection slugs', async () => {
    const response = await buildManifestEndpoint().handler(makeRequest());

    expect(await response.json()).toEqual({
      chat: { enabled: true, threadsSlug: 'conversations', messagesSlug: 'turns' },
      agents: [{ slug: 'support' }],
    });
  });

  it('filters agents with the request access rules', async () => {
    const allowed = vi.fn(() => true);
    const denied = vi.fn(() => false);
    const throwing = vi.fn(() => Promise.reject(new Error('access failed')));
    const req = makeRequest({
      agents: [makeAgent('allowed', allowed), makeAgent('denied', denied), makeAgent('throwing', throwing)],
    });

    const response = await buildManifestEndpoint().handler(req);

    expect(await response.json()).toMatchObject({ agents: [{ slug: 'allowed' }] });
    expect(allowed).toHaveBeenCalledWith({ req });
    expect(denied).toHaveBeenCalledWith({ req });
    expect(throwing).toHaveBeenCalledWith({ req });
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
    expect(await response.json()).toEqual({ chat: { enabled: false }, agents: [{ slug: 'public' }] });
  });

  it('prevents shared and persistent caching', async () => {
    const response = await buildManifestEndpoint().handler(makeRequest());

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});

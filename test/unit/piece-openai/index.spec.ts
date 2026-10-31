import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceInstanceDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import { pieceCapabilities } from '../../../packages/frogbot/src/pieces/types.js';
import {
  createOpenAI,
  OpenAIRequestError,
} from '../../../packages/pieces/piece-openai/src/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubModels(response: Response) {
  const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(response),
  );

  vi.stubGlobal('fetch', fetch);

  return fetch;
}

describe('createOpenAI', () => {
  const piece = createOpenAI();
  const definition = pieceInstanceDefinition(piece);
  const provider = definition.provider!;

  it('is an OpenAI secret-key piece with no actions and no OAuth', () => {
    expect(piece).toMatchObject({ slug: 'openai', piece: 'openai' });
    expect(definition.label).toBe('OpenAI');
    expect(definition.admin?.icon).toMatch(/^data:image\/svg\+xml,/);
    expect(definition.oauth).toBeUndefined();
    expect(pieceInstanceTools(piece)).toEqual([]);
    expect(piece[pieceCapabilities]).toMatchObject({ staticAuth: true, provider });
    expect(provider.name).toBe('openai');
  });

  it('accepts only an sk- API key', () => {
    expect(definition.auth!.parse({ apiKey: 'sk-proj-abc' })).toEqual({ apiKey: 'sk-proj-abc' });

    for (const input of [{}, { apiKey: '' }, { apiKey: 'pk-abc' }]) {
      expect(() => definition.auth!.parse(input)).toThrow();
    }
  });

  it('takes no factory key', () => {
    expect(() =>
      (createOpenAI as (config: object) => object)({ auth: { apiKey: 'sk-app' } }),
    ).toThrow("Piece 'openai' takes no auth. Set the app key in ai.providers.openai.");
  });

  it('gives the gateway the key as the call credential', () => {
    expect(provider.credential({ auth: { apiKey: 'sk-user' }, via: 'app' })).toEqual({
      apiKey: 'sk-user',
    });
  });

  it("lists the key's models with GET /v1/models", async () => {
    const fetch = stubModels(
      Response.json({ object: 'list', data: [{ id: 'gpt-4o' }, { id: 'whisper-1' }] }),
    );

    const signal = new AbortController().signal;

    await expect(
      provider.models!({ auth: { apiKey: 'sk-user' }, credential: {}, signal }),
    ).resolves.toEqual(['gpt-4o', 'whisper-1']);
    expect(fetch).toHaveBeenCalledWith('https://api.openai.com/v1/models', {
      headers: { authorization: 'Bearer sk-user' },
      signal,
    });
  });

  it('reports a rejected key with its status', async () => {
    stubModels(Response.json({ error: { message: 'bad key' } }, { status: 401 }));

    const listing = provider.models!({
      auth: { apiKey: 'sk-bad' },
      credential: {},
      signal: new AbortController().signal,
    });

    await expect(listing).rejects.toBeInstanceOf(OpenAIRequestError);
    await expect(listing).rejects.toMatchObject({ status: 401 });
  });
});

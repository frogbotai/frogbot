import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceInstanceTools } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createExa, exaActions } from '../../../packages/pieces/piece-exa/src/index.js';

const req = (auth = { apiKey: 'exa-test' }) =>
  ({
    frogbot: {
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
    },
    user: null,
  }) as never;

afterEach(() => vi.unstubAllGlobals());

describe('exa', () => {
  it('exposes only the supported semantic actions', () => {
    const exa = createExa({ auth: { apiKey: 'exa-test' } });

    expect(pieceInstanceTools(exa)?.map(({ slug }) => slug)).toEqual(
      exaActions.map((slug) => `exa_${slug}`),
    );
  });

  it.each([
    [
      'search',
      { query: 'frogbot' },
      '/search',
      { query: 'frogbot', type: 'auto', numResults: 10, contents: { text: true } },
      { results: [{ url: 'https://example.com', title: 'FrogBot' }] },
      [{ url: 'https://example.com', title: 'FrogBot' }],
    ],
    [
      'getContents',
      { urls: ['https://example.com'] },
      '/contents',
      { urls: ['https://example.com'], text: true },
      { results: [{ url: 'https://example.com', text: 'Page' }] },
      [{ url: 'https://example.com', text: 'Page' }],
    ],
    [
      'generateAnswer',
      { query: 'What is FrogBot?' },
      '/answer',
      { query: 'What is FrogBot?', text: true, model: 'exa' },
      { answer: 'A software platform.' },
      'A software platform.',
    ],
    [
      'findSimilarPages',
      { url: 'https://example.com', numResults: 5 },
      '/findSimilar',
      { url: 'https://example.com', numResults: 5 },
      { results: [{ url: 'https://similar.example' }] },
      [{ url: 'https://similar.example' }],
    ],
  ] as const)('maps %s to the Exa API', async (action, input, path, body, response, output) => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const exa = createExa({ auth: { apiKey: 'exa-test' } });

    await expect(exa[action]({ input, req: req() } as never)).resolves.toEqual(output);
    expect(fetch).toHaveBeenCalledWith(
      `https://api.exa.ai${path}`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': 'exa-test' },
        body: JSON.stringify(body),
      }),
    );
  });

  it('preserves useful Exa failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(
      createExa({ auth: { apiKey: 'exa-test' } }).search({
        input: { query: 'frogbot' },
        req: req(),
      }),
    ).rejects.toMatchObject({
      name: 'ExaRequestError',
      status: 400,
      body: { error: 'Invalid request' },
    });
  });
});

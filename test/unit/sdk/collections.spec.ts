import { afterEach, describe, expect, it, vi } from 'vitest';

import { FrogBotSDKError } from '../../../packages/sdk/src/index';
import { createClients } from './clients';

type Client = ReturnType<typeof createClients>['frogbot'];

type Call = (client: Client) => Promise<unknown>;

const where = { title: { equals: 'Frogs' } };
const file = () => new Blob(['ribbit'], { type: 'text/plain' });

const calls: { name: string; call: Call }[] = [
  {
    name: 'find',
    call: (sdk) => sdk.find({ collection: 'sdk-pages', depth: 1, limit: 5, where }),
  },
  {
    name: 'findByID',
    call: (sdk) =>
      sdk.findByID({
        collection: 'sdk-pages',
        depth: 0,
        draft: true,
        id: 'page-1',
        select: { title: true },
      }),
  },
  { name: 'count', call: (sdk) => sdk.count({ collection: 'sdk-pages', trash: true, where }) },
  {
    name: 'create with JSON',
    call: (sdk) =>
      sdk.create({ collection: 'sdk-pages', data: { title: 'Frogs' }, depth: 0, draft: true }),
  },
  {
    name: 'create with a file',
    call: (sdk) => sdk.create({ collection: 'sdk-media', data: { alt: 'Frog' }, file: file() }),
  },
  {
    name: 'update by ID',
    call: (sdk) =>
      sdk.update({ collection: 'sdk-pages', data: { title: 'Toads' }, id: 7, locale: 'en' }),
  },
  {
    name: 'update by where',
    call: (sdk) =>
      sdk.update({ collection: 'sdk-pages', data: { title: 'Toads' }, limit: 2, where }),
  },
  {
    name: 'update with a file',
    call: (sdk) =>
      sdk.update({ collection: 'sdk-media', data: { alt: 'Toad' }, file: file(), id: 3 } as never),
  },
  { name: 'delete by ID', call: (sdk) => sdk.delete({ collection: 'sdk-pages', id: 7 }) },
  { name: 'delete by where', call: (sdk) => sdk.delete({ collection: 'sdk-pages', where }) },
  {
    name: 'findVersions',
    call: (sdk) =>
      sdk.findVersions({
        collection: 'sdk-pages',
        sort: '-updatedAt',
        where: { parent: { equals: 7 } },
      }),
  },
  {
    name: 'findVersionByID',
    call: (sdk) => sdk.findVersionByID({ collection: 'sdk-pages', depth: 0, id: 'version-1' }),
  },
  {
    name: 'restoreVersion',
    call: (sdk) => sdk.restoreVersion({ collection: 'sdk-pages', draft: true, id: 'version-1' }),
  },
  {
    name: 'find with per-request headers',
    call: (sdk) =>
      sdk.find({ collection: 'sdk-pages' }, { headers: { Authorization: 'JWT token' } }),
  },
];

function notFound() {
  return Response.json({ errors: [{ message: 'Not Found' }] }, { status: 404 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FrogBotSDK collection methods', () => {
  it.each(calls)('$name sends the same request as the Payload client', async ({ call }) => {
    const { frogbot, frogbotRequests, payload, payloadRequests } = createClients();

    await call(frogbot);
    await call(payload as unknown as Client);

    expect(frogbotRequests).toHaveLength(1);
    expect(frogbotRequests).toEqual(payloadRequests);
  });

  it.each(calls)('$name returns the same result as the Payload client', async ({ call }) => {
    const { frogbot, payload } = createClients(() =>
      Response.json({ doc: { id: 7, title: 'Frogs' }, docs: [], errors: [], totalDocs: 1 }),
    );

    const frogbotResult = await call(frogbot);
    const payloadResult = await call(payload as unknown as Client);

    expect(frogbotResult).toEqual(payloadResult);
  });

  it('create fetches a file URL before uploading it, as the Payload client does', async () => {
    const fileFetch = vi.fn(() => Promise.resolve(new Response(file())));
    const { frogbot, frogbotRequests, payload, payloadRequests } = createClients();

    vi.stubGlobal('fetch', fileFetch);

    const options = {
      collection: 'sdk-media',
      data: { alt: 'Frog' },
      file: 'https://cdn.example/images/frog.txt',
    } as never;

    await frogbot.create(options);
    await payload.create(options);

    expect(fileFetch).toHaveBeenCalledWith('https://cdn.example/images/frog.txt');
    expect(frogbotRequests[0]?.body).toMatchObject({
      _payload: '{"alt":"Frog"}',
      file: { name: 'frog.txt', text: 'ribbit', type: 'text/plain' },
    });
    expect(frogbotRequests).toEqual(payloadRequests);
  });

  it('findByID with disableErrors returns null on a 404', async () => {
    const { frogbot } = createClients(notFound);

    const result = await frogbot.findByID({
      collection: 'sdk-pages',
      disableErrors: true,
      id: 'missing',
    });

    expect(result).toBeNull();
  });

  it('findByID with disableErrors returns null when fetch rejects', async () => {
    const { frogbot } = createClients(() => {
      throw new TypeError('fetch failed');
    });

    const result = await frogbot.findByID({
      collection: 'sdk-pages',
      disableErrors: true,
      id: 'page-1',
    });

    expect(result).toBeNull();
  });

  it('findByID without disableErrors throws FrogBotSDKError with the status and errors', async () => {
    const { frogbot } = createClients(notFound);

    const error = await frogbot
      .findByID({ collection: 'sdk-pages', id: 'missing' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(FrogBotSDKError);
    expect(error).toMatchObject({
      errors: [{ message: 'Not Found' }],
      message: 'Not Found',
      status: 404,
    });
  });

  it('findVersionByID with disableErrors returns null on a 404', async () => {
    const { frogbot } = createClients(notFound);

    const result = await frogbot.findVersionByID({
      collection: 'sdk-pages',
      disableErrors: true,
      id: 'missing',
    });

    expect(result).toBeNull();
  });

  it('findVersionByID without disableErrors throws FrogBotSDKError', async () => {
    const { frogbot } = createClients(notFound);

    const error = await frogbot
      .findVersionByID({ collection: 'sdk-pages', id: 'missing' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(FrogBotSDKError);
    expect(error.status).toBe(404);
  });

  it('builds paths with reserved characters unencoded, as the Payload client does', async () => {
    const { frogbot, frogbotRequests, payload, payloadRequests } = createClients();

    await frogbot.findByID({ collection: 'sdk-pages', id: 'a/b?c' });
    await payload.findByID({ collection: 'sdk-pages', id: 'a/b?c' });

    expect(frogbotRequests[0]?.url).toBe('https://frogbot.example/api/sdk-pages/a/b?c');
    expect(frogbotRequests).toEqual(payloadRequests);
  });

  it('upload stays a shorthand for a file create', async () => {
    const { frogbot, frogbotRequests } = createClients(() =>
      Response.json({ doc: { filename: 'frog.txt', id: 1, mimeType: 'text/plain' } }),
    );

    const uploaded = await frogbot.upload('sdk-media', new File(['ribbit'], 'frog.txt'));

    await frogbot.create({
      collection: 'sdk-media',
      data: {},
      file: new File(['ribbit'], 'frog.txt'),
    });

    expect(uploaded).toEqual({ filename: 'frog.txt', id: 1, mimeType: 'text/plain' });
    expect(frogbotRequests[0]).toEqual(frogbotRequests[1]);
  });
});

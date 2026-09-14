import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createDropbox,
  dropboxActions,
  dropboxAuth,
  dropboxOAuth,
  dropboxScopes,
} from '../../../packages/pieces/piece-dropbox/src/index.js';

const auth = { accessToken: 'dropbox-access', refreshToken: 'dropbox-refresh' };
const file = {
  '.tag': 'file',
  id: 'id:file',
  name: 'report.txt',
  path_display: '/report.txt',
};
const folder = {
  '.tag': 'folder',
  id: 'id:folder',
  name: 'Folder',
  path_display: '/Folder',
};

type CapturedRequest = {
  url: URL;
  method: string;
  headers: Headers;
  body: Buffer;
  redirect?: RequestRedirect;
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestFixture(
  route: (request: CapturedRequest) => Response | Promise<Response> = () => json(file),
) {
  const requests: CapturedRequest[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (url, options) => {
      const request = {
        url: new URL(url instanceof Request ? url.url : String(url)),
        method: options?.method ?? 'GET',
        headers: new Headers(options?.headers),
        body: Buffer.from(await new Response(options?.body).arrayBuffer()),
        redirect: options?.redirect,
      };

      requests.push(request);

      return route(request);
    }),
  );

  return requests;
}

function request() {
  return {
    url: 'https://app.test/api',
    headers: new Headers({ authorization: 'Bearer local', cookie: 'session=private' }),
    user: null,
    frogbot: {
      config: {
        files: { slug: 'files' },
        _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
      },
      findByID: vi.fn().mockResolvedValue({
        id: 'source',
        url: '/api/files/source/report.txt',
        filename: 'report.txt',
        mimeType: 'text/plain',
      }),
      create: vi.fn().mockResolvedValue({ id: 'saved', url: '/api/files/saved/report.txt' }),
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: {} }) },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('native Dropbox contract', () => {
  it('exposes exactly 14 actions and one polling trigger', () => {
    const definition = pieceFactoryDefinition(createDropbox);
    const dropbox = createDropbox({ auth });

    expect(definition.actions.map((action) => action.slug)).toEqual(dropboxActions);
    expect(definition.triggers.map((trigger) => trigger.slug)).toEqual(['newFolder']);
    expect(pieceInstanceTools(dropbox)?.map((tool) => tool.slug)).toEqual(
      dropboxActions.map((slug) => `dropbox_${slug}`),
    );
    expect(dropboxActions).toHaveLength(14);
  });

  it('declares the exact OAuth recipe and executes stored-token and account mapping', async () => {
    const definition = pieceFactoryDefinition(createDropbox);
    const requests = requestFixture(() =>
      json({
        account_id: 'dbid:account',
        name: { display_name: 'Ada Lovelace' },
        email: 'ada@example.com',
      }),
    );
    const client = await createDropbox({ auth }).client({ req: request() });

    expect(definition.oauth).toBe(dropboxOAuth);
    expect(dropboxOAuth).toMatchObject({
      authorizationUrl: 'https://www.dropbox.com/oauth2/authorize',
      tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
      scopes: dropboxScopes,
      pkce: true,
      params: { token_access_type: 'offline' },
    });
    expect(
      dropboxOAuth.toAuth({ tokens: { access_token: 'stored', refresh_token: 'refresh' } }),
    ).toEqual({ accessToken: 'stored', refreshToken: 'refresh' });
    await expect(
      dropboxOAuth.account({ tokens: { access_token: 'stored' }, client, req: request() }),
    ).resolves.toEqual({
      id: 'dbid:account',
      label: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(requests[0]?.url.pathname).toBe('/2/users/get_current_account');
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer dropbox-access');
    expect(dropboxAuth.safeParse({ accessToken: '' }).success).toBe(false);
  });

  it('executes every action through the controlled Dropbox transport', async () => {
    const requests = requestFixture(({ url }) => {
      if (url.pathname.endsWith('/get_temporary_link')) {
        return json({ metadata: file, link: 'https://dropbox.test/file' });
      }
      if (url.pathname.endsWith('/create_folder_v2')) return json({ metadata: folder });
      if (
        url.pathname.endsWith('/copy_v2') ||
        url.pathname.endsWith('/move_v2') ||
        url.pathname.endsWith('/delete_v2')
      ) {
        return json({ metadata: file });
      }
      if (url.pathname.endsWith('/list_folder')) {
        return json({ entries: [], cursor: 'list', has_more: false });
      }
      if (url.pathname.endsWith('/search_v2')) return json({ matches: [], has_more: false });
      if (url.pathname.endsWith('/download')) {
        return new Response('downloaded', { headers: { 'content-type': 'text/plain' } });
      }
      if (url.origin === 'https://app.test') return new Response('uploaded');

      return json(file);
    });
    const dropbox = createDropbox({ auth });
    const req = request();
    const results = await Promise.all([
      dropbox.searchFiles({ req, input: { query: 'report' } }),
      dropbox.createTextFile({ req, input: { path: '/text.txt', text: 'text' } }),
      dropbox.uploadFile({ req, input: { path: '/upload.txt', file: { fileId: 'source' } } }),
      dropbox.downloadFile({ req, input: { path: '/report.txt' } }),
      dropbox.getTemporaryLink({ req, input: { path: '/report.txt' } }),
      dropbox.deleteFile({ req, input: { path: '/report.txt' } }),
      dropbox.moveFile({ req, input: { fromPath: '/a', toPath: '/b' } }),
      dropbox.copyFile({ req, input: { fromPath: '/a', toPath: '/b' } }),
      dropbox.createFolder({ req, input: { path: '/folder' } }),
      dropbox.deleteFolder({ req, input: { path: '/folder' } }),
      dropbox.moveFolder({ req, input: { fromPath: '/a', toPath: '/b' } }),
      dropbox.copyFolder({ req, input: { fromPath: '/a', toPath: '/b' } }),
      dropbox.listFolder({ req, input: { path: '' } }),
      dropbox.customApiCall({
        req,
        input: {
          method: 'POST',
          path: '/files/delete_v2',
          body: { type: 'json', value: { path: '/a' } },
        },
      }),
    ]);

    expect(results).toHaveLength(14);
    expect(req.frogbot.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'files', overrideAccess: false, req }),
    );
    expect(req.frogbot.create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'files', overrideAccess: false, req }),
    );
    expect(requests.some(({ url }) => url.pathname.endsWith('/upload'))).toBe(true);
    expect(requests.some(({ url }) => url.pathname.endsWith('/download'))).toBe(true);
  });
});

describe('Dropbox transport details', () => {
  it('encodes non-ASCII Dropbox content arguments and sends file bytes', async () => {
    const requests = requestFixture(({ url }) =>
      url.origin === 'https://app.test' ? new Response(new Uint8Array([0, 255])) : json(file),
    );
    const dropbox = createDropbox({ auth });

    await dropbox.uploadFile({
      req: request(),
      input: { path: '/café.bin', file: { fileId: 'source' } },
    });

    const upload = requests.find((item) => item.url.pathname.endsWith('/upload'));

    expect(upload?.headers.get('dropbox-api-arg')).toContain('/caf\\u00e9.bin');
    expect(upload?.body).toEqual(Buffer.from([0, 255]));
  });

  it('stores downloaded bytes through the access-checked files collection', async () => {
    requestFixture(() =>
      Promise.resolve(
        new Response(new Uint8Array([0, 255]), {
          headers: { 'content-type': 'application/octet-stream' },
        }),
      ),
    );
    const dropbox = createDropbox({ auth });
    const req = request();

    await expect(dropbox.downloadFile({ req, input: { path: '/binary.dat' } })).resolves.toEqual({
      file: {
        id: 'saved',
        name: 'binary.dat',
        mimeType: 'application/octet-stream',
        size: 2,
        url: '/api/files/saved/report.txt',
      },
    });
    expect(req.frogbot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'files',
        overrideAccess: false,
        req,
        file: expect.objectContaining({ data: Buffer.from([0, 255]) }),
      }),
    );
  });

  it('follows list pages and polling cursor pages', async () => {
    let continuation = 0;
    const requests = requestFixture(({ url }) => {
      if (url.pathname.endsWith('/get_latest_cursor')) return json({ cursor: 'initial' });
      if (url.pathname.endsWith('/continue')) {
        continuation += 1;

        return json({
          entries: continuation === 1 ? [folder] : [],
          cursor: `cursor-${continuation}`,
          has_more: continuation === 1,
        });
      }

      return json({ entries: [file], cursor: 'first', has_more: true });
    });
    const dropbox = createDropbox({ auth });
    const req = request();
    const client = await dropbox.client({ req });
    const trigger = pieceFactoryDefinition(createDropbox).triggers[0];

    if (!trigger || trigger.type !== 'polling') throw new Error('Expected polling trigger.');

    await expect(dropbox.listFolder({ req, input: { path: '' } })).resolves.toEqual({
      entries: [file, folder],
      cursor: 'cursor-2',
    });

    continuation = 0;

    await expect(
      trigger.run({ client, req, input: { path: '', recursive: false }, options: {} }),
    ).resolves.toEqual({
      events: [],
      cursor: 'initial',
    });
    await expect(
      trigger.run({
        client,
        req,
        input: { path: '', recursive: false },
        options: {},
        cursor: 'initial',
      }),
    ).resolves.toEqual({ events: [folder], cursor: 'cursor-2' });
    expect(requests.filter((item) => item.url.pathname.endsWith('/continue'))).toHaveLength(4);
  });

  it.each([
    'https://attacker.test/2/files/list_folder',
    '//attacker.test/2/files/list_folder',
    'http://api.dropboxapi.com/2/files/list_folder',
    'https://api.dropboxapi.com@attacker.test/2/files/list_folder',
    'https://user:password@api.dropboxapi.com/2/files/list_folder',
    'https://api.dropboxapi.com/1/files/list_folder',
    '/2/../oauth2/token',
    '/files/list_folder#fragment',
  ])('rejects unsafe custom URL %s before authorization leaves the process', async (path) => {
    const requests = requestFixture();
    const dropbox = createDropbox({ auth });

    await expect(
      dropbox.customApiCall({ req: request(), input: { method: 'POST', path } }),
    ).rejects.toThrow('Dropbox API URL');
    expect(requests).toEqual([]);
  });

  it.each(['Authorization', 'Cookie', 'Host', 'Proxy-Authorization'])(
    'rejects reserved custom header %s',
    async (name) => {
      const requests = requestFixture();
      const dropbox = createDropbox({ auth });

      await expect(
        dropbox.customApiCall({
          req: request(),
          input: { method: 'POST', path: '/files/list_folder', headers: { [name]: 'bad' } },
        }),
      ).rejects.toThrow('reserved');
      expect(requests).toEqual([]);
    },
  );
});

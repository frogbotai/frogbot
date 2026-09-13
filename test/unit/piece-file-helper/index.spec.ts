import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/pieces/definePiece.js'));

import { pieceInstanceTools } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createFileHelper } from '../../../packages/pieces/piece-file-helper/src/index.js';

const actionSlugs = [
  'readFile',
  'createFile',
  'changeFileEncoding',
  'checkFileType',
  'zipFiles',
  'unzipFile',
  'getFileName',
] as const;

function fixture({
  bytes = Buffer.from('hello'),
  filename = 'source.txt',
  mimeType = 'text/plain',
}: {
  bytes?: Buffer;
  filename?: string;
  mimeType?: string;
} = {}) {
  const findByID = vi.fn().mockResolvedValue({
    url: '/api/files/source',
    filename,
    mimeType,
  });
  const create = vi.fn().mockImplementation(async ({ file }) => ({
    id: `saved-${create.mock.calls.length}`,
    url: `/api/files/${file.name}`,
  }));
  const req = {
    url: 'https://app.test/actions',
    headers: new Headers({ authorization: 'Bearer token', cookie: 'session=private' }),
    frogbot: {
      config: {
        files: { slug: 'files' },
        _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
      },
      findByID,
      create,
    },
  } as never;
  const fetch = vi.fn().mockImplementation(async () => new Response(bytes));

  vi.stubGlobal('fetch', fetch);

  return { create, fetch, findByID, req };
}

afterEach(() => vi.unstubAllGlobals());

describe('file-helper', () => {
  it('exposes every upstream action under a semantic slug and no triggers', () => {
    const piece = createFileHelper();

    expect(pieceInstanceTools(piece)?.map(({ slug }) => slug)).toEqual(
      actionSlugs.map((slug) => `file-helper_${slug}`),
    );
    expect(piece.triggers).toEqual({});
  });

  it('creates encoded files through the configured files collection', async () => {
    const { create, req } = fixture();

    await expect(
      createFileHelper().createFile({
        req,
        input: { content: '6869', fileName: 'hello.txt', encoding: 'hex' },
      }),
    ).resolves.toEqual({ id: 'saved-1', filename: 'hello.txt', url: '/api/files/hello.txt' });
    expect(create).toHaveBeenCalledWith({
      collection: 'files',
      data: {},
      req,
      overrideAccess: false,
      file: { data: Buffer.from('hi'), name: 'hello.txt', mimetype: 'text/plain', size: 2 },
    });
  });

  it('reads text, Base64, names, and MIME matches from an access-checked file', async () => {
    const { fetch, findByID, req } = fixture();
    const piece = createFileHelper();

    await expect(
      piece.readFile({ req, input: { file: 'source', format: 'text' } }),
    ).resolves.toEqual({ text: 'hello' });
    await expect(
      piece.readFile({ req, input: { file: 'source', format: 'base64' } }),
    ).resolves.toEqual({
      base64: 'aGVsbG8=',
      base64WithMimeType: 'data:text/plain;base64,aGVsbG8=',
    });
    await expect(piece.getFileName({ req, input: { file: 'source' } })).resolves.toEqual({
      fileName: 'source.txt',
    });
    await expect(
      piece.checkFileType({ req, input: { file: 'source', mimeType: 'text/plain' } }),
    ).resolves.toEqual({ mimeType: 'text/plain', isMatch: true });
    expect(findByID).toHaveBeenCalledWith({
      collection: 'files',
      id: 'source',
      depth: 0,
      req,
      overrideAccess: false,
    });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
    expect(fetch.mock.calls[0]?.[1]?.headers.get('authorization')).toBe('Bearer token');
  });

  it('does not forward request credentials to external file storage', async () => {
    const { fetch, findByID, req } = fixture();

    findByID.mockResolvedValue({
      url: 'https://storage.test/signed',
      filename: 'source.txt',
      mimeType: 'text/plain',
    });

    await createFileHelper().readFile({ req, input: { file: 'source', format: 'text' } });

    expect(fetch).toHaveBeenCalledOnce();

    const headers = fetch.mock.calls[0]![1]!.headers;

    expect([...headers]).toEqual([]);
  });

  it('changes file encoding before saving the result', async () => {
    const { create, req } = fixture({ bytes: Buffer.from('héllo', 'utf8') });

    await createFileHelper().changeFileEncoding({
      req,
      input: {
        inputFile: 'source',
        inputEncoding: 'utf8',
        outputFileName: 'latin.txt',
        outputEncoding: 'latin1',
      },
    });

    expect(create.mock.calls[0]?.[0].file.data).toEqual(Buffer.from('héllo', 'latin1'));
  });

  it('round-trips nested ZIP entries through FrogBot files', async () => {
    const zipped = fixture({ bytes: Buffer.from('one'), filename: 'one.txt' });
    const piece = createFileHelper();

    await piece.zipFiles({
      req: zipped.req,
      input: {
        files: [{ file: 'source', filePath: 'folder/one.txt' }],
        outputFileName: 'archive.zip',
      },
    });

    const archive = zipped.create.mock.calls[0]?.[0].file.data as Buffer;
    const extracted = fixture({
      bytes: archive,
      filename: 'archive.zip',
      mimeType: 'application/zip',
    });

    await expect(
      piece.unzipFile({ req: extracted.req, input: { file: 'archive', maxResults: 1 } }),
    ).resolves.toEqual([
      {
        file: { id: 'saved-1', filename: 'one.txt', url: '/api/files/one.txt' },
        filePath: 'folder/one.txt',
      },
    ]);
    expect(extracted.create.mock.calls[0]?.[0].file.data).toEqual(Buffer.from('one'));
  });

  it('enforces ZIP entry limits and required passwords', async () => {
    const source = fixture();
    const piece = createFileHelper();

    await expect(
      piece.zipFiles({
        req: source.req,
        input: {
          files: [{ file: 'source' }],
          outputFileName: 'archive.zip',
          usePassword: true,
        },
      }),
    ).rejects.toThrow('password');

    await piece.zipFiles({
      req: source.req,
      input: {
        files: [
          { file: 'source', filePath: 'one.txt' },
          { file: 'source', filePath: 'two.txt' },
        ],
        outputFileName: 'archive.zip',
      },
    });

    const archive = source.create.mock.calls[0]?.[0].file.data as Buffer;
    const extracted = fixture({ bytes: archive, filename: 'archive.zip' });

    await expect(
      piece.unzipFile({ req: extracted.req, input: { file: 'archive', maxResults: 0 } }),
    ).resolves.toHaveLength(2);
    await expect(
      piece.unzipFile({ req: extracted.req, input: { file: 'archive', maxResults: 1 } }),
    ).rejects.toThrow('more entries than allowed: 2');
  });

  it('fails closed when the files collection or file response is unavailable', async () => {
    const missing = fixture();

    const config = (missing.req as { frogbot: { config: { files?: { slug: string } } } }).frogbot
      .config;

    config.files = undefined;

    await expect(
      createFileHelper().readFile({
        req: missing.req,
        input: { file: 'source', format: 'text' },
      }),
    ).rejects.toThrow('files collection');

    const denied = fixture();

    denied.fetch.mockResolvedValue(new Response('denied', { status: 403 }));

    await expect(
      createFileHelper().readFile({
        req: denied.req,
        input: { file: 'source', format: 'text' },
      }),
    ).rejects.toThrow('403');
  });
});

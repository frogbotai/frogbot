import { afterEach, describe, expect, it, vi } from 'vitest';

import { contentBytes } from '../../../packages/pieces/piece-google-drive/src/files.js';
import { folderMimeType } from '../../../packages/pieces/piece-google-drive/src/schemas.js';
import { fixture, json, metadata } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());

describe('Google Drive files through the SDK', () => {
  it('creates folders with shared-drive support and no media', async () => {
    const { drive, req, requests } = await fixture();
    await expect(
      drive.createFolder({
        req,
        input: {
          name: 'Invoices',
          parentFolderId: 'parent',
          includeSharedDrives: true,
        },
      }),
    ).resolves.toEqual(metadata);
    expect(requests[0]?.url.pathname).toBe('/drive/v3/files');
    expect(requests[0]?.url.searchParams.get('supportsAllDrives')).toBe('true');
    expect(JSON.parse(requests[0]!.body.toString())).toEqual({
      name: 'Invoices',
      mimeType: folderMimeType,
      parents: ['parent'],
    });
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer drive-access');
    expect(requests[0]?.redirect).toBe('error');
  });

  it.each(['text/plain', 'text/csv', 'text/xml'] as const)(
    'creates %s with UTF-8 bytes',
    async (mimeType) => {
      const { drive, req, requests } = await fixture();
      await drive.createFile({ req, input: { name: '新しい', text: 'héllo,世界', mimeType } });
      expect(requests[0]?.url.pathname).toBe('/upload/drive/v3/files');
      expect(requests[0]?.url.searchParams.get('uploadType')).toBe('multipart');
      expect(requests[0]?.body.toString()).toContain('héllo,世界');
      expect(requests[0]?.body.toString()).toContain(`content-type: ${mimeType}`);
      expect(requests[0]?.body.toString()).not.toContain('"parents"');
    },
  );

  it('uploads an access-checked FrogBot file without altering bytes', async () => {
    const data = new Uint8Array([0, 255, 13, 10, 128, 42]);
    const fetchFile = vi.fn().mockResolvedValue(new Response(data));
    vi.stubGlobal('fetch', fetchFile);
    const { drive, req, requests, findByID } = await fixture();
    await drive.uploadFile({
      req,
      input: {
        file: { fileId: 'source', name: 'renamed.bin' },
        parentFolderId: 'parent',
        includeSharedDrives: true,
      },
    });
    expect(findByID).toHaveBeenCalledWith({
      collection: 'files',
      id: 'source',
      depth: 0,
      req,
      overrideAccess: false,
    });
    const fetchOptions = fetchFile.mock.calls[0]![1];
    expect(fetchOptions.headers.get('authorization')).toBe('Bearer app-token');
    expect(fetchOptions.headers.get('cookie')).toBe('session=private');
    expect(fetchOptions.redirect).toBe('error');
    expect(requests[0]?.body.includes(Buffer.from(data))).toBe(true);
    expect(requests[0]?.body.toString()).toContain('renamed.bin');
    expect(requests[0]?.body.toString()).toContain('"parents":["parent"]');
  });

  it('does not forward app credentials to external storage', async () => {
    const fetchFile = vi.fn().mockResolvedValue(new Response('bytes'));
    vi.stubGlobal('fetch', fetchFile);
    const { drive, req, findByID } = await fixture();
    findByID.mockResolvedValue({ url: 'https://storage.test/signed', filename: 'file' });
    await drive.uploadFile({ req, input: { file: { fileId: 'source' } } });
    expect([...fetchFile.mock.calls[0]![1].headers]).toEqual([]);
  });

  it.each(['missing', 'denied', 'fetch'])('fails closed on %s file access', async (failure) => {
    const fetchFile = vi.fn().mockResolvedValue(new Response('denied', { status: 403 }));
    vi.stubGlobal('fetch', fetchFile);
    const { drive, req, findByID, requests } = await fixture();
    if (failure === 'missing') findByID.mockResolvedValue({});
    if (failure === 'denied') findByID.mockRejectedValue(new Error('Access denied'));
    await expect(
      drive.uploadFile({ req, input: { file: { fileId: 'source' } } }),
    ).rejects.toThrow();
    expect(requests).toEqual([]);
    if (failure !== 'fetch') expect(fetchFile).not.toHaveBeenCalled();
  });

  it('downloads arbitrary bytes to an access-checked FrogBot file', async () => {
    const bytes = new Uint8Array([255, 0, 128, 10]);
    const { drive, req, requests, create } = await fixture(({ url }) =>
      url.searchParams.get('alt') === 'media' ? new Response(bytes) : json(metadata),
    );
    await expect(
      drive.downloadFile({ req, input: { fileId: 'file', includeSharedDrives: true } }),
    ).resolves.toEqual({
      id: 'saved',
      url: '/api/files/saved/report.txt',
      name: 'report.txt',
      mimeType: 'text/plain',
      size: 4,
    });
    expect(create).toHaveBeenCalledWith({
      collection: 'files',
      data: {},
      req,
      overrideAccess: false,
      file: { data: Buffer.from(bytes), name: 'report.txt', mimetype: 'text/plain', size: 4 },
    });
    expect(requests.every(({ url }) => url.searchParams.get('supportsAllDrives') === 'true')).toBe(
      true,
    );
  });

  it.each([
    ['document', '.docx', 'wordprocessingml.document'],
    ['spreadsheet', '.xlsx', 'spreadsheetml.sheet'],
    ['presentation', '.pptx', 'presentationml.presentation'],
  ])(
    'exports Google %s content with the correct format and extension',
    async (kind, extension, mime) => {
      const { drive, req, requests, create } = await fixture(({ url }) =>
        url.pathname.endsWith('/export')
          ? new Response('office bytes')
          : json({ id: 'file', name: 'Report', mimeType: `application/vnd.google-apps.${kind}` }),
      );
      await drive.downloadFile({ req, input: { fileId: 'file' } });
      expect(requests[1]?.url.searchParams.get('mimeType')).toBe(
        `application/vnd.openxmlformats-officedocument.${mime}`,
      );
      expect(create.mock.calls[0]![0].file.name).toBe(`Report${extension}`);
      expect(create.mock.calls[0]![0].file.data).toEqual(Buffer.from('office bytes'));
    },
  );

  it('rejects folder downloads and export failures without saving a file', async () => {
    const { drive, req, create } = await fixture(() =>
      json({ ...metadata, mimeType: folderMimeType }),
    );
    await expect(drive.downloadFile({ req, input: { fileId: 'file' } })).rejects.toThrow(
      'Folders cannot',
    );
    expect(create).not.toHaveBeenCalled();
    const failing = await fixture(({ url }) =>
      url.pathname.endsWith('/export')
        ? json({ error: { message: 'Cannot export' } }, 403)
        : json({ ...metadata, mimeType: 'application/vnd.google-apps.document' }),
    );
    await expect(
      failing.drive.downloadFile({ req: failing.req, input: { fileId: 'file' } }),
    ).rejects.toThrow('403');
    expect(failing.create).not.toHaveBeenCalled();
  });

  it('gets full metadata and copies with Google-format conversion', async () => {
    const { drive, req, requests } = await fixture();
    await drive.getFile({ req, input: { fileId: 'file', includeSharedDrives: true } });
    expect(requests[0]?.url.searchParams.get('fields')).toBe('*');
    await drive.copyFile({
      req,
      input: {
        fileId: 'file',
        name: 'Copy',
        folderId: 'destination',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        includeSharedDrives: true,
      },
    });
    expect(requests[1]?.url.pathname).toBe('/drive/v3/files/file/copy');
    expect(JSON.parse(requests[1]!.body.toString())).toEqual({
      name: 'Copy',
      parents: ['destination'],
      mimeType: 'application/vnd.google-apps.spreadsheet',
    });
    expect(requests[1]?.url.searchParams.get('supportsAllDrives')).toBe('true');
  });

  it('exports PDF bytes and uploads them without base64 decoding', async () => {
    const bytes = Buffer.from('%PDF-1.7\n\u0000é');
    const { drive, req, requests } = await fixture(({ url }) =>
      url.pathname.endsWith('/export') ? new Response(bytes) : json(metadata),
    );
    await drive.exportPdf({
      req,
      input: {
        fileId: 'document',
        folderId: 'folder',
        name: 'report.pdf',
        includeSharedDrives: true,
      },
    });
    expect(requests[0]?.url.searchParams.get('mimeType')).toBe('application/pdf');
    expect(requests[1]?.body.includes(bytes)).toBe(true);
    expect(requests[1]?.body.toString()).toContain('"name":"report.pdf"');
    expect(requests[1]?.body.toString()).not.toContain('report.pdf.pdf');
    expect(requests[1]?.url.searchParams.get('supportsAllDrives')).toBe('true');
  });

  it('does not upload a PDF when export fails', async () => {
    const { drive, req, requests } = await fixture(() =>
      json({ error: { message: 'Export denied' } }, 403),
    );
    await expect(
      drive.exportPdf({ req, input: { fileId: 'file', folderId: 'folder', name: 'pdf' } }),
    ).rejects.toThrow('403');
    expect(requests).toHaveLength(1);
  });

  it.each([
    [['old', 'older'], 'destination', 'old,older', 'destination', 2],
    [['destination', 'old'], 'destination', 'old', null, 2],
    [['destination'], 'destination', null, null, 1],
    [[], 'destination', null, 'destination', 2],
  ])(
    'moves from %j without detaching the destination',
    async (parents, folderId, remove, add, count) => {
      const { drive, req, requests } = await fixture(() => json({ ...metadata, parents }));
      await drive.moveFile({
        req,
        input: { fileId: 'file', folderId: folderId as string, includeSharedDrives: true },
      });
      expect(requests).toHaveLength(count as number);
      if (count === 2) {
        expect(requests[1]?.method).toBe('PATCH');
        expect(requests[1]?.url.searchParams.get('removeParents')).toBe(remove);
        expect(requests[1]?.url.searchParams.get('addParents')).toBe(add);
        expect(requests[1]?.url.searchParams.get('supportsAllDrives')).toBe('true');
      }
    },
  );

  it('trashes by PATCH and permanently deletes by DELETE', async () => {
    const { drive, req, requests } = await fixture(({ method }) =>
      method === 'DELETE'
        ? new Response(null, { status: 204 })
        : json({ ...metadata, trashed: true }),
    );
    await expect(
      drive.trashFile({ req, input: { fileId: 'file', includeSharedDrives: true } }),
    ).resolves.toMatchObject({ trashed: true });
    expect(JSON.parse(requests[0]!.body.toString())).toEqual({ trashed: true });
    await expect(
      drive.deleteFile({ req, input: { fileId: 'file', includeSharedDrives: true } }),
    ).resolves.toEqual({ deleted: true });
    expect(requests[1]?.method).toBe('DELETE');
    expect(requests[1]?.url.searchParams.get('supportsAllDrives')).toBe('true');
  });

  it.each([401, 403, 404, 429, 500])(
    'propagates HTTP %s without retrying or refreshing',
    async (status) => {
      const { drive, req, requests, oauth } = await fixture(() =>
        json({ error: { message: 'Provider failure' } }, status),
      );
      await expect(drive.getFile({ req, input: { fileId: 'file' } })).rejects.toThrow(
        'Provider failure',
      );
      expect(requests).toHaveLength(1);
      expect(oauth.credentials.access_token).toBe('drive-access');
      expect(oauth.credentials.refresh_token).toBeUndefined();
    },
  );

  it('honors cancellation before sending any SDK request', async () => {
    const { drive, req, controller, requests } = await fixture();
    controller.abort(new Error('Cancelled'));
    await expect(drive.getFile({ req, input: { fileId: 'file' } })).rejects.toThrow('Cancelled');
    expect(requests).toEqual([]);
  });

  it('handles typed-array offsets and rejects text masquerading as bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(contentBytes(new DataView(bytes.buffer, 1, 2))).toEqual(Buffer.from([2, 3]));
    expect(() => contentBytes('not bytes')).toThrow('did not return file bytes');
  });
});

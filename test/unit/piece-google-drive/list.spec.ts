import { describe, expect, it } from 'vitest';

import { folderOptions } from '../../../packages/pieces/piece-google-drive/src/actions/list.js';
import { folderMimeType } from '../../../packages/pieces/piece-google-drive/src/schemas.js';
import { fixture, json, metadata } from './fixtures.js';

describe('Google Drive listing and search', () => {
  it('traverses all pages and exactly the requested depth, reporting download failures', async () => {
    const { drive, req, requests, create } = await fixture(({ url }) => {
      if (url.searchParams.get('alt') === 'media') {
        return url.pathname.endsWith('/bad')
          ? json({ error: { message: 'Download denied' } }, 403)
          : new Response('contents');
      }
      if (url.searchParams.get('q')?.startsWith("'child'")) {
        return json({
          files: [
            { ...metadata, id: 'nested' },
            { id: 'grandchild', mimeType: folderMimeType },
          ],
          incompleteSearch: true,
        });
      }
      if (url.searchParams.get('pageToken') === 'page2') {
        return json({ files: [{ ...metadata, id: 'bad' }] });
      }
      return json({
        files: [metadata, { id: 'child', mimeType: folderMimeType }],
        nextPageToken: 'page2',
      });
    });
    const result = await drive.listFiles({
      req,
      input: {
        folderId: 'root',
        depth: 2,
        downloadFiles: true,
        includeSharedDrives: true,
      },
    });
    expect(result.files.map((file) => file.id)).toEqual([
      'file',
      'child',
      'bad',
      'nested',
      'grandchild',
    ]);
    expect(result.incompleteSearch).toBe(true);
    expect(result.downloadedFiles).toHaveLength(2);
    expect(result.downloadErrors).toEqual([
      { fileId: 'bad', message: 'Request failed with status code 403' },
    ]);
    expect(create).toHaveBeenCalledTimes(2);
    const lists = requests.filter(({ url }) => url.pathname === '/drive/v3/files');
    expect(lists).toHaveLength(3);
    expect(lists[1]?.url.searchParams.get('pageToken')).toBe('page2');
    expect(lists[2]?.url.searchParams.get('q')).toBe("'child' in parents and trashed = false");
    expect(
      lists.every(({ url }) => url.searchParams.get('includeItemsFromAllDrives') === 'true'),
    ).toBe(true);
    expect(lists.every(({ url }) => url.searchParams.get('corpora') === 'allDrives')).toBe(true);
  });

  it('defaults to the current folder and can include trashed files', async () => {
    const { drive, req, requests } = await fixture(() =>
      json({ files: [{ id: 'child', mimeType: folderMimeType }] }),
    );
    await drive.listFiles({ req, input: { folderId: 'root', includeTrashed: true } });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.searchParams.get('q')).toBe("'root' in parents");
    expect(requests[0]?.url.searchParams.get('corpora')).toBe('user');
  });

  it('guards recursive cycles and repeated page tokens', async () => {
    const cycle = await fixture(() => json({ files: [{ id: 'root', mimeType: folderMimeType }] }));
    await cycle.drive.listFiles({ req: cycle.req, input: { folderId: 'root', depth: 100 } });
    expect(cycle.requests).toHaveLength(1);
    const pages = await fixture(() => json({ files: [], nextPageToken: 'same' }));
    await expect(
      pages.drive.searchFiles({ req: pages.req, input: { query: 'report' } }),
    ).rejects.toThrow('repeated a page token');
    expect(pages.requests).toHaveLength(2);
  });

  it('escapes Drive query literals, filters files, and consumes search pagination', async () => {
    const { drive, req, requests } = await fixture(({ url }) =>
      json(
        url.searchParams.has('pageToken')
          ? { files: [{ ...metadata, id: 'second' }] }
          : { files: [metadata], nextPageToken: 'next' },
      ),
    );
    const result = await drive.searchFiles({
      req,
      input: {
        query: "O'Brien\\report",
        parentFolderId: "folder'\\",
        type: 'file',
        queryTerm: 'fullText',
        operator: 'contains',
        includeSharedDrives: true,
      },
    });
    expect(result.map((file) => file.id)).toEqual(['file', 'second']);
    expect(requests[0]?.url.searchParams.get('q')).toBe(
      "fullText contains 'O\\'Brien\\\\report' and 'folder\\'\\\\' in parents and mimeType != 'application/vnd.google-apps.folder'",
    );
    expect(requests[1]?.url.searchParams.get('pageToken')).toBe('next');
  });

  it('searches MIME types and folders and returns empty results', async () => {
    const { drive, req, requests } = await fixture(() => json({}));
    await expect(
      drive.searchFiles({
        req,
        input: { query: folderMimeType, queryTerm: 'mimeType', operator: '=', type: 'folder' },
      }),
    ).resolves.toEqual([]);
    expect(requests[0]?.url.searchParams.get('q')).toBe(
      `mimeType = '${folderMimeType}' and mimeType = '${folderMimeType}'`,
    );
  });

  it('returns native folder choices with shared-drive flags', async () => {
    const { client, req, requests } = await fixture(() =>
      json({ files: [{ id: 'folder', name: 'Invoices' }, { name: 'No ID' }] }),
    );
    await expect(
      folderOptions({ client, req, input: { includeSharedDrives: true } }),
    ).resolves.toEqual([{ label: 'Invoices', value: 'folder' }]);
    expect(requests[0]?.url.searchParams.get('q')).toBe(
      `mimeType = '${folderMimeType}' and trashed = false`,
    );
  });

  it('propagates cancellation during downloads instead of reporting partial success', async () => {
    const context = await fixture(({ url }) => {
      if (url.searchParams.get('alt') === 'media') {
        context.controller.abort(new Error('Stop downloading'));
        throw new Error('Aborted');
      }
      return json({ files: [metadata] });
    });
    await expect(
      context.drive.listFiles({
        req: context.req,
        input: { folderId: 'root', downloadFiles: true },
      }),
    ).rejects.toThrow('Stop downloading');
  });

  it.each([0, -1, 1.5])('rejects invalid recursive depth %s before any request', async (depth) => {
    const { drive, req, requests } = await fixture();
    await expect(drive.listFiles({ req, input: { folderId: 'root', depth } })).rejects.toThrow();
    expect(requests).toEqual([]);
  });
});

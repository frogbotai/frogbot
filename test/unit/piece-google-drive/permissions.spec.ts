import { describe, expect, it } from 'vitest';

import { folderMimeType } from '../../../packages/pieces/piece-google-drive/src/schemas.js';
import { fixture, json, metadata } from './fixtures.js';

describe('Google Drive permissions', () => {
  it.each(['organizer', 'fileOrganizer', 'writer', 'commenter', 'reader'] as const)(
    'creates a %s grant with notification control',
    async (role) => {
      const { drive, req, requests } = await fixture(() =>
        json({ id: 'permission', role, type: 'user' }),
      );
      await expect(
        drive.createPermission({
          req,
          input: {
            fileId: 'file',
            email: 'user@example.com',
            role,
            sendNotificationEmail: true,
            includeSharedDrives: true,
          },
        }),
      ).resolves.toEqual({ id: 'permission', role, type: 'user' });
      expect(requests[0]?.method).toBe('POST');
      expect(requests[0]?.url.pathname).toBe('/drive/v3/files/file/permissions');
      expect(requests[0]?.url.searchParams.get('sendNotificationEmail')).toBe('true');
      expect(requests[0]?.url.searchParams.get('supportsAllDrives')).toBe('true');
      expect(JSON.parse(requests[0]!.body.toString())).toEqual({
        type: 'user',
        emailAddress: 'user@example.com',
        role,
      });
    },
  );

  it('looks up permissions across pages matching both email and role', async () => {
    const { drive, req, requests } = await fixture(({ method, url }) => {
      if (method === 'DELETE') return new Response(null, { status: 204 });
      return json(
        url.searchParams.has('pageToken')
          ? { permissions: [{ id: 'match', role: 'reader', emailAddress: 'user@example.com' }] }
          : {
              permissions: [
                { id: 'wrong-role', role: 'writer', emailAddress: 'user@example.com' },
                { id: 'wrong-email', role: 'reader', emailAddress: 'other@example.com' },
              ],
              nextPageToken: 'next',
            },
      );
    });
    await expect(
      drive.deletePermission({
        req,
        input: {
          fileId: 'file',
          email: 'user@example.com',
          role: 'reader',
          includeSharedDrives: true,
        },
      }),
    ).resolves.toEqual({ removed: true, message: 'Permission removed' });
    expect(requests).toHaveLength(3);
    expect(requests[1]?.url.searchParams.get('pageToken')).toBe('next');
    expect(requests[2]?.url.pathname).toBe('/drive/v3/files/file/permissions/match');
    expect(requests[2]?.method).toBe('DELETE');
    expect(requests.every(({ url }) => url.searchParams.get('supportsAllDrives') === 'true')).toBe(
      true,
    );
  });

  it('returns an explicit no-op when the permission is absent', async () => {
    const { drive, req, requests } = await fixture(() => json({ permissions: [] }));
    await expect(
      drive.deletePermission({
        req,
        input: { fileId: 'file', email: 'user@example.com', role: 'reader' },
      }),
    ).resolves.toEqual({ removed: false, message: 'Permission not found' });
    expect(requests).toHaveLength(1);
  });

  it('rejects malformed permissions and repeated permission page tokens', async () => {
    const missing = await fixture(() =>
      json({ permissions: [{ role: 'reader', emailAddress: 'user@example.com' }] }),
    );
    await expect(
      missing.drive.deletePermission({
        req: missing.req,
        input: { fileId: 'file', email: 'user@example.com', role: 'reader' },
      }),
    ).rejects.toThrow('missing its ID');
    expect(missing.requests).toHaveLength(1);
    const repeated = await fixture(() => json({ nextPageToken: 'same' }));
    await expect(
      repeated.drive.deletePermission({
        req: repeated.req,
        input: { fileId: 'file', email: 'user@example.com', role: 'reader' },
      }),
    ).rejects.toThrow('repeated a page token');
  });

  it.each(['folder', 'file'])(
    'publishes a %s and returns its native download result',
    async (type) => {
      const { drive, req, requests, create } = await fixture(({ url, method }) => {
        if (method === 'POST') return json({ id: 'public', type: 'anyone', role: 'reader' });
        if (url.searchParams.get('alt') === 'media') return new Response('public content');
        return json({
          ...metadata,
          mimeType: type === 'folder' ? folderMimeType : 'text/plain',
          webViewLink: 'https://drive.google.com/view/file',
        });
      });
      const result = await drive.setPublicAccess({
        req,
        input: { fileId: 'file', includeSharedDrives: true },
      });
      expect(result.permission).toEqual({ id: 'public', type: 'anyone', role: 'reader' });
      expect(result.webViewLink).toBe('https://drive.google.com/view/file');
      expect(JSON.parse(requests[0]!.body.toString())).toEqual({
        type: 'anyone',
        role: 'reader',
        allowFileDiscovery: false,
      });
      if (type === 'folder') {
        expect(result.download).toBeNull();
        expect(create).not.toHaveBeenCalled();
      } else {
        expect(result.download).toMatchObject({ id: 'saved', name: 'report.txt', size: 14 });
        expect(create.mock.calls[0]![0].file.data).toEqual(Buffer.from('public content'));
      }
      expect(
        requests.every(({ url }) => url.searchParams.get('supportsAllDrives') === 'true'),
      ).toBe(true);
    },
  );

  it('stops publishing when the permission grant is denied', async () => {
    const { drive, req, requests, create } = await fixture(() =>
      json({ error: { message: 'Sharing denied' } }, 403),
    );
    await expect(drive.setPublicAccess({ req, input: { fileId: 'file' } })).rejects.toThrow(
      'Sharing denied',
    );
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });
});

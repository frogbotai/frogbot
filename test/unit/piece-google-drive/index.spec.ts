import { google } from 'googleapis';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));
vi.mock(
  '@frogbotai/piece-google',
  () => import('../../../packages/pieces/piece-google/src/index.js'),
);

import { pieceConformance } from '../../../packages/frogbot/src/pieces/conformance.js';
import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import { googleOAuth } from '../../../packages/pieces/piece-google/src/index.js';
import { googleDriveAuth } from '../../../packages/pieces/piece-google-drive/src/client.js';
import {
  createGoogleDrive,
  googleDriveActions,
  googleDriveScopes,
} from '../../../packages/pieces/piece-google-drive/src/index.js';
import { auth, fixture, json, metadata, networkFixture } from './fixtures.js';

afterEach(() => vi.restoreAllMocks());

describe('native Google Drive contract', () => {
  it('exposes exactly 16 semantic actions, typed schemas, and no triggers', () => {
    const drive = createGoogleDrive({ auth });
    const definition = pieceFactoryDefinition(createGoogleDrive);
    expect(googleDriveActions).toHaveLength(16);
    expect(definition.actions.map(({ slug }) => slug)).toEqual(googleDriveActions);
    expect(pieceInstanceTools(drive)?.map(({ slug }) => slug)).toEqual(
      googleDriveActions.map((slug) => `google-drive_${slug}`),
    );
    expect(drive.triggers).toEqual({});
    for (const action of definition.actions) {
      expect(action.input).toBeDefined();
      expect(action.output).toBeDefined();
      expect(typeof action.idempotent).toBe('boolean');
      expect(typeof drive[action.slug]).toBe('function');
    }
  });

  it('extends the shared Google identity recipe and maps stored tokens', () => {
    const definition = pieceFactoryDefinition(createGoogleDrive);
    expect(definition.oauth).toMatchObject({
      ...googleOAuth,
      scopes: [...googleOAuth.scopes, ...googleDriveScopes],
    });
    expect(definition.oauth?.account).toBe(googleOAuth.account);
    expect(
      definition.oauth?.toAuth?.({ tokens: { access_token: 'access', refresh_token: 'refresh' } }),
    ).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    expect(definition.oauth?.toAuth?.({ tokens: { access_token: 'access' } })).toEqual({
      accessToken: 'access',
      refreshToken: undefined,
    });
    expect(googleDriveAuth.safeParse({ accessToken: '' }).success).toBe(false);
    expect(googleDriveAuth.safeParse({ accessToken: 'access' }).success).toBe(true);
  });

  it('resolves connection credentials and keeps refresh tokens out of the SDK', async () => {
    const { drive, req, oauth } = await fixture();
    await drive.getFile({ req, input: { fileId: 'file' } });
    expect(req.frogbot.connections.resolvePieceCredential).toHaveBeenCalled();
    expect(oauth.credentials.refresh_token).toBeUndefined();
  });

  it('passes native conformance for all actions through the real Google SDK', async () => {
    const { network } = networkFixture(({ url, method }) => {
      if (method === 'DELETE') return new Response(null, { status: 204 });
      if (url.pathname.endsWith('/export')) return new Response('pdf bytes');
      if (url.pathname.endsWith('/permissions')) {
        return json(method === 'GET' ? { permissions: [] } : { id: 'permission' });
      }
      if (url.pathname === '/drive/v3/files' && method === 'GET') return json({ files: [] });
      return json(metadata);
    });
    const setCredentials = google.auth.OAuth2.prototype.setCredentials;
    vi.spyOn(google.auth.OAuth2.prototype, 'setCredentials').mockImplementation(function (
      this: InstanceType<typeof google.auth.OAuth2>,
      credentials,
    ) {
      setCredentials.call(this, credentials);
      this.transporter.defaults.fetchImplementation = network;
    });
    const file = { fileId: 'file' };
    expect(
      await pieceConformance(createGoogleDrive, {
        factoryOptions: { auth },
        oauth: true,
        actions: [
          { slug: 'createFolder', input: { name: 'folder' }, expect: { result: metadata } },
          {
            slug: 'createFile',
            input: { name: 'file', text: 'text' },
            expect: { result: metadata },
          },
          {
            slug: 'uploadFile',
            input: { file: { fileId: 'source' } },
            expect: { error: 'requires the files collection' },
          },
          { slug: 'downloadFile', input: file, expect: { error: 'requires the files collection' } },
          { slug: 'getFile', input: file, expect: { result: metadata } },
          {
            slug: 'listFiles',
            input: { folderId: 'root' },
            expect: { result: { files: [], incompleteSearch: false } },
          },
          { slug: 'searchFiles', input: { query: 'report' }, expect: { result: [] } },
          {
            slug: 'copyFile',
            input: { ...file, name: 'copy', folderId: 'folder' },
            expect: { result: metadata },
          },
          {
            slug: 'exportPdf',
            input: { ...file, name: 'pdf', folderId: 'folder' },
            expect: { result: metadata },
          },
          {
            slug: 'createPermission',
            input: { ...file, email: 'user@example.com', role: 'reader' },
            expect: { result: { id: 'permission' } },
          },
          {
            slug: 'deletePermission',
            input: { ...file, email: 'user@example.com', role: 'reader' },
            expect: { result: { removed: false, message: 'Permission not found' } },
          },
          {
            slug: 'setPublicAccess',
            input: file,
            expect: { error: 'requires the files collection' },
          },
          {
            slug: 'moveFile',
            input: { ...file, folderId: 'folder' },
            expect: { result: metadata },
          },
          { slug: 'deleteFile', input: file, expect: { result: { deleted: true } } },
          { slug: 'trashFile', input: file, expect: { result: metadata } },
          {
            slug: 'customApiCall',
            input: { method: 'GET', path: '/files' },
            expect: {
              result: {
                status: 200,
                headers: { 'content-type': 'application/json' },
                body: { files: [] },
              },
            },
          },
        ],
      }),
    ).toBeUndefined();
  });
});

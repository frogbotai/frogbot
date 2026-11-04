import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { createAsana } from '../../../packages/pieces/piece-asana/src/index.js';
import { api, calls, filesReq, json, req, stubAsana } from './fixtures.js';

const asana = createAsana({});
const signed = 'https://asana-user-private-us-east-1.s3.amazonaws.com/assets/1/log.txt?X-Amz=1';

const hosted = {
  gid: '60',
  name: 'log.txt',
  host: 'asana',
  size: 8,
  download_url: signed,
  permanent_url: 'https://app.asana.com/app/asana/-/get_asset?asset_id=60',
  view_url: signed,
};

afterEach(() => vi.unstubAllGlobals());

describe('Asana downloadAttachment', () => {
  it('saves an Asana-hosted file into FrogBot files, with no bearer on the download', async () => {
    const { req: request, create } = filesReq();

    stubAsana((call) =>
      call.url === signed
        ? new Response('log body', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
        : json({ data: hosted }),
    );

    const result = await asana.downloadAttachment({
      input: { attachmentGid: '60' },
      req: request,
    });

    expect(calls[0]?.url).toContain(`${api}/attachments/60?opt_fields=`);
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer asana-token');
    expect(calls[1]?.url).toBe(signed);
    expect(calls[1]?.headers.get('authorization')).toBeNull();
    expect(create).toHaveBeenCalledOnce();

    const args = create.mock.calls[0][0] as unknown as {
      collection: string;
      overrideAccess: boolean;
      file: { data: Buffer; name: string; mimetype: string; size: number };
    };

    expect(args).toMatchObject({ collection: 'files', overrideAccess: false });
    expect(args.file).toMatchObject({ name: 'log.txt', mimetype: 'text/plain', size: 8 });
    expect(args.file.data.toString()).toBe('log body');
    expect(result).toEqual({
      attachment: hosted,
      file: {
        fileId: 'file-log.txt',
        name: 'log.txt',
        mimeType: 'text/plain',
        size: 8,
        url: '/api/files/file/log.txt',
      },
      link: hosted.permanent_url,
    });
  });

  it('returns the link of a file stored outside Asana, and saves nothing', async () => {
    const { req: request, create } = filesReq();
    const drive = {
      gid: '61',
      name: 'Plan',
      host: 'gdrive',
      download_url: null,
      permanent_url: null,
      view_url: 'https://docs.google.com/document/d/abc',
    };

    stubAsana(() => json({ data: drive }));

    await expect(
      asana.downloadAttachment({ input: { attachmentGid: '61' }, req: request }),
    ).resolves.toEqual({ attachment: drive, file: null, link: drive.view_url });
    expect(calls).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('throws and saves nothing when the download fails', async () => {
    const { req: request, create } = filesReq();

    stubAsana((call) =>
      call.url === signed ? new Response('expired', { status: 403 }) : json({ data: hosted }),
    );

    await expect(
      asana.downloadAttachment({ input: { attachmentGid: '60' }, req: request }),
    ).rejects.toThrow('Asana attachment download failed (403).');
    expect(create).not.toHaveBeenCalled();
  });

  it('needs a files collection before calling Asana', async () => {
    stubAsana(() => json({ data: hosted }));

    await expect(
      asana.downloadAttachment({ input: { attachmentGid: '60' }, req: req() }),
    ).rejects.toThrow('Asana requires a files collection');
    expect(calls).toEqual([]);
  });
});

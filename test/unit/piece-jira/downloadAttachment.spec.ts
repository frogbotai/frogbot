import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { createJira } from '../../../packages/pieces/piece-jira/src/index.js';
import { api, calls, filesReq, json, req, site, stubJira } from './fixtures.js';

const jira = createJira({ siteUrl: site });
const meta = { id: '20', filename: 'log.txt', mimeType: 'text/plain', size: 8 };

afterEach(() => vi.unstubAllGlobals());

describe('Jira downloadAttachment', () => {
  it('saves the content into FrogBot files with the caller req and access checks', async () => {
    const { req: request, create } = filesReq();

    stubJira((call) =>
      call.url.includes('/attachment/content/') ? new Response('log body') : json(meta),
    );

    const result = await jira.downloadAttachment({ input: { attachmentId: '20' }, req: request });

    expect(calls.map((call) => call.url)).toEqual([
      `${api}/attachment/20`,
      `${api}/attachment/content/20?redirect=false`,
    ]);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]).toMatchObject({ redirect: 'error' });
    expect(create).toHaveBeenCalledOnce();

    const args = create.mock.calls[0][0] as unknown as {
      collection: string;
      overrideAccess: boolean;
      req: unknown;
      file: { data: Buffer; name: string; mimetype: string; size: number };
    };

    expect(args).toMatchObject({ collection: 'files', overrideAccess: false, req: request });
    expect(args.file).toMatchObject({ name: 'log.txt', mimetype: 'text/plain', size: 8 });
    expect(args.file.data.toString()).toBe('log body');
    expect(result).toEqual({
      attachmentId: '20',
      fileId: 'file-log.txt',
      name: 'log.txt',
      mimeType: 'text/plain',
      size: 8,
      url: '/api/files/file/log.txt',
    });
  });

  it('saves nothing and throws when Jira redirects', async () => {
    const { req: request, create } = filesReq();

    stubJira((call) =>
      call.url.includes('/attachment/content/')
        ? new Response(null, { status: 303, headers: { location: 'https://media.test/x' } })
        : json(meta),
    );

    await expect(
      jira.downloadAttachment({ input: { attachmentId: '20' }, req: request }),
    ).rejects.toThrow('Jira request failed (303)');
    expect(create).not.toHaveBeenCalled();
  });

  it('saves nothing when the request aborts during the download', async () => {
    const controller = new AbortController();
    const { req: request, create } = filesReq();

    Object.assign(request, { signal: controller.signal });

    stubJira((call) => {
      if (!call.url.includes('/attachment/content/')) return json(meta);

      controller.abort(new Error('Stopped.'));

      return new Response('log body');
    });

    await expect(
      jira.downloadAttachment({ input: { attachmentId: '20' }, req: request }),
    ).rejects.toThrow('Stopped.');
    expect(create).not.toHaveBeenCalled();
  });

  it('needs a files collection before calling Jira', async () => {
    stubJira(() => json(meta));

    await expect(
      jira.downloadAttachment({ input: { attachmentId: '20' }, req: req() }),
    ).rejects.toThrow('Jira requires a files collection');
    expect(calls).toEqual([]);
  });
});

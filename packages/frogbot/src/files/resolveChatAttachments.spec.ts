import { convertToModelMessages, type UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrogbotRequest } from '../types/request.js';
import { resolveChatAttachments } from './resolveChatAttachments.js';

const { getFileByPath } = vi.hoisted(() => ({ getFileByPath: vi.fn() }));

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getFileByPath,
}));

function request({ findByID = vi.fn(), upload = { staticDir: '/files' } }: { findByID?: ReturnType<typeof vi.fn>; upload?: Record<string, unknown> } = {}) {
  return Object.assign(new Request('http://localhost/api/agents/support', { headers: { authorization: 'Bearer token', cookie: 'session=one' } }), {
    frogbot: {
      config: {
        files: { slug: 'assets' },
        _internal: { payloadConfig: Promise.resolve({ collections: [{ slug: 'assets', upload }], serverURL: 'http://localhost' }) },
      },
      findByID,
    },
  }) as unknown as FrogbotRequest;
}

function messages(): UIMessage[] {
  return [{ id: 'one', role: 'user', parts: [{ type: 'text', text: 'Read this' }, { type: 'file-reference', id: 'file-1', filename: 'client.txt', mediaType: 'text/client' } as never] }];
}

describe('resolveChatAttachments', () => {
  beforeEach(() => {
    getFileByPath.mockReset();
    vi.unstubAllGlobals();
  });

  it('authorizes IDs and converts mixed text and local files for the AI SDK', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 'file-1', filename: 'server.txt', mimeType: 'text/plain', url: '/api/assets/file/server.txt' });
    getFileByPath.mockResolvedValue({ data: Buffer.from('local') });
    const req = request({ findByID });
    const resolved = await resolveChatAttachments({ req, messages: messages() });
    const converted = await convertToModelMessages(resolved);

    expect(findByID).toHaveBeenCalledWith({ collection: 'assets', id: 'file-1', depth: 0, req, overrideAccess: false });
    expect(resolved[0]?.parts).toEqual([{ type: 'text', text: 'Read this' }, { type: 'file', filename: 'server.txt', mediaType: 'text/plain', url: 'data:text/plain;base64,bG9jYWw=' }]);
    expect(converted[0]).toMatchObject({ role: 'user', content: [{ type: 'text', text: 'Read this' }, { type: 'file', filename: 'server.txt', mediaType: 'text/plain', data: { type: 'url' } }] });
  });

  it.each([
    [403, 403, "Access denied for file 'file-1'"],
    [404, 404, "File 'file-1' not found"],
  ])('rejects inaccessible records', async (sourceStatus, status, message) => {
    const findByID = vi.fn().mockRejectedValue(Object.assign(new Error('no'), { status: sourceStatus }));
    await expect(resolveChatAttachments({ req: request({ findByID }), messages: messages() })).rejects.toMatchObject({ status, message });
    expect(getFileByPath).not.toHaveBeenCalled();
  });

  it('fetches private cloud files with request credentials', async () => {
    const findByID = vi.fn().mockResolvedValue({ filename: 'cloud.pdf', mimeType: 'application/pdf', url: '/api/assets/file/cloud.pdf' });
    const fetch = vi.fn().mockResolvedValue(new Response('cloud'));
    vi.stubGlobal('fetch', fetch);
    const resolved = await resolveChatAttachments({ req: request({ findByID, upload: { disableLocalStorage: true } }), messages: messages() });

    expect(fetch).toHaveBeenCalledWith(new URL('http://localhost/api/assets/file/cloud.pdf'), expect.objectContaining({ headers: expect.any(Headers) }));
    const headers = fetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(Object.fromEntries(headers)).toEqual({ authorization: 'Bearer token', cookie: 'session=one' });
    expect(resolved[0]?.parts[1]).toMatchObject({ type: 'file', mediaType: 'application/pdf', url: 'data:application/pdf;base64,Y2xvdWQ=' });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixture, json } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());

describe('Google Drive custom API transport', () => {
  it('preserves arbitrary JSON fields on file-shaped responses', async () => {
    const body = {
      id: 'file',
      name: 'report',
      mimeType: 'text/plain',
      size: 3,
      extra: { retained: true },
    };
    const { drive, req } = await fixture(() => json(body));
    await expect(
      drive.customApiCall({ req, input: { method: 'GET', path: '/files/file' } }),
    ).resolves.toMatchObject({ body });
  });
  it('sends JSON, headers, and query parameters and preserves the response envelope', async () => {
    const { drive, req, requests } = await fixture(
      () =>
        new Response('{"ok":true}', {
          status: 201,
          headers: { 'content-type': 'application/json', 'x-provider': 'drive' },
        }),
    );
    await expect(
      drive.customApiCall({
        req,
        input: {
          method: 'POST',
          path: '/files',
          query: { supportsAllDrives: true, pageSize: 25 },
          headers: { 'x-request-id': 'id' },
          body: { type: 'json', value: { name: 'New' } },
        },
      }),
    ).resolves.toEqual({
      status: 201,
      headers: { 'content-type': 'application/json', 'x-provider': 'drive' },
      body: { ok: true },
    });
    expect(requests[0]?.url.origin).toBe('https://www.googleapis.com');
    expect(requests[0]?.url.pathname).toBe('/drive/v3/files');
    expect(requests[0]?.url.searchParams.get('supportsAllDrives')).toBe('true');
    expect(requests[0]?.headers.get('x-request-id')).toBe('id');
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer drive-access');
    expect(requests[0]?.headers.get('content-type')).toBe('application/json');
    expect(requests[0]?.body.toString()).toBe('{"name":"New"}');
  });

  it.each([null, false, 0, 'text'])('preserves primitive JSON body %j', async (value) => {
    const { drive, req, requests } = await fixture(() => json({ ok: true }));
    await drive.customApiCall({
      req,
      input: { method: 'POST', path: '/files', body: { type: 'json', value } },
    });
    expect(requests[0]?.body.toString()).toBe(JSON.stringify(value));
  });

  it('sends raw content and supports text responses', async () => {
    const { drive, req, requests } = await fixture(() => new Response('raw response'));
    const result = await drive.customApiCall({
      req,
      input: {
        method: 'PATCH',
        path: 'https://www.googleapis.com/upload/drive/v3/files/file',
        headers: { 'content-type': 'text/plain' },
        body: { type: 'raw', value: 'héllo' },
        responseType: 'text',
      },
    });
    expect(result.body).toBe('raw response');
    expect(requests[0]?.body.toString()).toBe('héllo');
  });

  it('uploads multipart text and access-checked FrogBot files as actual bytes', async () => {
    const bytes = new Uint8Array([0, 255, 128]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)));
    const { drive, req, requests, findByID } = await fixture(() => json({ ok: true }));
    await drive.customApiCall({
      req,
      input: {
        method: 'POST',
        path: '/files',
        headers: { 'content-type': 'wrong/boundary' },
        body: {
          type: 'formData',
          fields: [
            { type: 'text', name: 'empty', value: '' },
            { type: 'text', name: 'name', value: 'report' },
            { type: 'file', name: 'file', file: { fileId: 'source', name: 'binary.dat' } },
          ],
        },
      },
    });
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ overrideAccess: false, req }));
    expect(requests[0]?.body.includes(Buffer.from(bytes))).toBe(true);
    expect(requests[0]?.body.toString()).toContain('name="empty"');
    expect(requests[0]?.body.toString()).toContain('filename="binary.dat"');
    expect(requests[0]?.headers.get('content-type')).not.toBe('wrong/boundary');
  });

  it('stores binary responses with MIME type and filename', async () => {
    const bytes = new Uint8Array([0, 255, 42]);
    const { drive, req, create } = await fixture(
      () => new Response(bytes, { headers: { 'content-type': 'application/pdf' } }),
    );
    const result = await drive.customApiCall({
      req,
      input: {
        method: 'GET',
        path: '/files/file?alt=media',
        responseType: 'binary',
        fileName: 'export.pdf',
      },
    });
    expect(result.body).toMatchObject({
      id: 'saved',
      name: 'export.pdf',
      mimeType: 'application/pdf',
      size: 3,
    });
    expect(create.mock.calls[0]![0].file.data).toEqual(Buffer.from(bytes));
  });

  it.each([
    'files',
    '/drive/v3/files',
    'https://www.googleapis.com/drive/v3/files',
    'https://drive.googleapis.com/drive/v3/files',
    '/upload/drive/v3/files',
  ])('accepts provider-bound URL %s', async (path) => {
    const { drive, req } = await fixture(() => json({}));
    await expect(
      drive.customApiCall({ req, input: { method: 'GET', path } }),
    ).resolves.toMatchObject({ status: 200 });
  });

  it.each([
    'https://attacker.test/drive/v3/files',
    '//attacker.test/drive/v3/files',
    'http://www.googleapis.com/drive/v3/files',
    'https://www.googleapis.com.attacker.test/drive/v3/files',
    'https://www.googleapis.com@attacker.test/drive/v3/files',
    'https://user:password@www.googleapis.com/drive/v3/files',
    'https://www.googleapis.com:444/drive/v3/files',
    'https://www.googleapis.com/gmail/v1/users/me',
    'https://www.googleapis.com/drive/v30/files',
    'https://www.googleapis.com/drive/v3/../../gmail/v1',
    'https://www.googleapis.com/drive/v3/%2e%2e/%2e%2e/gmail/v1',
    '/../../oauth2/v3/userinfo',
    '\\attacker.test/drive/v3/files',
    ' https://www.googleapis.com/drive/v3/files',
    '/files#fragment',
  ])('rejects unsafe URL %s before credentials leave the process', async (path) => {
    const { drive, req, requests } = await fixture();
    await expect(drive.customApiCall({ req, input: { method: 'GET', path } })).rejects.toThrow(
      'Google Drive API URL',
    );
    expect(requests).toEqual([]);
  });

  it.each(['Authorization', 'COOKIE', 'Host', 'Proxy-Authorization'])(
    'rejects reserved header %s',
    async (name) => {
      const { drive, req, requests } = await fixture();
      await expect(
        drive.customApiCall({
          req,
          input: {
            method: 'GET',
            path: '/files',
            headers: { [name]: 'override' },
          },
        }),
      ).rejects.toThrow('reserved');
      expect(requests).toEqual([]);
    },
  );

  it.each([301, 302, 303, 307, 308])(
    'denies HTTP %s redirects even with failsafe',
    async (status) => {
      const { drive, req, requests } = await fixture(
        () =>
          new Response(null, { status, headers: { location: 'https://attacker.test/capture' } }),
      );
      await expect(
        drive.customApiCall({ req, input: { method: 'GET', path: '/files', failsafe: true } }),
      ).rejects.toThrow();
      expect(requests).toHaveLength(1);
      expect(requests[0]?.redirect).toBe('error');
    },
  );

  it('only suppresses HTTP errors when failsafe is requested', async () => {
    const { drive, req, requests } = await fixture(() =>
      json({ error: { message: 'Denied' } }, 403),
    );
    await expect(
      drive.customApiCall({ req, input: { method: 'GET', path: '/files' } }),
    ).rejects.toThrow('Denied');
    await expect(
      drive.customApiCall({ req, input: { method: 'GET', path: '/files', failsafe: true } }),
    ).resolves.toMatchObject({ status: 403, body: { error: { message: 'Denied' } } });
    expect(requests).toHaveLength(2);
    const failing = await fixture(() => {
      throw new Error('Connection refused');
    });
    await expect(
      failing.drive.customApiCall({
        req: failing.req,
        input: { method: 'GET', path: '/files', failsafe: true },
      }),
    ).rejects.toThrow('Connection refused');
  });

  it('cancels an in-flight SDK request and does not hide cancellation with failsafe', async () => {
    const { drive, req, requests, controller } = await fixture(
      ({ signal }) =>
        new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const result = drive.customApiCall({
      req,
      input: { method: 'GET', path: '/files', failsafe: true },
    });
    const rejected = result.catch((error: unknown) => error);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    controller.abort(new Error('User cancelled'));
    expect(await rejected).toEqual(expect.objectContaining({ message: 'User cancelled' }));
    expect(requests[0]?.signal?.aborted).toBe(true);
  });

  it('times out an in-flight SDK request', async () => {
    const { drive, req } = await fixture(
      ({ signal }) =>
        new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    await expect(
      drive.customApiCall({
        req,
        input: { method: 'GET', path: '/files', timeoutSeconds: 0.01, failsafe: true },
      }),
    ).rejects.toThrow(/timeout/i);
  });

  it('cancels file loading within the custom call timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), {
              once: true,
            });
          }),
      ),
    );
    const { drive, req, requests } = await fixture();
    await expect(
      drive.customApiCall({
        req,
        input: {
          method: 'POST',
          path: '/files',
          timeoutSeconds: 0.01,
          body: {
            type: 'formData',
            fields: [{ type: 'file', name: 'file', file: { fileId: 'source' } }],
          },
        },
      }),
    ).rejects.toThrow(/timeout/i);
    expect(requests).toEqual([]);
  });

  it.each(['HEAD', 'OPTIONS', 'PUT', 'DELETE'] as const)('supports %s', async (method) => {
    const { drive, req, requests } = await fixture(() => new Response(null, { status: 204 }));
    await expect(
      drive.customApiCall({ req, input: { method, path: '/files' } }),
    ).resolves.toMatchObject({ status: 204 });
    expect(requests[0]?.method).toBe(method);
  });
});

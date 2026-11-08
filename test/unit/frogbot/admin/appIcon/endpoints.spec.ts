import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appIconEndpoints } from '../../../../../packages/frogbot/src/admin/appIcon/endpoints.js';
import type { FrogBotRequest } from '../../../../../packages/frogbot/src/types/request.js';

const [iconEndpoint, manifestEndpoint] = appIconEndpoints();

function makeReq(meta: Record<string, unknown> = {}, size?: string) {
  const error = vi.fn();
  const req = {
    payload: {
      config: { admin: { meta }, routes: { admin: '/admin', api: '/api' } },
      logger: { error },
    },
    routeParams: size === undefined ? {} : { size },
  } as unknown as FrogBotRequest;

  return { error, req };
}

async function pngSize(response: Response) {
  const bytes = Buffer.from(await response.arrayBuffer());

  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');

  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function firstPixel(png: Buffer) {
  expect(png[24]).toBe(8);
  expect(png[25]).toBe(6);

  const idat: Buffer[] = [];

  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);

    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      idat.push(png.subarray(offset + 8, offset + 8 + length));
    }

    offset += 12 + length;
  }

  return [...zlib.inflateSync(Buffer.concat(idat)).subarray(1, 5)];
}

describe('app icon endpoints', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'frogbot-app-icon-'));
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(cwd, { force: true, recursive: true });
  });

  it('registers public GET endpoints under /frogbot', () => {
    expect(appIconEndpoints().map(({ method, path }) => `${method} ${path}`)).toEqual([
      'get /frogbot/app-icon/:size',
      'get /frogbot/app-manifest',
    ]);
  });

  it.each([32, 180, 192, 512])('serves the FrogBot frog at %i px', async (size) => {
    const { req } = makeReq({}, String(size));

    const response = await iconEndpoint.handler(req);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
    await expect(pngSize(response)).resolves.toEqual({ width: size, height: size });
  });

  it.each(['64', '032', 'large'])('returns 404 for size %s', async (size) => {
    const { req } = makeReq({}, size);

    const response = await iconEndpoint.handler(req);

    expect(response.status).toBe(404);
  });

  it.each([
    [180, [255, 255, 255, 255]],
    [192, [0, 0, 0, 0]],
  ])('serves the %i px frog with corner pixel %j', async (size, pixel) => {
    const { req } = makeReq({}, String(size));

    const response = await iconEndpoint.handler(req);

    expect(firstPixel(Buffer.from(await response.arrayBuffer()))).toEqual(pixel);
  });

  it.each(['32', '180', '192', '512'])(
    'serves admin.meta.appIcon from public/ unchanged at %s px',
    async (size) => {
      const icon = Buffer.from('not decoded, only passed through');

      await fs.mkdir(path.join(cwd, 'public'));
      await fs.writeFile(path.join(cwd, 'public', 'acme.png'), icon);

      const { error, req } = makeReq({ appIcon: '/acme.png' }, size);

      const response = await iconEndpoint.handler(req);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(icon);
      expect(error).not.toHaveBeenCalled();
    },
  );

  it('returns 500 and logs when admin.meta.appIcon is missing from public/', async () => {
    const { error, req } = makeReq({ appIcon: '/acme.png' }, '192');

    const response = await iconEndpoint.handler(req);

    expect(response.status).toBe(500);
    expect(error).toHaveBeenCalledWith('[frogbot] admin.meta.appIcon: public/acme.png not found');
  });

  it('serves the manifest named after admin.meta.applicationName', async () => {
    const { req } = makeReq({ applicationName: 'Acme' });

    const response = await manifestEndpoint.handler(req);

    expect(response.headers.get('content-type')).toBe('application/manifest+json');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
    await expect(response.json()).resolves.toEqual({
      name: 'Acme',
      short_name: 'Acme',
      start_url: '/admin',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#ffffff',
      icons: [
        { src: '/api/frogbot/app-icon/192', sizes: '192x192', type: 'image/png' },
        { src: '/api/frogbot/app-icon/512', sizes: '512x512', type: 'image/png' },
      ],
    });
  });

  it('names the manifest FrogBot without admin.meta.applicationName', async () => {
    const { req } = makeReq();

    const response = await manifestEndpoint.handler(req);

    await expect(response.json()).resolves.toMatchObject({
      name: 'FrogBot',
      short_name: 'FrogBot',
    });
  });
});

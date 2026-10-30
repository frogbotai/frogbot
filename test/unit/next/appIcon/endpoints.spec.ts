import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import type { PayloadRequest } from 'payload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appIconEndpoints } from '../../../../packages/next/src/appIcon/endpoints.js';
import { FROGBOT_APP_ICON_BASE64 } from '../../../../packages/next/src/appIcon/frogbotAppIcon.js';

const [iconEndpoint, manifestEndpoint] = appIconEndpoints();

function makeReq(meta: Record<string, unknown> = {}, size?: string) {
  const error = vi.fn();
  const req = {
    payload: {
      config: { admin: { meta }, routes: { admin: '/admin', api: '/api' } },
      logger: { error },
    },
    routeParams: size === undefined ? {} : { size },
  } as unknown as PayloadRequest;

  return { error, req };
}

async function pngSize(response: Response) {
  const bytes = Buffer.from(await response.arrayBuffer());

  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');

  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function pngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);

  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(zlib.crc32(body));

  return Buffer.concat([length, body, crc]);
}

function transparentPNG() {
  const header = Buffer.alloc(13);

  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header.set([8, 6, 0, 0, 0], 8);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(Buffer.alloc(2 * (1 + 2 * 4)))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
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

describe('@frogbotai/next app-icon endpoints', () => {
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

  it.each([32, 180, 192, 512])('draws the FrogBot frog at %i px', async (size) => {
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

  it('draws admin.meta.appIcon from public/', async () => {
    const frog = Buffer.from(FROGBOT_APP_ICON_BASE64, 'base64');

    await fs.mkdir(path.join(cwd, 'public'));
    await fs.writeFile(path.join(cwd, 'public', 'acme.png'), frog);

    const { error, req } = makeReq({ appIcon: '/acme.png' }, '192');

    const response = await iconEndpoint.handler(req);

    expect(response.status).toBe(200);
    await expect(pngSize(response)).resolves.toEqual({ width: 192, height: 192 });
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    [180, [255, 255, 255, 255]],
    [192, [0, 0, 0, 0]],
  ])('draws a transparent appIcon at %i px with corner pixel %j', async (size, pixel) => {
    await fs.mkdir(path.join(cwd, 'public'));
    await fs.writeFile(path.join(cwd, 'public', 'clear.png'), transparentPNG());

    const { req } = makeReq({ appIcon: '/clear.png' }, String(size));

    const response = await iconEndpoint.handler(req);

    expect(firstPixel(Buffer.from(await response.arrayBuffer()))).toEqual(pixel);
  });

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

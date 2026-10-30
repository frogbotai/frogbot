import fs from 'node:fs/promises';
import path from 'node:path';

import type { RootAdminMetaConfig } from 'frogbot';
import { ImageResponse } from 'next/og.js';
import type { Endpoint, PayloadHandler, PayloadRequest } from 'payload';

import { FROGBOT_APP_ICON_BASE64 } from './frogbotAppIcon.js';
import { APP_ICON_SIZES, type AppIconSize, appIconURL } from './urls.js';

const CACHE_CONTROL = 'public, max-age=86400';

const MANIFEST_ICON_SIZES: AppIconSize[] = [192, 512];

async function readAppIcon(req: PayloadRequest): Promise<string | undefined> {
  const { appIcon } = req.payload.config.admin.meta as RootAdminMetaConfig;

  if (appIcon === undefined) return FROGBOT_APP_ICON_BASE64;

  try {
    return (await fs.readFile(path.join(process.cwd(), 'public', appIcon))).toString('base64');
  } catch {
    req.payload.logger.error(`[frogbot] admin.meta.appIcon: public${appIcon} not found`);

    return undefined;
  }
}

const appIconHandler: PayloadHandler = async (req) => {
  const size = APP_ICON_SIZES.find((value) => String(value) === req.routeParams?.size);

  if (size === undefined) {
    return Response.json({ error: 'Not Found' }, { status: 404 });
  }

  const source = await readAppIcon(req);

  if (!source) {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  const src = `data:image/png;base64,${source}`;

  return new ImageResponse(
    <div
      style={{
        background: size === 180 ? '#ffffff' : 'transparent',
        display: 'flex',
        height: '100%',
        width: '100%',
      }}
    >
      <img alt="" height={size} src={src} width={size} />
    </div>,
    { headers: { 'Cache-Control': CACHE_CONTROL }, height: size, width: size },
  );
};

const appManifestHandler: PayloadHandler = (req) => {
  const { admin, routes } = req.payload.config;
  const name = admin.meta.applicationName ?? 'FrogBot';

  const manifest = {
    name,
    short_name: name,
    start_url: routes.admin,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: MANIFEST_ICON_SIZES.map((size) => ({
      src: appIconURL(routes.api, size),
      sizes: `${size}x${size}`,
      type: 'image/png',
    })),
  };

  return new Response(JSON.stringify(manifest), {
    headers: { 'Cache-Control': CACHE_CONTROL, 'Content-Type': 'application/manifest+json' },
  });
};

export const appIconEndpoints = (): Endpoint[] => [
  { handler: appIconHandler, method: 'get', path: '/frogbot/app-icon/:size' },
  { handler: appManifestHandler, method: 'get', path: '/frogbot/app-manifest' },
];

import fs from 'node:fs/promises';
import path from 'node:path';

import type { Endpoint, Handler } from '../../endpoints/types.js';
import { toPayloadRequest } from '../../seams/request.js';
import type { PayloadRequest } from '../../types/payload.js';
import type { RootAdminMetaConfig } from '../types.js';
import { FROGBOT_APP_ICONS } from './frogbotAppIcon.js';
import { APP_ICON_SIZES, type AppIconSize, appIconURL } from './urls.js';

const CACHE_CONTROL = 'public, max-age=86400';

const MANIFEST_ICON_SIZES: AppIconSize[] = [192, 512];

async function readAppIcon(req: PayloadRequest, size: AppIconSize): Promise<Buffer | undefined> {
  const { appIcon } = req.payload.config.admin.meta as RootAdminMetaConfig;

  if (appIcon === undefined) return Buffer.from(FROGBOT_APP_ICONS[size], 'base64');

  try {
    return await fs.readFile(path.join(process.cwd(), 'public', appIcon));
  } catch {
    req.payload.logger.error(`[frogbot] admin.meta.appIcon: public${appIcon} not found`);

    return undefined;
  }
}

const appIconHandler: Handler = async (req) => {
  const size = APP_ICON_SIZES.find((value) => String(value) === req.routeParams?.size);

  if (size === undefined) {
    return Response.json({ error: 'Not Found' }, { status: 404 });
  }

  const icon = await readAppIcon(toPayloadRequest(req), size);

  if (!icon) {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  return new Response(new Uint8Array(icon), {
    headers: { 'Cache-Control': CACHE_CONTROL, 'Content-Type': 'image/png' },
  });
};

const appManifestHandler: Handler = (req) => {
  const { admin, routes } = toPayloadRequest(req).payload.config;
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

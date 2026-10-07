import { redirectsPlugin as payloadRedirectsPlugin } from '@payloadcms/plugin-redirects';
import type { RedirectsPluginConfig } from '@payloadcms/plugin-redirects/types';
import type { Plugin } from 'frogbot';
import { wrapPayloadPlugin } from 'frogbot/internal';

export type RedirectsPluginOptions = RedirectsPluginConfig;

export function redirectsPlugin(options: RedirectsPluginOptions): Plugin {
  return wrapPayloadPlugin(payloadRedirectsPlugin(options));
}

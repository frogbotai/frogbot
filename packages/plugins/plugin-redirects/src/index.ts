import { redirectsPlugin as payloadRedirectsPlugin } from '@payloadcms/plugin-redirects';
import type { RedirectsPluginConfig } from '@payloadcms/plugin-redirects/types';
import type { Plugin } from 'frogbot';

export type RedirectsPluginOptions = RedirectsPluginConfig;

export function redirectsPlugin(options: RedirectsPluginOptions): Plugin {
  return (config) => payloadRedirectsPlugin(options)(config as never) as unknown as typeof config;
}

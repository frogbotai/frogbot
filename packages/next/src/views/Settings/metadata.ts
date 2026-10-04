import { getNextRequestI18n } from '@payloadcms/next/utilities';
import type { I18n } from '@payloadcms/translations';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import { headers as getHeaders } from 'next/headers';
import type { SanitizedConfig } from 'payload';
import { createLocalReq, executeAuthStrategies, getPayload } from 'payload';

import type { SettingsEntry } from './resolveSection.js';
import { getSettingsRoutePath, resolveSettingsSection } from './resolveSection.js';

export async function getSettingsTitle({
  config,
  segments,
}: {
  config: SanitizedConfig;
  segments: readonly string[];
}): Promise<string | undefined> {
  if (segments[0] !== 'settings') return undefined;

  const views = config.admin.components?.views as
    Record<string, { Component?: unknown }> | undefined;

  if (views?.settings?.Component !== '@frogbotai/next/views#SettingsView') return undefined;

  const headers = await getHeaders();
  const payload = await getPayload({ config, cron: true });
  const i18n = await getNextRequestI18n({ config });
  const { user } = await executeAuthStrategies({ canSetHeaders: false, headers, payload });

  const req = attachRegisteredFrogBot(
    await createLocalReq(
      { req: { headers, host: headers.get('host') ?? undefined, i18n: i18n as I18n, user } },
      payload,
    ),
  );

  const entries = (config.admin as typeof config.admin & { settings?: SettingsEntry[] }).settings;

  const { title } = await resolveSettingsSection({
    entries,
    req,
    routePath: getSettingsRoutePath(segments),
  });

  return title;
}

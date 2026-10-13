import { resolveSettingsTitle } from '@frogbotai/ui/admin/rsc';
import { getNextRequestI18n } from '@payloadcms/next/utilities';
import type { I18n } from '@payloadcms/translations';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import { headers as getHeaders } from 'next/headers';
import type { SanitizedConfig } from 'payload';
import { createLocalReq, executeAuthStrategies, getPayload } from 'payload';

export function getSettingsTitle({
  config,
  segments,
}: {
  config: SanitizedConfig;
  segments: readonly string[];
}): Promise<string | undefined> {
  return resolveSettingsTitle({
    config,
    segments,
    getRequest: async () => {
      const headers = await getHeaders();
      const payload = await getPayload({ config, cron: true });
      const i18n = await getNextRequestI18n({ config });
      const { user } = await executeAuthStrategies({ canSetHeaders: false, headers, payload });

      return attachRegisteredFrogBot(
        await createLocalReq(
          { req: { headers, host: headers.get('host') ?? undefined, i18n: i18n as I18n, user } },
          payload,
        ),
      );
    },
  });
}

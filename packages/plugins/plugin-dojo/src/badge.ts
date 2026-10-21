import type { FrogBotConfig } from 'frogbot';

const BADGE = '@frogbotai/plugin-dojo/client#DojoBadge';

type Admin = NonNullable<FrogBotConfig['admin']> & {
  dependencies?: Record<string, { path: string; type: 'component' }>;
};

/**
 * Puts the badge in the import map, with or without `DOJO=1`. Dojo generates the import map at build
 * time, when `DOJO=1` isn't set, and a provider missing from the import map renders nothing, children
 * included, so the badge must be there before `withDojoBadge` adds it at runtime.
 */
export function withDojoBadgeImport(config: FrogBotConfig): FrogBotConfig {
  const admin: Admin = { ...config.admin };

  if (admin.dependencies?.[BADGE]) return config;

  admin.dependencies = { ...admin.dependencies, [BADGE]: { path: BADGE, type: 'component' } };

  return { ...config, admin };
}

/**
 * Adds the "Made with FrogBot" badge to every admin page, after the app's own providers. Adds it
 * once, even when `dojo()` runs twice.
 */
export function withDojoBadge(config: FrogBotConfig): FrogBotConfig {
  const providers = config.admin?.components?.providers ?? [];

  if (providers.includes(BADGE)) return config;

  return {
    ...config,
    admin: {
      ...config.admin,
      components: { ...config.admin?.components, providers: [...providers, BADGE] },
    },
  };
}

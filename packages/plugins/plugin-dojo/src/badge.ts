import type { FrogBotConfig } from 'frogbot';

const BADGE = '@frogbotai/plugin-dojo/client#DojoBadge';

const SIGN_IN_BUTTONS = '@frogbotai/ui/admin/rsc#SignInButtons';

type Admin = NonNullable<FrogBotConfig['admin']> & {
  dependencies?: Record<string, { path: string; type: 'component' }>;
};

/**
 * Puts the badge and the sign-in buttons in the import map, with or without `DOJO=1`. Dojo generates
 * the import map at build time, when `DOJO=1` isn't set, and a component missing from the import map
 * renders nothing (a provider, its children too), so both must be there before `DOJO=1` adds them.
 */
export function withDojoImports(config: FrogBotConfig): FrogBotConfig {
  const admin: Admin = { ...config.admin };
  const missing = [BADGE, SIGN_IN_BUTTONS].filter((path) => !admin.dependencies?.[path]);

  if (missing.length === 0) return config;

  admin.dependencies = {
    ...admin.dependencies,
    ...Object.fromEntries(missing.map((path) => [path, { path, type: 'component' as const }])),
  };

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

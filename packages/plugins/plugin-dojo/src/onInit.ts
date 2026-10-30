import type { FrogBotConfig, OnInit } from 'frogbot';

/** Appends `warnings` to the app's `onInit`, logged once at start. */
export function withWarnings(config: FrogBotConfig, warnings: string[]): FrogBotConfig {
  if (warnings.length === 0) return config;

  const own = config.onInit === undefined ? [] : [config.onInit].flat();
  const warn: OnInit = (frogbot) => {
    for (const warning of warnings) frogbot.logger.warn(warning);
  };

  return { ...config, onInit: [...own, warn] };
}

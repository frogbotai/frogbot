import type { FrogBotSanitizedConfig } from 'frogbot';
import type { SanitizedConfig } from 'payload';

export type ConfigInput = FrogBotSanitizedConfig | Promise<FrogBotSanitizedConfig>;

export async function resolveConfig(config: ConfigInput): Promise<SanitizedConfig> {
  const resolved = await config;

  if (!resolved?._internal?.payloadConfig) {
    throw new Error('FrogBot rich text requires a config returned by buildConfig.');
  }

  return resolved._internal.payloadConfig;
}

import type { FrogBotSanitizedConfig } from 'frogbot';
import type { SanitizedConfig } from 'payload';

export type ConfigInput = FrogBotSanitizedConfig | Promise<FrogBotSanitizedConfig>;

export async function resolveConfig(config: ConfigInput): Promise<SanitizedConfig> {
  const resolved = await config;
  const payloadConfig = resolved?._internal?.payloadConfig;

  if (payloadConfig == null) {
    throw new Error('FrogBot rich text requires a config returned by buildConfig.');
  }

  return payloadConfig;
}

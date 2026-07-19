import type { FrogbotConfig } from './config.js';

export type Plugin = (
  config: FrogbotConfig,
) => FrogbotConfig | Promise<FrogbotConfig>;

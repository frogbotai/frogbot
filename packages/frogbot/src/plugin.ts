import type { FrogbotConfig } from './config/types.js';

export type Plugin = (config: FrogbotConfig) => FrogbotConfig | Promise<FrogbotConfig>;

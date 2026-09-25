import type { FrogBotConfig } from './config/types.js';

export type Plugin = (config: FrogBotConfig) => FrogBotConfig | Promise<FrogBotConfig>;

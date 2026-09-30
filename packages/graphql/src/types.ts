import type { FrogBotSanitizedConfig } from 'frogbot';

export type FrogBotConfigArg = FrogBotSanitizedConfig | Promise<FrogBotSanitizedConfig>;

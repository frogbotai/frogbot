import type { FrogbotSanitizedConfig } from 'frogbot';

export type FrogbotConfigArg = FrogbotSanitizedConfig | Promise<FrogbotSanitizedConfig>;

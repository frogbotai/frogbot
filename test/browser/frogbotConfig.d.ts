// pushSchema.ts runs inside each fixture, whose tsconfig maps @frogbot-config to its own config.
declare module '@frogbot-config' {
  import type { FrogBotSanitizedConfig } from 'frogbot';

  const config: Promise<FrogBotSanitizedConfig>;
  export default config;
}

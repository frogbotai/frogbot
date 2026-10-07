declare module '@frogbot-config' {
  import type { FrogBotSanitizedConfig } from 'frogbot';

  const config: Promise<FrogBotSanitizedConfig>;
  export default config;
}

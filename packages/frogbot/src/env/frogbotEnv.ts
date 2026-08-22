import { env } from './builders.js';

export const frogbotEnv = Object.freeze({
  databaseUrl: env.string().required(),
  frogbotSecret: env.string().required(),
  logLevel: env
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),
  nodeEnv: env.enum(['development', 'production', 'test']).default('production'),
  port: env.number().default(3000),
});

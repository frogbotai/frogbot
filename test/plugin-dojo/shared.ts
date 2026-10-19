import { testPort } from '../__helpers/shared/testPorts.js';

export const usersSlug = 'users';
export const filesSlug = 'files';
export const thumbnailSize = 'thumbnail';
export const routedAgentSlug = 'routed';
export const appModel = 'openai/gpt-5.4-mini';

export const gatewayPort = testPort(3992);
export const modelPort = testPort(3993);

export const bucket = 'frogbot-test-bucket';

export const s3ClientConfig = {
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  endpoint: 'http://localhost:4566',
  forcePathStyle: true,
  region: 'us-east-1',
};

/** What Dojo sets on a deployed app, pointed at LocalStack and the fake gateway. */
export const dojoEnv = {
  DOJO: '1',
  FROGBOT_PLATFORM_PLUGIN: '@frogbotai/plugin-dojo',
  DOJO_R2_ENDPOINT: s3ClientConfig.endpoint,
  DOJO_R2_BUCKET: bucket,
  DOJO_R2_ACCESS_KEY_ID: s3ClientConfig.credentials.accessKeyId,
  DOJO_R2_SECRET_ACCESS_KEY: s3ClientConfig.credentials.secretAccessKey,
  DOJO_AI_API_KEY: 'dojo-app-key',
  DOJO_AI_BASE_URL: `http://127.0.0.1:${gatewayPort}/v1`,
  DOJO_JOBS_SECRET: 'dojo-jobs-secret',
};

import { testPort } from '../__helpers/shared/testPorts.js';

export const usersSlug = 'users';
export const mediaSlug = 'media';
export const chatsSlug = 'chats';
export const messagesSlug = 'messages';
export const filesSlug = 'files';
export const chatAssetsSlug = 'frogbot-chat-assets';
export const agentSlug = 'support';
export const modelPort = testPort(3988);

export const bucket = 'frogbot-test-bucket';

export const s3ClientConfig = {
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  endpoint: 'http://localhost:4566',
  forcePathStyle: true,
  region: 'us-east-1',
};

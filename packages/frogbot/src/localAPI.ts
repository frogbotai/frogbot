import type { Payload } from 'payload';

import type { FrogBot } from './frogbot.js';

export type FrogBotLocalAPI = Pick<
  FrogBot,
  | 'auth'
  | 'count'
  | 'countVersions'
  | 'create'
  | 'delete'
  | 'duplicate'
  | 'find'
  | 'findByID'
  | 'findDistinct'
  | 'findVersionByID'
  | 'findVersions'
  | 'forgotPassword'
  | 'login'
  | 'resetPassword'
  | 'restoreVersion'
  | 'unlock'
  | 'update'
  | 'verifyEmail'
>;

export function createFrogBotLocalAPI(payload: Payload): FrogBotLocalAPI {
  return payload as unknown as FrogBotLocalAPI;
}

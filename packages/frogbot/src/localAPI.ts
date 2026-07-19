import type { Payload } from 'payload';

import type { Frogbot } from './frogbot.js';

export type FrogbotLocalAPI = Pick<
  Frogbot,
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

export function createFrogbotLocalAPI(payload: Payload): FrogbotLocalAPI {
  return payload as unknown as FrogbotLocalAPI;
}

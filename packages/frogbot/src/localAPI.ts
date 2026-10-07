import type { Payload } from 'payload';

import type { FrogBot } from './frogbot.js';
import { toFrogBotLocalAPI } from './seams/request.js';

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
  return toFrogBotLocalAPI(payload);
}

import type { Payload } from 'payload';

import type { FrogBot } from './frogbot.js';
import { toFrogBotLocalAPI } from './seams/request.js';
import { withFileFromPath } from './uploads/fileFromPath.js';

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
  const local = toFrogBotLocalAPI(payload);
  const create: FrogBotLocalAPI['create'] = async (args) =>
    local.create(await withFileFromPath(args));

  const update = (async (args: Parameters<FrogBotLocalAPI['update']>[0]) =>
    local.update(await withFileFromPath(args))) as FrogBotLocalAPI['update'];

  return new Proxy(local, {
    get(target, key, receiver) {
      if (key === 'create') return create;
      if (key === 'update') return update;

      return Reflect.get(target, key, receiver);
    },
  });
}

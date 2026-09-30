import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FieldAccessArgs, FieldHookArgs, FrogBotRequest, ValidateOptions } from 'frogbot';

export { nestedFieldsSlug, draftPostsSlug as postsSlug } from '../shared.js';

export const databaseDirectory = mkdtempSync(join(tmpdir(), 'frogbot-field-regressions-'));
export const databasePath = join(databaseDirectory, 'fields.db');
export const usersSlug = 'users';
export const fieldArgumentsSlug = 'field-arguments';
export const observedBlockSlug = 'observed-block';

export const countRequests: {
  context: FrogBotRequest['context'];
  req: FrogBotRequest;
  transactionID: FrogBotRequest['transactionID'];
  userID: number | string | undefined;
}[] = [];

export const hookObservations: {
  field: string;
  phase: string;
  siblingNames: string[] | undefined;
  path?: FieldHookArgs['path'];
  schemaPath?: FieldHookArgs['schemaPath'];
  indexPath?: FieldHookArgs['indexPath'];
  blockData?: FieldHookArgs['blockData'];
  globalIsNull?: boolean;
  globalIsUndefined?: boolean;
  fieldNameType?: string;
  hasFrogBot?: boolean;
}[] = [];

export const validatorObservations: {
  blockData: ValidateOptions['blockData'];
  preferences: ValidateOptions['preferences'];
  collectionSlug: string | undefined;
  minLength: number | undefined;
}[] = [];

export const accessObservations: { blockData: FieldAccessArgs['blockData'] }[] = [];

export const payloadHookObservations: boolean[] = [];

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FrogbotRequest } from 'frogbot';

export { nestedFieldsSlug, draftPostsSlug as postsSlug } from '../shared.js';

export const databaseDirectory = mkdtempSync(join(tmpdir(), 'frogbot-field-regressions-'));
export const databasePath = join(databaseDirectory, 'fields.db');
export const usersSlug = 'users';

export const countRequests: {
  context: FrogbotRequest['context'];
  req: FrogbotRequest;
  transactionID: FrogbotRequest['transactionID'];
  userID: number | string | undefined;
}[] = [];

export const hookObservations: {
  field: string;
  phase: string;
  siblingNames: string[] | undefined;
}[] = [];

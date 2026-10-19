import os from 'node:os';
import path from 'node:path';

import { testDatabaseName } from '../__helpers/shared/testPorts.js';

/** The app folder `share` would run in: its database and upload folders, outside the repo. */
export const appRoot = path.join(os.tmpdir(), testDatabaseName('frogbot-share-data'));
export const databasePath = path.join(appRoot, 'frogbot.db');

export const dealsSlug = 'deals';
export const usersSlug = 'users';
export const filesSlug = 'files';
export const scansSlug = 'scans';
export const trainingSessionsSlug = 'training-sessions';
export const reminderTaskSlug = 'send-reminder';
export const thumbnailSize = 'thumbnail';

import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { testPort } from '../__helpers/shared/testPorts.js';

export const usersSlug = 'users';
export const companiesSlug = 'companies';
export const tagsSlug = 'tags';
export const contactsSlug = 'contacts';
export const notesSlug = 'notes';
export const importsSlug = 'imports';

export const importsDir = path.join(tmpdir(), 'frogbot-plugin-import-export', randomUUID());

/** The stub model server the AI suggestion suite answers from. */
export const modelPort = testPort(3994);

export const suggestModel = 'test/mapper';

/** Companies with this name are hidden from reads without `overrideAccess`. */
export const hiddenCompanyName = 'Hidden Co';

/** Companies with this name fail validation, so creating one fails. */
export const brokenCompanyName = 'Broken Co';

export const brokenCompanyMessage = 'Broken company names are not allowed';

/** The rows the app's `hooks.before` on `notes` received, one entry per batch. */
export const notesHookCalls: Record<string, unknown>[][] = [];

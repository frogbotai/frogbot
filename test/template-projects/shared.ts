import os from 'node:os';
import path from 'node:path';

export const filesDir = path.join(os.tmpdir(), 'frogbot-template-projects-files');

export const importsDir = path.join(os.tmpdir(), 'frogbot-template-projects-imports');

export const brokenSeedPath = '/seed-broken';

export const brokenSeedError = 'sample data is broken';

export const ownerCredentials = {
  email: 'owner@frogbot.local',
  password: 'frogbot-owner',
};

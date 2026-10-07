import { buildTestConfig } from '../../__helpers/shared/buildTestConfig.js';
import { membersCollection, notesCollection, postsCollection } from './shared.js';

// Every collection the spec boots, for `frogbot-types.ts`; each test boots the ones it needs.
export default buildTestConfig({
  collections: [notesCollection(), membersCollection(), postsCollection],
});

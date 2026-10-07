import { buildTestConfig } from '../../__helpers/shared/buildTestConfig.js';
import { membersCollection, notesCollection, postsCollection } from './shared.js';

export default buildTestConfig({
  collections: [notesCollection(), membersCollection(), postsCollection],
});

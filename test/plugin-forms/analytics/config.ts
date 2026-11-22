import { formsPlugin } from '@frogbotai/plugin-forms';

import { buildTestConfig } from '../../__helpers/shared/buildTestConfig.js';
import { Leads, leadsSlug, Users } from '../shared.js';

export default buildTestConfig({
  collections: [Users, Leads],
  plugins: [formsPlugin({ collections: [leadsSlug], analytics: true })],
});

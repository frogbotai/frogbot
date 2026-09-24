import { buildTestConfig } from '../../__helpers/shared/buildTestConfig.js';

export default await buildTestConfig({
  collections: [{ slug: 'users', auth: true, fields: [] }],
  ai: { providers: { 'typesafe-ai': true } },
});

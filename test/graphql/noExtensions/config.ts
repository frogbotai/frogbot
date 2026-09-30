import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';
import { usersSlug } from '../shared.js';

export default await buildTestConfig({
  collections: [{ slug: usersSlug, auth: true, access: openAccess, fields: [] }],
});

import { allow, rolesPlugin } from '../../../packages/plugins/plugin-roles/src/index.js';
import { buildTestConfig } from '../../__helpers/shared/buildTestConfig.js';
import { usersSlug } from './shared.js';

export default buildTestConfig({
  collections: [{ slug: usersSlug, auth: true, fields: [] }],
  plugins: [
    rolesPlugin({
      roles: ['admin', 'member', 'owner'],
      defaultRole: 'member',
      rolesFieldAccess: {
        create: allow('owner'),
        update: allow('owner'),
      },
    }),
  ],
});

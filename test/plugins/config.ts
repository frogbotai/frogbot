import type { CollectionConfig, FrogbotPlugin } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { projectsSlug, usersSlug } from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const Projects: CollectionConfig = {
  slug: projectsSlug,
  access: openAccess,
  fields: [{ name: 'title', type: 'text', required: true }],
};

export const stampCreatedBy: FrogbotPlugin = (config) => ({
  ...config,
  collections: config.collections.map((c) =>
    c.slug === projectsSlug
      ? { ...c, fields: [...c.fields, { name: 'createdBy', type: 'text' as const }] }
      : c,
  ),
});

export default await buildTestConfig({
  collections: [Users, Projects],
  plugins: [stampCreatedBy],
});

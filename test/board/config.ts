import type { CollectionConfig } from 'frogbot';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { tasksSlug } from './shared.js';

const Tasks: CollectionConfig = {
  slug: tasksSlug,
  access: { create: () => true, delete: () => true, read: () => true, update: () => true },
  admin: {
    useAsTitle: 'title',
    views: [{ type: 'list' }, { type: 'board', groupBy: 'status' }],
  },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'status', type: 'select', options: ['todo', 'doing', 'done'] },
  ],
};

export default await buildTestConfig({ collections: [Tasks] });

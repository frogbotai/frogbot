import { webhookTrigger } from './webhook.js';

export const taskCreated = webhookTrigger({
  slug: 'taskCreated',
  description: 'Trigger when a task or subtask is added to an Asana project, with the full task.',
  filter: { resource_type: 'task', action: 'added' },
});

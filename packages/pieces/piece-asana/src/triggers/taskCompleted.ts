import { webhookTrigger } from './webhook.js';

export const taskCompleted = webhookTrigger({
  slug: 'taskCompleted',
  description: 'Trigger when a task in an Asana project is marked complete.',
  filter: { resource_type: 'task', action: 'changed', fields: ['completed'] },
  accept: ({ task }) => task?.completed === true,
});

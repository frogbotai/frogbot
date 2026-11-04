import { webhookTrigger } from './webhook.js';

export const taskChanged = webhookTrigger({
  slug: 'taskChanged',
  description:
    "Trigger when a field of a task in an Asana project changes, once per changed field; event.change names it. Emits the task's current state.",
  filter: { resource_type: 'task', action: 'changed' },
});

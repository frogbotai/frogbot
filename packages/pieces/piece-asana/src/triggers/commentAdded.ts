import { webhookTrigger } from './webhook.js';

export const commentAdded = webhookTrigger({
  slug: 'commentAdded',
  description:
    'Trigger when someone comments on a task in an Asana project, with the comment and its task.',
  filter: { resource_type: 'story', resource_subtype: 'comment_added', action: 'added' },
});

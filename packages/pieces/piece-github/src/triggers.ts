import { createHash, randomBytes } from 'node:crypto';

import type { PieceWebhookTrigger } from 'frogbot/pieces';
import { z } from 'zod';

import type { GithubClient } from './client.js';
import { githubObject, repositoryInput, userOutput } from './schemas.js';

const input = z.object({ repository: repositoryInput });
const output = githubObject;

type WebhookState = {
  events: string[];
  hookId: number;
  owner: string;
  repo: string;
  secret: string;
  username?: string;
};

type Delivery = z.output<typeof output>;
type Match = (delivery: Delivery, state: WebhookState) => Delivery[];

function trigger({
  slug,
  description,
  event,
  match,
  username,
}: {
  slug: string;
  description: string;
  event: string | string[];
  match?: Match;
  username?: boolean;
}): PieceWebhookTrigger<typeof input, typeof output, object, GithubClient, WebhookState> {
  return {
    slug,
    description,
    type: 'webhook',
    input,
    output,
    async onEnable({ client, input: values, webhookUrl }) {
      const secret = randomBytes(32).toString('hex');
      const events = Array.isArray(event) ? event : [event];
      const hook = await client.request(
        `/repos/${values.repository.owner}/${values.repository.repo}/hooks`,
        z.looseObject({ id: z.number().int() }),
        {
          method: 'POST',
          body: {
            name: 'web',
            active: true,
            events,
            config: {
              url: webhookUrl,
              content_type: 'json',
              insecure_ssl: '0',
              secret,
            },
          },
        },
      );
      const account = username ? await client.request('/user', userOutput) : undefined;

      return {
        events,
        hookId: hook.id,
        owner: values.repository.owner,
        repo: values.repository.repo,
        secret,
        username: account?.login,
      };
    },
    async onDisable({ client, state }) {
      await client.request(
        `/repos/${state.owner}/${state.repo}/hooks/${state.hookId}`,
        z.object({}),
        {
          method: 'DELETE',
        },
      );
    },
    async run({ client, req, state }) {
      if (!req.arrayBuffer) throw new Error('GitHub webhook raw body is unavailable.');

      const body = Buffer.from(await req.arrayBuffer());
      const signature = req.headers.get('x-hub-signature-256');

      if (!client.verify(body, signature, state.secret)) {
        throw new Error('GitHub webhook signature is invalid.');
      }

      if (!state.events.includes(req.headers.get('x-github-event') ?? '')) return [];

      const delivery = output.safeParse(req.data);
      if (!delivery.success || delivery.data.zen !== undefined) return [];

      const values = match ? match(delivery.data, state) : [delivery.data];
      const deliveryId =
        req.headers.get('x-github-delivery') ?? createHash('sha256').update(body).digest('hex');

      return values.map((value, index) => ({
        data: value,
        dedupeKey: `${deliveryId}:${index}`,
      }));
    },
  };
}

function actionIs(...actions: string[]): Match {
  return (delivery) =>
    typeof delivery.action === 'string' && actions.includes(delivery.action) ? [delivery] : [];
}

export const pullRequestActivity = trigger({
  slug: 'pullRequestActivity',
  description: 'Emit pull request activity.',
  event: 'pull_request',
});
export const starActivity = trigger({
  slug: 'starActivity',
  description: 'Emit repository star activity.',
  event: 'star',
});
export const issueActivity = trigger({
  slug: 'issueActivity',
  description: 'Emit issue activity.',
  event: 'issues',
});
export const push = trigger({
  slug: 'push',
  description: 'Emit repository pushes.',
  event: 'push',
});
export const discussionActivity = trigger({
  slug: 'discussionActivity',
  description: 'Emit discussion activity.',
  event: 'discussion',
});
export const discussionCommentActivity = trigger({
  slug: 'discussionCommentActivity',
  description: 'Emit discussion comment activity.',
  event: 'discussion_comment',
});
export const branchCreated = trigger({
  slug: 'branchCreated',
  description: 'Emit newly created branches.',
  event: 'create',
  match: (delivery) => (delivery.ref_type === 'branch' ? [delivery] : []),
});
export const collaboratorAdded = trigger({
  slug: 'collaboratorAdded',
  description: 'Emit collaborators added to a repository.',
  event: 'member',
  match: actionIs('added'),
});
export const labelCreated = trigger({
  slug: 'labelCreated',
  description: 'Emit newly created labels.',
  event: 'label',
  match: actionIs('created'),
});
export const milestoneCreated = trigger({
  slug: 'milestoneCreated',
  description: 'Emit newly created milestones.',
  event: 'milestone',
  match: actionIs('created'),
});
export const releaseCreated = trigger({
  slug: 'releaseCreated',
  description: 'Emit newly created releases.',
  event: 'release',
  match: actionIs('created'),
});
export const commitCreated = trigger({
  slug: 'commitCreated',
  description: 'Emit distinct commits pushed to branches.',
  event: 'push',
  match(delivery) {
    if (
      delivery.deleted === true ||
      typeof delivery.ref !== 'string' ||
      !delivery.ref.startsWith('refs/heads/')
    ) {
      return [];
    }

    return Array.isArray(delivery.commits)
      ? delivery.commits.flatMap((commit) => {
          const parsed = githubObject.safeParse(commit);

          return parsed.success && parsed.data.distinct === true ? [parsed.data] : [];
        })
      : [];
  },
});
export const reviewRequested = trigger({
  slug: 'reviewRequested',
  description: 'Emit requested pull request reviews.',
  event: 'pull_request',
  match: actionIs('review_requested'),
});
export const mentioned = trigger({
  slug: 'mentioned',
  description: 'Emit issue or review comments mentioning the authenticated user.',
  event: ['issue_comment', 'pull_request_review_comment'],
  username: true,
  match(delivery, state) {
    if (
      !['created', 'edited'].includes(typeof delivery.action === 'string' ? delivery.action : '')
    ) {
      return [];
    }

    const comment = z.looseObject({ body: z.string() }).safeParse(delivery.comment);
    if (!comment.success || !state.username) return [];

    const escaped = state.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^A-Za-z0-9-])@${escaped}(?![A-Za-z0-9-])`, 'i');

    return pattern.test(comment.data.body) ? [delivery] : [];
  },
});

export const githubTriggerDefinitions = [
  pullRequestActivity,
  starActivity,
  issueActivity,
  push,
  discussionActivity,
  discussionCommentActivity,
  branchCreated,
  collaboratorAdded,
  labelCreated,
  milestoneCreated,
  releaseCreated,
  commitCreated,
  reviewRequested,
  mentioned,
];

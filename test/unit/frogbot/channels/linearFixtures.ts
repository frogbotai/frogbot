import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { text } from 'node:stream/consumers';

export const LINEAR_API_ORIGIN = 'https://api.linear.app';
export const LINEAR_APP_USER_ID = 'app-user-id';
export const LINEAR_ORGANIZATION_ID = 'organization-id';

export type LinearUser = { id: string; name: string; email: string };

export type LinearActivityInput = {
  agentSessionId: string;
  content: { type: string; body?: string };
  signal?: string;
  signalMetadata?: { options?: Array<{ label: string; value: string }> };
  ephemeral?: boolean;
};

export type LinearActivity = { id: string; input: LinearActivityInput };

type SilentLogger = Record<'debug' | 'error' | 'info' | 'warn', () => void> & {
  child: () => SilentLogger;
};

export const silentLinearLogger: SilentLogger = {
  child: () => silentLinearLogger,
  debug() {},
  error() {},
  info() {},
  warn() {},
};

type GraphQLRequest = { query: string; variables?: Record<string, unknown> };

const timestamp = '2026-09-25T12:00:00.000Z';

export async function startLinearApi({ users }: { users: LinearUser[] }) {
  const activities: LinearActivity[] = [];
  const operations: string[] = [];
  const unexpected: string[] = [];
  const people = new Map(users.map((user) => [user.id, user]));
  const failures = { activity: 0 };

  const resolve = ({ query, variables = {} }: GraphQLRequest) => {
    const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? 'anonymous';

    operations.push(operation);

    if (operation === 'LinearAdapterViewerOrganization') {
      return {
        viewer: {
          id: LINEAR_APP_USER_ID,
          displayName: 'FrogBot',
          organization: { id: LINEAR_ORGANIZATION_ID },
        },
      };
    }

    if (operation === 'user') {
      const user = people.get(String(variables.id));

      if (!user) throw new Error(`Unknown Linear user ${String(variables.id)}`);

      return {
        user: { ...user, displayName: user.name, active: true, createdAt: timestamp },
      };
    }

    if (operation === 'createAgentActivity') {
      if (failures.activity > 0) {
        failures.activity--;

        return { agentActivityCreate: { success: false, lastSyncId: 0, agentActivity: null } };
      }

      const activity = {
        id: `activity-${activities.length + 1}`,
        input: variables.input as LinearActivityInput,
      };

      activities.push(activity);

      return {
        agentActivityCreate: { success: true, lastSyncId: 1, agentActivity: { id: activity.id } },
      };
    }

    if (operation === 'agentActivity') {
      const activity = activities.find(({ id }) => id === variables.id)!;

      return {
        agentActivity: {
          id: activity.id,
          agentSession: { id: activity.input.agentSessionId },
          sourceComment: { id: `comment-${activity.id}` },
          content: { __typename: 'AgentActivityResponseContent', ...activity.input.content },
          ephemeral: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      };
    }

    if (operation === 'comment') {
      const id = String(variables.id);
      const activity = activities.find((candidate) => `comment-${candidate.id}` === id);

      return {
        comment: {
          id,
          body: activity?.input.content.body ?? '',
          botActor: { id: LINEAR_APP_USER_ID, name: 'FrogBot', userDisplayName: 'FrogBot' },
          reactions: [],
          createdAt: timestamp,
          updatedAt: timestamp,
          url: `https://linear.app/frogbot/comment/${id}`,
        },
      };
    }

    unexpected.push(operation);

    throw new Error(`Unexpected Linear operation ${operation}`);
  };

  const server = createServer(async (req, res) => {
    const request = JSON.parse(await text(req)) as GraphQLRequest;

    res.writeHead(200, { 'content-type': 'application/json' });

    try {
      res.end(JSON.stringify({ data: resolve(request) }));
    } catch (error) {
      res.end(JSON.stringify({ data: null, errors: [{ message: (error as Error).message }] }));
    }
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));

  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url,
    graphqlUrl: `${url}/graphql`,
    activities,
    operations,
    unexpected,
    failures,
    sessionActivities: (session: string) =>
      activities.filter(({ input }) => input.agentSessionId === session),
    reset() {
      activities.length = 0;
      operations.length = 0;
      unexpected.length = 0;
      failures.activity = 0;
    },
    close: () =>
      new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done()))),
  };
}

export type LinearApi = Awaited<ReturnType<typeof startLinearApi>>;

export function redirectLinearFetch({
  apiUrl,
  fetch: nativeFetch,
}: {
  apiUrl: string;
  fetch: typeof fetch;
}): typeof fetch {
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());

    if (url.origin !== LINEAR_API_ORIGIN) return nativeFetch(input, init);

    const target = new URL(`${url.pathname}${url.search}`, apiUrl);

    return nativeFetch(input instanceof Request ? new Request(target, input) : target, init);
  };
}

export function signLinearDelivery({ body, secret }: { body: string; secret: string }) {
  return {
    'content-type': 'application/json',
    'linear-signature': createHmac('sha256', secret).update(body).digest('hex'),
  };
}

export function linearRequest({
  payload,
  secret,
  url = 'http://localhost/api/webhooks/linear',
}: {
  payload: object;
  secret: string;
  url?: string;
}): Request {
  const body = JSON.stringify(payload);

  return new Request(url, { method: 'POST', body, headers: signLinearDelivery({ body, secret }) });
}

function linearActor(user: LinearUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    url: `https://linear.app/frogbot/profiles/${user.name.toLowerCase()}`,
  };
}

export function sessionCreated({
  body = 'Help with this issue',
  issue = 'issue-1',
  session,
  user,
}: {
  body?: string;
  issue?: string;
  session: string;
  user: LinearUser;
}) {
  return {
    type: 'AgentSessionEvent',
    action: 'created',
    webhookTimestamp: Date.now(),
    organizationId: LINEAR_ORGANIZATION_ID,
    createdAt: timestamp,
    promptContext: body,
    agentSession: {
      id: session,
      issueId: issue,
      appUserId: LINEAR_APP_USER_ID,
      creator: linearActor(user),
      comment: { id: `comment-${session}`, body },
    },
  };
}

export function sessionPrompted({
  body,
  id,
  issue = 'issue-1',
  sentAt = new Date(),
  session,
  signal,
  user,
}: {
  body: string;
  id: string;
  issue?: string;
  sentAt?: Date;
  session: string;
  signal?: string;
  user: LinearUser;
}) {
  return {
    type: 'AgentSessionEvent',
    action: 'prompted',
    webhookTimestamp: Date.now(),
    organizationId: LINEAR_ORGANIZATION_ID,
    createdAt: timestamp,
    agentSession: { id: session, issueId: issue, appUserId: LINEAR_APP_USER_ID },
    agentActivity: {
      id,
      content: { type: 'prompt', body },
      ...(signal ? { signal } : {}),
      user: linearActor(user),
      createdAt: sentAt.toISOString(),
    },
  };
}

export function commentCreated({
  body,
  id,
  issue = 'issue-1',
  user,
}: {
  body: string;
  id: string;
  issue?: string;
  user: LinearUser;
}) {
  return {
    type: 'Comment',
    action: 'create',
    webhookTimestamp: Date.now(),
    organizationId: LINEAR_ORGANIZATION_ID,
    url: `https://linear.app/frogbot/issue/${issue}#comment-${id}`,
    data: {
      id,
      body,
      issueId: issue,
      user: linearActor(user),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

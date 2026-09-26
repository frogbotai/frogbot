import { createHmac, generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { text } from 'node:stream/consumers';

export type GithubCall = {
  method: string;
  path: string;
  body: Record<string, unknown>;
  id?: string;
  status?: number;
};

export type GithubPerson = { id: number; login: string; email?: string | null; bot?: boolean };

export const githubWebhookSecret = 'github-questions-secret';
export const githubBot: GithubPerson = { id: 99, login: 'frogbot[bot]', bot: true };

export const githubApp = {
  appId: '12345',
  installationId: 67890,
  privateKey: generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString(),
};

let commentSequence = 1_000;

export function nextCommentId(): number {
  commentSequence += 1;

  return commentSequence;
}

export function githubTime(date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

type Repository = { owner?: string; repo?: string };

function repository({ owner = 'frogbotai', repo = 'frogbot' }: Repository) {
  return { name: repo, owner: { login: owner, id: 1, type: 'Organization' } };
}

function author(person: GithubPerson) {
  return { id: person.id, login: person.login, type: person.bot ? 'Bot' : 'User' };
}

function signed({
  body,
  event,
  id,
}: {
  body: Record<string, unknown>;
  event: string;
  id: number;
}): Request {
  const raw = JSON.stringify(body);
  const signature = createHmac('sha256', githubWebhookSecret).update(raw).digest('hex');

  return new Request('http://localhost/api/webhooks/github', {
    method: 'POST',
    body: raw,
    headers: {
      'content-type': 'application/json',
      'x-github-event': event,
      'x-github-delivery': `delivery-${event}-${id}`,
      'x-hub-signature-256': `sha256=${signature}`,
    },
  });
}

export function issueComment({
  action = 'created',
  body,
  id = nextCommentId(),
  issue = 12,
  person,
  pullRequest = false,
  ...location
}: Repository & {
  action?: 'created' | 'edited';
  body: string;
  id?: number;
  issue?: number;
  person: GithubPerson;
  pullRequest?: boolean;
}): Request {
  const at = githubTime();

  return signed({
    id,
    event: 'issue_comment',
    body: {
      action,
      comment: { id, body, user: author(person), created_at: at, updated_at: at },
      issue: {
        number: issue,
        ...(pullRequest ? { pull_request: { url: `https://api.github.com/pulls/${issue}` } } : {}),
      },
      repository: repository(location),
      sender: author(person),
      installation: { id: githubApp.installationId },
    },
  });
}

export function reviewComment({
  body,
  id = nextCommentId(),
  inReplyTo,
  person,
  pullRequest = 7,
  ...location
}: Repository & {
  body: string;
  id?: number;
  inReplyTo?: number;
  person: GithubPerson;
  pullRequest?: number;
}): Request {
  const at = githubTime();

  return signed({
    id,
    event: 'pull_request_review_comment',
    body: {
      action: 'created',
      comment: {
        id,
        body,
        user: author(person),
        created_at: at,
        updated_at: at,
        ...(inReplyTo ? { in_reply_to_id: inReplyTo } : {}),
      },
      pull_request: { number: pullRequest },
      repository: repository(location),
      sender: author(person),
      installation: { id: githubApp.installationId },
    },
  });
}

export async function startGithubApi({ people = [] }: { people?: GithubPerson[] } = {}) {
  const calls: GithubCall[] = [];
  const failures = new Map<string, { status: number; times: number }>();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const path = url.pathname;
    const method = req.method!;
    const raw = await text(req);
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const call: GithubCall = { method, path, body };

    const reply = (status: number, value: Record<string, unknown>) => {
      if (value.id !== undefined) call.id = String(value.id);

      call.status = status;

      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };

    if (path.endsWith('/access_tokens')) {
      return reply(201, {
        token: 'installation-token',
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      });
    }

    calls.push(call);

    const failure = failures.get(`${method} ${path}`);

    if (failure && failure.times > 0) {
      failure.times -= 1;

      return reply(failure.status, { message: 'GitHub is unavailable' });
    }

    const user = /^\/users\/([^/]+)$/.exec(path);

    if (method === 'GET' && user) {
      const person = people.find(({ login }) => login === decodeURIComponent(user[1]!));

      if (!person) return reply(404, { message: 'Not Found' });

      return reply(200, { id: person.id, login: person.login, email: person.email ?? null });
    }

    const created =
      method === 'POST' &&
      (/^\/repos\/[^/]+\/[^/]+\/issues\/\d+\/comments$/.test(path) ||
        /^\/repos\/[^/]+\/[^/]+\/pulls\/\d+\/comments\/\d+\/replies$/.test(path));

    if (created) {
      const at = githubTime();

      return reply(201, {
        id: nextCommentId(),
        body: body.body,
        user: author(githubBot),
        created_at: at,
        updated_at: at,
      });
    }

    const edited = /^\/repos\/[^/]+\/[^/]+\/(?:issues|pulls)\/comments\/(\d+)$/.exec(path);

    if (method === 'PATCH' && edited) {
      return reply(200, { id: Number(edited[1]), body: body.body, user: author(githubBot) });
    }

    if (method === 'DELETE' && edited) return reply(204, {});

    return reply(501, { message: `Unexpected GitHub request: ${method} ${path}` });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const comments = (predicate: (call: GithubCall) => boolean = () => true) =>
    calls.filter((call) => call.method === 'POST' && call.id !== undefined && predicate(call));

  return {
    url,
    calls,
    failures,
    fail: ({ method, path, status = 500, times = 1 }: FailureArgs) => {
      failures.set(`${method} ${path}`, { status, times });
    },
    posts: (path: string) =>
      comments(({ path: target }) => target === path).map(({ body, id }) => ({
        id: id!,
        body: String(body.body),
      })),
    edits: (id?: string) =>
      calls
        .filter(
          ({ method, path }) =>
            method === 'PATCH' && (id === undefined || path.endsWith(`/comments/${id}`)),
        )
        .map(({ body, path }) => ({ id: path.split('/').at(-1)!, body: String(body.body) })),
    unexpected: () => calls.filter(({ status }) => status === 501),
    reset: () => {
      calls.length = 0;
      failures.clear();
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

type FailureArgs = { method: string; path: string; status?: number; times?: number };

export type GithubApi = Awaited<ReturnType<typeof startGithubApi>>;

export function assertGithubTraffic({ api, blocked = [] }: { api: GithubApi; blocked?: string[] }) {
  const problems = [
    ...blocked.map((origin) => `blocked ${origin}`),
    ...api.unexpected().map(({ method, path }) => `${method} ${path}`),
  ];

  if (problems.length > 0) throw new Error(`Unexpected network traffic: ${problems.join(', ')}`);
}

export function redirectGithub({ api, fetch }: { api: GithubApi; fetch: typeof globalThis.fetch }) {
  const blocked: string[] = [];

  const redirected = ((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());

    if (url.origin === 'https://api.github.com') {
      const target = new URL(`${url.pathname}${url.search}`, api.url);

      return fetch(input instanceof Request ? new Request(target, input) : target, init);
    }

    if (url.hostname !== '127.0.0.1') {
      blocked.push(url.origin);

      throw new Error(`External network is disabled in GitHub question tests: ${url.origin}`);
    }

    return fetch(input, init);
  }) satisfies typeof globalThis.fetch;

  return { blocked, fetch: redirected };
}

export const issuePath = (issue = 12) => `/repos/frogbotai/frogbot/issues/${issue}/comments`;

export const replyPath = ({ pullRequest = 7, root }: { pullRequest?: number; root: number }) =>
  `/repos/frogbotai/frogbot/pulls/${pullRequest}/comments/${root}/replies`;

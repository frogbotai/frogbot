import type { PieceActionDefinition } from 'frogbot/pieces';
import { z } from 'zod';

import { githubApiUrl, type GithubClient, githubForbiddenHeaders } from './client.js';
import { assignees, branches, issues, labels, milestones, repositoryOptions } from './options.js';
import {
  branchOutput,
  commentOutput,
  emptyOutput,
  findBranchOutput,
  findIssueOutput,
  findUserOutput,
  gistOutput,
  githubObject,
  graphqlOutput,
  issueOutput,
  repositoryInput,
} from './schemas.js';

function action<TInput extends z.ZodType, TOutput extends z.ZodType>(
  definition: PieceActionDefinition<TInput, TOutput, object, GithubClient>,
) {
  return definition;
}

const issueNumber = z.coerce.number().int().positive();
const repository = { repository: repositoryInput };
const issueOptions = { ...repositoryOptions, issueNumber: issues };

export const createIssue = action({
  slug: 'createIssue',
  description: 'Create an issue in a GitHub repository.',
  input: z.object({
    ...repository,
    title: z.string().min(1),
    description: z.string().optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
  }),
  output: issueOutput,
  idempotent: false,
  options: { ...repositoryOptions, labels, assignees },
  run: ({ client, input }) =>
    client.request(
      `/repos/${input.repository.owner}/${input.repository.repo}/issues`,
      issueOutput,
      {
        method: 'POST',
        body: {
          title: input.title,
          body: input.description,
          labels: input.labels,
          assignees: input.assignees,
        },
      },
    ),
});

export const getIssue = action({
  slug: 'getIssue',
  description: 'Get an issue by number.',
  input: z.object({ ...repository, issueNumber }),
  output: issueOutput,
  idempotent: true,
  options: issueOptions,
  run: ({ client, input }) =>
    client.request(
      `/repos/${input.repository.owner}/${input.repository.repo}/issues/${input.issueNumber}`,
      issueOutput,
    ),
});

export const createIssueComment = action({
  slug: 'createIssueComment',
  description: 'Create a comment on an issue or pull request.',
  input: z.object({ ...repository, issueNumber, comment: z.string().min(1) }),
  output: commentOutput,
  idempotent: false,
  options: issueOptions,
  run: ({ client, input }) =>
    client.request(
      `/repos/${input.repository.owner}/${input.repository.repo}/issues/${input.issueNumber}/comments`,
      commentOutput,
      {
        method: 'POST',
        body: { body: input.comment },
      },
    ),
});

export const lockIssue = action({
  slug: 'lockIssue',
  description: 'Lock an issue or pull request conversation.',
  input: z.object({
    ...repository,
    issueNumber,
    reason: z.enum(['off-topic', 'too heated', 'resolved', 'spam']).optional(),
  }),
  output: emptyOutput,
  idempotent: true,
  options: issueOptions,
  run: ({ client, input }) =>
    client.request(
      `/repos/${input.repository.owner}/${input.repository.repo}/issues/${input.issueNumber}/lock`,
      emptyOutput,
      {
        method: 'PUT',
        body: { lock_reason: input.reason },
      },
    ),
});

export const unlockIssue = action({
  slug: 'unlockIssue',
  description: 'Unlock an issue or pull request conversation.',
  input: z.object({ ...repository, issueNumber }),
  output: emptyOutput,
  idempotent: true,
  options: issueOptions,
  run: ({ client, input }) =>
    client.request(
      `/repos/${input.repository.owner}/${input.repository.repo}/issues/${input.issueNumber}/lock`,
      emptyOutput,
      { method: 'DELETE' },
    ),
});

export const rawGraphqlQuery = action({
  slug: 'rawGraphqlQuery',
  description: 'Perform an authenticated query against the GitHub GraphQL API.',
  input: z.object({
    query: z.string().min(1),
    variables: z.record(z.string(), z.unknown()).optional(),
  }),
  output: graphqlOutput,
  idempotent: false,
  run: ({ client, input }) =>
    client.request('/graphql', graphqlOutput, { method: 'POST', body: input }),
});

export const createPullRequestReviewComment = action({
  slug: 'createPullRequestReviewComment',
  description: 'Create an inline review comment on a pull request.',
  input: z.object({
    ...repository,
    pullNumber: issueNumber,
    commitId: z.string().min(1),
    path: z.string().min(1),
    body: z.string().min(1),
    position: z.number().int().positive(),
  }),
  output: commentOutput,
  idempotent: false,
  options: repositoryOptions,
  run: ({ client, input }) =>
    client.request(
      `/repos/${input.repository.owner}/${input.repository.repo}/pulls/${input.pullNumber}/comments`,
      commentOutput,
      {
        method: 'POST',
        body: {
          commit_id: input.commitId,
          path: input.path,
          body: input.body,
          position: input.position,
        },
      },
    ),
});

export const createCommitComment = action({
  slug: 'createCommitComment',
  description: 'Create a comment on a commit.',
  input: z.object({
    ...repository,
    sha: z.string().min(1),
    body: z.string().min(1),
    path: z.string().optional(),
    position: z.number().int().optional(),
  }),
  output: commentOutput,
  idempotent: false,
  options: repositoryOptions,
  run: ({ client, input }) =>
    client.request(
      `/repos/${input.repository.owner}/${input.repository.repo}/commits/${input.sha}/comments`,
      commentOutput,
      {
        method: 'POST',
        body: { body: input.body, path: input.path, position: input.position },
      },
    ),
});

export const createDiscussionComment = action({
  slug: 'createDiscussionComment',
  description: 'Create a comment on a GitHub discussion.',
  input: z.object({ ...repository, discussionNumber: issueNumber, body: z.string().min(1) }),
  output: graphqlOutput,
  idempotent: false,
  options: repositoryOptions,
  async run({ client, input }) {
    const lookup = await client.request(
      '/graphql',
      z.object({
        data: z.object({
          repository: z.object({ discussion: z.object({ id: z.string().min(1) }).nullable() }),
        }),
      }),
      {
        method: 'POST',
        body: {
          query:
            'query DiscussionId($owner: String!, $repo: String!, $number: Int!) { repository(owner: $owner, name: $repo) { discussion(number: $number) { id } } }',
          variables: {
            owner: input.repository.owner,
            repo: input.repository.repo,
            number: input.discussionNumber,
          },
        },
      },
    );
    const discussion = lookup.data.repository.discussion;

    if (!discussion) {
      throw new Error(`GitHub discussion #${input.discussionNumber} was not found.`);
    }

    return client.request('/graphql', graphqlOutput, {
      method: 'POST',
      body: {
        query:
          'mutation AddDiscussionComment($discussionId: ID!, $body: String!) { addDiscussionComment(input: { discussionId: $discussionId, body: $body }) { comment { id body createdAt url } } }',
        variables: { discussionId: discussion.id, body: input.body },
      },
    });
  },
});

export const addIssueLabels = action({
  slug: 'addIssueLabels',
  description: 'Add labels to an issue.',
  input: z.object({ ...repository, issueNumber, labels: z.array(z.string()).min(1) }),
  output: z.array(githubObject),
  idempotent: true,
  options: { ...issueOptions, labels },
  run: ({ client, input }) =>
    client.request(
      `/repos/${input.repository.owner}/${input.repository.repo}/issues/${input.issueNumber}/labels`,
      z.array(githubObject),
      {
        method: 'POST',
        body: { labels: input.labels },
      },
    ),
});

export const createBranch = action({
  slug: 'createBranch',
  description: 'Create a branch from an existing branch.',
  input: z.object({
    ...repository,
    sourceBranch: z.string().min(1),
    newBranchName: z.string().min(1),
  }),
  output: githubObject,
  idempotent: false,
  options: { ...repositoryOptions, sourceBranch: branches },
  async run({ client, input }) {
    const source = await client.request(
      `/repos/${input.repository.owner}/${input.repository.repo}/branches/${input.sourceBranch}`,
      branchOutput,
    );

    return client.request(
      `/repos/${input.repository.owner}/${input.repository.repo}/git/refs`,
      githubObject,
      {
        method: 'POST',
        body: { ref: `refs/heads/${input.newBranchName}`, sha: source.commit.sha },
      },
    );
  },
});

export const deleteBranch = action({
  slug: 'deleteBranch',
  description: 'Delete a repository branch.',
  input: z.object({ ...repository, branch: z.string().min(1) }),
  output: emptyOutput,
  idempotent: false,
  options: { ...repositoryOptions, branch: branches },
  run: ({ client, input }) =>
    client.request(
      `/repos/${input.repository.owner}/${input.repository.repo}/git/refs/heads/${input.branch}`,
      emptyOutput,
      { method: 'DELETE' },
    ),
});

const updateIssueInput = z.object({
  ...repository,
  issueNumber,
  title: z.string().optional(),
  body: z.string().optional(),
  state: z.enum(['open', 'closed']).optional(),
  stateReason: z.enum(['completed', 'not_planned', 'reopened', 'duplicate']).optional(),
  milestone: z.coerce.number().int().optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
});

export const updateIssue = action({
  slug: 'updateIssue',
  description: 'Update an issue.',
  input: updateIssueInput,
  output: issueOutput,
  idempotent: true,
  options: { ...issueOptions, milestone: milestones, labels, assignees },
  run: ({ client, input }) =>
    client.request(
      `/repos/${input.repository.owner}/${input.repository.repo}/issues/${input.issueNumber}`,
      issueOutput,
      {
        method: 'PATCH',
        body: {
          title: input.title,
          body: input.body,
          state: input.state,
          state_reason: input.stateReason,
          milestone: input.milestone,
          labels: input.labels,
          assignees: input.assignees,
        },
      },
    ),
});

export const findBranch = action({
  slug: 'findBranch',
  description: 'Find a branch by its exact name.',
  input: z.object({ ...repository, branch: z.string().min(1) }),
  output: findBranchOutput,
  idempotent: true,
  options: repositoryOptions,
  async run({ client, input }) {
    try {
      const result = await client.request(
        `/repos/${input.repository.owner}/${input.repository.repo}/branches/${input.branch}`,
        branchOutput,
      );

      return { found: true, result };
    } catch (error) {
      if (error instanceof Error && error.message.includes('(404)')) {
        return { found: false, result: {} };
      }

      throw error;
    }
  },
});

export const findIssue = action({
  slug: 'findIssue',
  description: 'Find an issue by title.',
  input: z.object({
    ...repository,
    title: z.string().min(1),
    state: z.enum(['open', 'closed', 'all']),
  }),
  output: findIssueOutput,
  idempotent: true,
  options: repositoryOptions,
  async run({ client, input }) {
    const state = input.state === 'all' ? '' : ` state:${input.state}`;
    const result = await client.request(
      '/search/issues',
      z.looseObject({ total_count: z.number().int(), items: z.array(issueOutput) }),
      {
        query: {
          q: `repo:${input.repository.owner}/${input.repository.repo} is:issue in:title "${input.title}"${state}`,
          per_page: 1,
        },
      },
    );

    return { found: result.total_count > 0, result: result.items };
  },
});

export const findUser = action({
  slug: 'findUser',
  description: 'Find a GitHub user by login.',
  input: z.object({ username: z.string().min(1) }),
  output: findUserOutput,
  idempotent: true,
  async run({ client, input }) {
    try {
      const result = await client.request(
        `/users/${input.username}`,
        z.looseObject({ id: z.number().int(), login: z.string() }),
      );

      return { found: true, result };
    } catch (error) {
      if (error instanceof Error && error.message.includes('(404)')) {
        return { found: false, result: {} };
      }

      throw error;
    }
  },
});

export const createGist = action({
  slug: 'createGist',
  description: 'Create a GitHub gist.',
  input: z.object({
    description: z.string().optional(),
    public: z.boolean().default(true),
    filename: z.string().min(1),
    content: z.string(),
  }),
  output: gistOutput,
  idempotent: false,
  run: ({ client, input }) =>
    client.request('/gists', gistOutput, {
      method: 'POST',
      body: {
        description: input.description,
        public: input.public,
        files: { [input.filename]: { content: input.content } },
      },
    }),
});

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const customInput = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']),
  path: z
    .string()
    .min(1)
    .refine((path) => {
      try {
        githubApiUrl(path);

        return true;
      } catch {
        return false;
      }
    }, 'URL must target the GitHub API.'),
  headers: z
    .record(z.string(), z.string())
    .default({})
    .refine(
      (headers) =>
        Object.keys(headers).every((name) => !githubForbiddenHeaders.has(name.toLowerCase())),
      'Authentication and transport headers cannot be overridden.',
    ),
  query: z.record(z.string(), scalar).optional(),
  body: z.json().optional(),
});

export const customApiCall = action({
  slug: 'customApiCall',
  description: 'Make an authenticated call to the GitHub REST API. Redirects are rejected.',
  input: customInput,
  output: z.union([z.json(), emptyOutput]),
  idempotent: false,
  run: ({ client, input, req }) =>
    client.request(input.path, z.union([z.json(), emptyOutput]), {
      method: input.method,
      headers: input.headers,
      query: input.query,
      body: input.body,
      signal: req.signal,
    }),
});

export const githubActionDefinitions = [
  createIssue,
  getIssue,
  createIssueComment,
  lockIssue,
  unlockIssue,
  rawGraphqlQuery,
  createPullRequestReviewComment,
  createCommitComment,
  createDiscussionComment,
  addIssueLabels,
  createBranch,
  deleteBranch,
  updateIssue,
  findBranch,
  findIssue,
  findUser,
  createGist,
  customApiCall,
];

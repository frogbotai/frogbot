import { z } from 'zod';

import type { GithubClient } from './client.js';
import { branchOutput, githubObject, issueOutput, repositoryInput, userOutput } from './schemas.js';

type OptionArgs = { client: GithubClient; input: Record<string, unknown> };

function repository(input: Record<string, unknown>) {
  const parsed = repositoryInput.safeParse(input.repository);

  return parsed.success ? parsed.data : undefined;
}

export async function repositories({ client }: OptionArgs) {
  const values = await client.listAll('/user/repos', githubObject);

  return values.flatMap((value) => {
    const parsed = z.looseObject({ name: z.string(), owner: userOutput }).safeParse(value);

    return parsed.success
      ? [
          {
            label: `${parsed.data.owner.login}/${parsed.data.name}`,
            value: `${parsed.data.owner.login}/${parsed.data.name}`,
          },
        ]
      : [];
  });
}

export async function branches({ client, input }: OptionArgs) {
  const repo = repository(input);
  if (!repo) return [];

  return (await client.listAll(`/repos/${repo.owner}/${repo.repo}/branches`, branchOutput)).map(
    (branch) => ({
      label: branch.name,
      value: branch.name,
    }),
  );
}

export async function issues({ client, input }: OptionArgs) {
  const repo = repository(input);
  if (!repo) return [];

  return (await client.listAll(`/repos/${repo.owner}/${repo.repo}/issues`, issueOutput)).map(
    (issue) => ({
      label: `#${issue.number} - ${issue.title}`,
      value: String(issue.number),
    }),
  );
}

async function namedOptions(
  client: GithubClient,
  input: Record<string, unknown>,
  resource: string,
) {
  const repo = repository(input);
  if (!repo) return [];

  const schema = z.looseObject({ name: z.string() });

  return (await client.listAll(`/repos/${repo.owner}/${repo.repo}/${resource}`, schema)).map(
    (value) => ({
      label: value.name,
      value: value.name,
    }),
  );
}

export const labels = ({ client, input }: OptionArgs) => namedOptions(client, input, 'labels');

export async function assignees({ client, input }: OptionArgs) {
  const repo = repository(input);
  if (!repo) return [];

  return (await client.listAll(`/repos/${repo.owner}/${repo.repo}/assignees`, userOutput)).map(
    (user) => ({
      label: user.login,
      value: user.login,
    }),
  );
}

export async function milestones({ client, input }: OptionArgs) {
  const repo = repository(input);
  if (!repo) return [];

  const schema = z.looseObject({ number: z.number().int(), title: z.string() });

  return (await client.listAll(`/repos/${repo.owner}/${repo.repo}/milestones`, schema)).map(
    (value) => ({
      label: value.title,
      value: String(value.number),
    }),
  );
}

export const repositoryOptions = { repository: repositories };

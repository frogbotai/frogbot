import type { Linear } from '../client.js';

type Connection = {
  nodes: Array<{ id: string; name?: string; title?: string }>;
  pageInfo: { hasNextPage: boolean; endCursor?: string | null };
};

async function loadOptions(load: (after?: string) => Promise<Connection>) {
  const options: Array<{ label: string; value: string }> = [];
  let after: string | undefined;
  do {
    const page = await load(after);
    for (const node of page.nodes)
      {options.push({ label: node.name ?? node.title ?? node.id, value: node.id });}
    after = page.pageInfo.hasNextPage ? (page.pageInfo.endCursor ?? undefined) : undefined;
  } while (after);
  return options;
}

export const teams = ({ client }: { client: Linear }) =>
  loadOptions((after) => client.teams({ first: 100, after }) as Promise<Connection>);
export const users = ({ client }: { client: Linear }) =>
  loadOptions((after) => client.users({ first: 100, after }) as Promise<Connection>);
export const projects = ({ client }: { client: Linear }) =>
  loadOptions((after) => client.projects({ first: 100, after }) as Promise<Connection>);
export const priorities = async ({ client }: { client: Linear }) =>
  (await client.issuePriorityValues).map(({ label, priority }) => ({
    label,
    value: String(priority),
  }));
export const teamOptions =
  (method: 'issues' | 'workflowStates' | 'issueLabels') =>
  ({ client, input }: { client: Linear; input: { teamId?: string } }) =>
    input.teamId
      ? loadOptions(
          (after) =>
            client[method]({
              first: 100,
              after,
              filter: { team: { id: { eq: input.teamId } } },
            }) as Promise<Connection>,
        )
      : Promise.resolve([]);

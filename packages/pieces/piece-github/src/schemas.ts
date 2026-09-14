import { z } from 'zod';

const repositoryObject = z.object({ owner: z.string().min(1), repo: z.string().min(1) });

export const repositoryInput = z
  .union([repositoryObject, z.string().regex(/^[^/]+\/[^/]+$/)])
  .transform((value) => {
    if (typeof value !== 'string') return value;

    const [owner, repo] = value.split('/');

    return repositoryObject.parse({ owner, repo });
  });
export const githubObject = z.looseObject({});
export const githubObjects = z.array(githubObject);
export const emptyOutput = z.looseObject({});
export const issueOutput = z.looseObject({
  id: z.number().int(),
  number: z.number().int(),
  title: z.string(),
});
export const commentOutput = z.looseObject({ id: z.number().int(), body: z.string() });
export const branchOutput = z.looseObject({
  name: z.string(),
  commit: z.looseObject({ sha: z.string() }),
});
export const userOutput = z.looseObject({ id: z.number().int(), login: z.string() });
export const gistOutput = z.looseObject({ id: z.string(), html_url: z.string() });
export const graphqlOutput = z.looseObject({
  data: z.record(z.string(), z.unknown()).optional(),
  errors: z.array(githubObject).optional(),
});
export const findBranchOutput = z.object({
  found: z.boolean(),
  result: z.union([branchOutput, z.object({})]),
});
export const findIssueOutput = z.object({ found: z.boolean(), result: z.array(issueOutput) });
export const findUserOutput = z.object({
  found: z.boolean(),
  result: z.union([userOutput, z.object({})]),
});

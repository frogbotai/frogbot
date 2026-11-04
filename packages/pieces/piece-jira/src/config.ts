import { z } from 'zod';

const jiraTokenAuth = z.object({
  email: z.email().meta({ label: 'Email' }),
  apiToken: z.string().min(1).meta({ label: 'API token', secret: true }),
});

const jiraAccessTokenAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'OAuth access token', secret: true }),
});

/** An Atlassian API token with its account email, or an Atlassian sign-in's access token. */
export const jiraAuth = jiraTokenAuth
  .extend(jiraAccessTokenAuth.shape)
  .partial()
  .pipe(z.union([jiraTokenAuth, jiraAccessTokenAuth]));

export type JiraAuth = z.output<typeof jiraAuth>;

function isSiteUrl(value: string) {
  if (!URL.canParse(value)) return false;

  const url = new URL(value);

  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.port &&
    url.pathname === '/' &&
    !url.search &&
    !url.hash &&
    /^[a-z\d](?:[a-z\d-]*[a-z\d])?\.atlassian\.net$/.test(url.hostname)
  );
}

export const jiraOptions = z.object({
  siteUrl: z
    .string()
    .trim()
    .refine(isSiteUrl, {
      message: 'siteUrl must be https://<name>.atlassian.net, with no path, query, port or login.',
    })
    .transform((value) => new URL(value).origin)
    .optional()
    .meta({
      label: 'Site URL',
      description:
        'Your Jira Cloud site, such as https://acme.atlassian.net. API tokens need it; Atlassian sign-in uses it to pick the site.',
    }),
});

export type JiraOptions = z.output<typeof jiraOptions>;

export const issueKey = z
  .string()
  .trim()
  .min(1)
  .meta({ label: 'Issue', description: 'An issue key such as OPS-12, or its numeric id.' });

export const identifier = z.string().trim().min(1);

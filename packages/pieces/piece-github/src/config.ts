import { z } from 'zod';

const githubAppAuth = z.object({
  appId: z.string().min(1).meta({ label: 'App ID' }),
  privateKey: z.string().min(1).meta({ label: 'Private key', secret: true }),
  installationId: z.coerce.number().int().positive().meta({ label: 'Installation ID' }),
});

const githubUserAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
});

export const githubAuth = githubAppAuth
  .extend(githubUserAuth.shape)
  .partial()
  .pipe(
    z.union([
      githubAppAuth.extend({ installationId: z.number().int().positive() }),
      githubUserAuth,
    ]),
  );

export const githubOptions = z.object({
  webhookSecret: z.string().min(1).optional().meta({ label: 'Webhook secret', secret: true }),
  botUsername: z.string().min(1).optional().meta({ label: 'Bot username' }),
  botUserId: z.coerce.number().int().positive().optional().meta({ label: 'Bot user ID' }),
});

export type GithubOptions = z.output<typeof githubOptions>;

export const githubScopes = {
  repo: 'repo',
  'repo:status': 'repo:status',
  repo_deployment: 'repo_deployment',
  public_repo: 'public_repo',
  'repo:invite': 'repo:invite',
  security_events: 'security_events',
  'admin:repo_hook': 'admin:repo_hook',
  'write:repo_hook': 'write:repo_hook',
  'read:repo_hook': 'read:repo_hook',
  'admin:org': 'admin:org',
  'write:org': 'write:org',
  'read:org': 'read:org',
  'admin:org_hook': 'admin:org_hook',
  'admin:public_key': 'admin:public_key',
  'write:public_key': 'write:public_key',
  'read:public_key': 'read:public_key',
  gist: 'gist',
  notifications: 'notifications',
  user: 'user',
  'read:user': 'read:user',
  'user:email': 'user:email',
  'user:follow': 'user:follow',
  project: 'project',
  'read:project': 'read:project',
  delete_repo: 'delete_repo',
  workflow: 'workflow',
  'write:packages': 'write:packages',
  'read:packages': 'read:packages',
  'delete:packages': 'delete:packages',
  'write:discussion': 'write:discussion',
  'read:discussion': 'read:discussion',
  codespace: 'codespace',
} as const;

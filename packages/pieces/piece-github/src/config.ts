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

export const githubScopes = ['admin:repo_hook', 'admin:org', 'repo', 'gist', 'user:email'];

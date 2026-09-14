import { z } from 'zod';

export const githubAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
});

export const githubScopes = ['admin:repo_hook', 'admin:org', 'repo', 'gist', 'user:email'];

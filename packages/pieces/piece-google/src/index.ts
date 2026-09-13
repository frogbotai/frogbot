import { definePiece, type PieceOAuthRecipe } from 'frogbot/pieces';
import { z } from 'zod';

export const googleOAuth = {
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scopes: [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  params: { access_type: 'offline', prompt: 'consent' },
  async account({ tokens, req }) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      signal: req.signal,
    });
    if (!response.ok) throw new Error('Google account lookup failed.');
    const account: unknown = await response.json();
    if (
      !account ||
      typeof account !== 'object' ||
      !('sub' in account) ||
      typeof account.sub !== 'string' ||
      !account.sub.trim() ||
      !('email' in account) ||
      typeof account.email !== 'string' ||
      !account.email.trim() ||
      !('email_verified' in account) ||
      account.email_verified !== true
    ) {
      throw new Error('Google did not return a verified email address.');
    }
    return {
      id: account.sub,
      label:
        'name' in account && typeof account.name === 'string' && account.name.trim()
          ? account.name
          : account.email,
      email: account.email,
    };
  },
} satisfies PieceOAuthRecipe<unknown, unknown>;

const googleAuth = z.object({ accessToken: z.string().min(1).meta({ secret: true }) });

export const createGoogle = definePiece({
  slug: 'google',
  label: 'Google',
  auth: googleAuth,
  client: ({ auth }: { auth: unknown }) => googleAuth.parse(auth),
  oauth: googleOAuth,
  actions: [],
});

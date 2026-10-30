import type { CollectionConfig, FrogBotConfig } from 'frogbot';
import { definePiece, type PieceOAuthAccount, type PieceOAuthRecipe } from 'frogbot/pieces';
import { z } from 'zod';

import { type DojoEnv, SIGN_IN_VARIABLES } from './env.js';
import { withWarnings } from './onInit.js';

const METHOD = 'dojo';

type DojoClient = { clientId: string; clientSecret: string; url: string };

const dojoAuth = z.object({ accessToken: z.string().min(1).meta({ secret: true }) });

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** The "Continue with Dojo" method: OAuth with PKCE against Dojo, reading the person from userinfo. */
export function createDojoSignIn({ clientId, clientSecret, url }: DojoClient) {
  const oauth = {
    authorizationUrl: new URL('/api/oauth/authorize', url).href,
    tokenUrl: new URL('/api/oauth/token', url).href,
    tokenEndpointAuthMethod: 'client_secret_basic',
    pkce: true,
    scopes: {
      catalog: { profile: 'profile', email: 'email' },
      defaults: [],
      required: ['profile', 'email'],
    },
    async account({ tokens, req }) {
      const response = await fetch(new URL('/api/oauth/userinfo', url), {
        headers: { authorization: `Bearer ${tokens.access_token}` },
        signal: req.signal,
      });

      if (!response.ok) throw new Error('Dojo account lookup failed.');
      const account = (await response.json()) as Record<string, unknown> | null;
      if (
        !account ||
        !isText(account.sub) ||
        !isText(account.email) ||
        account.email_verified !== true
      ) {
        throw new Error('Dojo did not return a verified email address.');
      }

      return {
        id: account.sub,
        label: isText(account.name) ? account.name : account.email,
        email: account.email,
      };
    },
  } satisfies PieceOAuthRecipe<unknown, unknown, PieceOAuthAccount, 'profile' | 'email'>;

  const createDojo = definePiece({
    slug: METHOD,
    label: 'Dojo',
    auth: dojoAuth,
    client: ({ auth }: { auth: unknown }) => dojoAuth.parse(auth),
    oauth,
    actions: [],
  });

  return createDojo({ oauth: { clientId, clientSecret } });
}

type Auth = Exclude<NonNullable<CollectionConfig['auth']>, boolean>;

function userCollection(config: FrogBotConfig): CollectionConfig | string {
  const auths = config.collections.filter(({ auth }) => auth !== undefined && auth !== false);

  if (auths.length === 0) return 'the app has no auth collection';

  if (auths.length === 1) return auths[0];

  const user = auths.find(({ slug }) => slug === config.admin?.user);

  return user ?? 'the app has several auth collections and `admin.user` names none of them';
}

function signInProblem(collection: CollectionConfig, auth: Auth): string | undefined {
  if (auth.signIn !== undefined && !Array.isArray(auth.signIn)) return '`signIn` is not an array';

  if (auth.signIn?.some(({ slug }) => slug === METHOD)) {
    return `it already has a '${METHOD}' method`;
  }

  if (
    auth.disableLocalStrategy &&
    (typeof auth.disableLocalStrategy !== 'object' || !auth.disableLocalStrategy.enableFields)
  ) {
    return '`disableLocalStrategy` is set without `enableFields`';
  }

  if (
    typeof auth.loginWithUsername === 'object' &&
    auth.loginWithUsername.allowEmailLogin === false
  ) {
    return '`loginWithUsername.allowEmailLogin` is false';
  }

  const email = collection.fields.find((field) => 'name' in field && field.name === 'email');
  if (
    email &&
    (email.type !== 'email' || email.unique === false || email.localized || email.virtual)
  ) {
    return 'its `email` field is not a unique, stored, non-localized email field';
  }

  return undefined;
}

/**
 * Adds "Continue with Dojo" after the user collection's own sign-in methods, once. Where core would
 * refuse the method, or a variable is missing, adds nothing and logs why at start instead.
 */
export function withDojoSignIn(config: FrogBotConfig, env: DojoEnv): FrogBotConfig {
  const off = (reason: string, slug?: string) =>
    withWarnings(config, [
      `[plugin-dojo] Sign in with Dojo is off${slug ? ` for '${slug}'` : ''}: ${reason}.`,
    ]);

  const collection = userCollection(config);

  if (typeof collection === 'string') return off(collection);

  const missing = (
    Object.entries(SIGN_IN_VARIABLES) as [keyof typeof SIGN_IN_VARIABLES, string][]
  ).find(([key]) => !env[key]);

  if (missing) return off(`${missing[1]} is not set`, collection.slug);

  if (!['http:', 'https:'].includes(URL.parse(env.url!)?.protocol ?? '')) {
    return off(`${SIGN_IN_VARIABLES.url} is not a URL`, collection.slug);
  }

  const auth: Auth = collection.auth === true ? {} : (collection.auth as Auth);
  const problem = signInProblem(collection, auth);

  if (problem) return off(problem, collection.slug);

  const method = createDojoSignIn({
    clientId: env.oauthClientId!,
    clientSecret: env.oauthClientSecret!,
    url: env.url!,
  });

  return {
    ...config,
    collections: config.collections.map((entry) =>
      entry === collection
        ? { ...entry, auth: { ...auth, signIn: [...(auth.signIn ?? []), method] } }
        : entry,
    ),
  };
}

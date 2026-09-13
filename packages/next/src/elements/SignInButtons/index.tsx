import type { ServerProps } from 'payload';
import { getSafeRedirect } from 'payload/shared';

import { SignInButtonsClient } from './index.client.js';

export function SignInButtons({
  payload,
  searchParams,
}: Pick<ServerProps, 'payload' | 'searchParams'>) {
  const { config } = payload;
  const collection = config.collections.find(({ slug }) => slug === config.admin.user);
  const methods = collection?.custom?.frogbot?.signIn;
  if (!collection?.auth || !Array.isArray(methods) || !methods.length) return null;
  return (
    <SignInButtonsClient
      methods={methods.map(({ slug, piece, label }) => ({ slug, piece, label }))}
      authorizePath={`${config.routes.api.replace(/\/+$/, '')}/${encodeURIComponent(collection.slug)}/sign-in`}
      returnTo={getSafeRedirect({
        fallbackTo: config.routes.admin,
        redirectTo: searchParams?.redirect ?? '',
      })}
      showDivider={!collection.auth.disableLocalStrategy}
    />
  );
}

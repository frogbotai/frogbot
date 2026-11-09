import { Logo, RenderServerComponent } from '@frogbotai/ui/admin/rsc';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import type { AdminViewServerProps, PayloadRequest, ServerProps } from 'payload';
import { getSafeRedirect } from 'payload/shared';

import { TwoFactorLoginForm } from './client/LoginForm.js';
import { TwoFactorField } from './client/TwoFactorField.js';
import { hasTwoFactor, readUser, type TwoFactorContext } from './context.js';

/**
 * The admin login view with the two-factor step. It renders Payload's login slots (logo,
 * `beforeLogin`, the password form, `afterLogin`); only the form differs, sending a sign-in that
 * needs a code to the plugin's code page.
 */
export function TwoFactorLoginView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { locale, permissions, req } = initPageResult;
  const { i18n, payload, server } = req;
  const { config } = payload;
  const { afterLogin, beforeLogin } = config.admin.components ?? {};
  const user = req.user ?? undefined;
  const redirect = getSafeRedirect({
    fallbackTo: config.routes.admin,
    redirectTo: searchParams?.redirect ?? '',
  });

  if (!server) throw new Error('[plugin-two-factor] The login view renders only inside the admin.');
  if (user) server.redirect(redirect);

  const auth = payload.collections[config.admin.user]?.config.auth;
  const autoLogin = typeof config.admin.autoLogin === 'object' ? config.admin.autoLogin : undefined;
  const prefill = autoLogin?.prefillOnly ? autoLogin : undefined;
  const serverProps = {
    i18n,
    locale,
    params,
    payload,
    permissions,
    searchParams,
    server,
    user,
  } satisfies ServerProps;

  return (
    <>
      <div className="login__brand">
        <Logo {...serverProps} />
      </div>
      {RenderServerComponent({ Component: beforeLogin, importMap: payload.importMap, serverProps })}
      {!auth?.disableLocalStrategy && (
        <TwoFactorLoginForm
          prefillEmail={prefill?.email}
          prefillPassword={prefill?.password}
          prefillUsername={prefill?.username}
          redirect={redirect}
        />
      )}
      {RenderServerComponent({ Component: afterLogin, importMap: payload.importMap, serverProps })}
    </>
  );
}

export type TwoFactorFieldServerProps = {
  id?: string | number;
  data?: Record<string, unknown>;
  field: { custom?: Record<string, unknown> };
  req: PayloadRequest;
};

/**
 * The account section on the `twoFactorEnabled` field. It works out on the server whether the
 * document is the signed-in user's own, whether `require` covers them and whether they may turn
 * it on or reset someone else's.
 */
export async function TwoFactorFieldServer({ id, data, field, req }: TwoFactorFieldServerProps) {
  const ctx = field.custom?.['plugin-two-factor'] as TwoFactorContext | undefined;
  if (!ctx || id === undefined || !req.user) return null;

  const frogbotReq = attachRegisteredFrogBot(req);
  const user = await readUser(frogbotReq, ctx.slug, id);
  if (!user) return null;

  const self = req.user.collection === ctx.slug && String(req.user.id) === String(id);
  const enabled = hasTwoFactor(user);
  const args = { req: frogbotReq, user };
  const name = typeof data?.email === 'string' && data.email ? data.email : 'this person';

  return (
    <TwoFactorField
      canEnable={self && !enabled ? await ctx.options.canEnable(args) : false}
      canReset={self ? false : await ctx.options.canReset({ req: frogbotReq })}
      collectionSlug={ctx.slug}
      enabled={enabled}
      name={name}
      required={self ? await ctx.options.require(args) : false}
      self={self}
      userId={id}
    />
  );
}

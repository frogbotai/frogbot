import { definePlugin, type Field, type Plugin } from 'frogbot';

import { createAccountEndpoints } from './account.js';
import {
  FIELDS,
  type TwoFactorContext,
  type TwoFactorPluginOptions,
  type TwoFactorResolvedOptions,
} from './context.js';
import { createFlowEndpoints } from './flow.js';
import {
  createBeforeLogin,
  createBeforeSignIn,
  createLoginEndpoint,
  createResetPasswordEndpoint,
} from './login.js';

export type {
  TwoFactorEmail,
  TwoFactorEmailEvent,
  TwoFactorPluginOptions,
  TwoFactorResolvedOptions,
  TwoFactorUser,
  TwoFactorUserArgs,
} from './context.js';
export { hasTwoFactor } from './context.js';
export { TwoFactorRequired } from './login.js';

const never = () => false;

const fields: Field[] = [
  {
    name: FIELDS.enabled,
    type: 'checkbox',
    label: 'Two-factor sign-in',
    defaultValue: false,
    access: { create: never, update: never },
    admin: { readOnly: true },
  },
  { name: FIELDS.secret, type: 'text', hidden: true, access: { create: never, update: never } },
  { name: FIELDS.recovery, type: 'json', hidden: true, access: { create: never, update: never } },
  { name: FIELDS.lastStep, type: 'number', hidden: true, access: { create: never, update: never } },
];

const twoFactorPlugin = definePlugin<TwoFactorResolvedOptions>({
  slug: 'plugin-two-factor',
  plugin: ({ config, options }) => {
    const slug =
      options.collection ??
      config.admin?.user ??
      config.collections.find((collection) => collection.auth)?.slug;

    const target = config.collections.find((collection) => collection.slug === slug);
    if (!slug || !target?.auth) {
      throw new Error(
        `[plugin-two-factor] Auth collection '${slug ?? '(none)'}' must exist and have auth enabled.`,
      );
    }

    const ctx: TwoFactorContext = { slug, options };

    return {
      ...config,
      collections: config.collections.map((collection) =>
        collection === target
          ? {
              ...collection,
              fields: [...collection.fields, ...fields],
              hooks: {
                ...collection.hooks,
                beforeSignIn: [...(collection.hooks?.beforeSignIn ?? []), createBeforeSignIn(ctx)],
                beforeLogin: [...(collection.hooks?.beforeLogin ?? []), createBeforeLogin(ctx)],
              },
              endpoints: [
                createLoginEndpoint(ctx),
                createResetPasswordEndpoint(ctx),
                ...createFlowEndpoints(ctx),
                ...createAccountEndpoints(ctx),
                ...(collection.endpoints ?? []),
              ],
            }
          : collection,
      ),
    };
  },
});

/**
 * Two-factor sign-in: after the password or a sign-in provider, users with it on enter an
 * authenticator or recovery code before they get a session.
 *
 * @example
 * plugins: [twoFactor({ issuer: 'Acme', require: ({ user }) => user.role === 'admin' })]
 */
export function twoFactor(options: TwoFactorPluginOptions = {}): Plugin {
  return twoFactorPlugin({
    ...options,
    require: options.require ?? never,
    canEnable: options.canEnable ?? (() => true),
    canReset: options.canReset ?? never,
    issuer: options.issuer ?? 'FrogBot',
    emails: options.emails ?? {},
  });
}

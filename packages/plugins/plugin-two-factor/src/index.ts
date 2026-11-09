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
import { createFirstRegisterEndpoint } from './register.js';

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

const LOGIN_VIEW = '@frogbotai/plugin-two-factor/rsc#TwoFactorLoginView';

const ACCOUNT_FIELD = '@frogbotai/plugin-two-factor/rsc#TwoFactorFieldServer';

const createFields = (ctx: TwoFactorContext): Field[] => [
  {
    name: FIELDS.enabled,
    type: 'checkbox',
    label: 'Two-factor sign-in',
    defaultValue: false,
    access: { create: never, update: never },
    admin: { readOnly: true, components: { Field: ACCOUNT_FIELD } },
    custom: { 'plugin-two-factor': ctx },
  },
  { name: FIELDS.secret, type: 'text', hidden: true, access: { create: never, update: never } },
  { name: FIELDS.recovery, type: 'json', hidden: true, access: { create: never, update: never } },
  { name: FIELDS.lastStep, type: 'number', hidden: true, access: { create: never, update: never } },
];

const twoFactorPlugin = definePlugin<TwoFactorResolvedOptions>({
  slug: 'plugin-two-factor',
  plugin: ({ config, options }) => {
    const adminUser =
      config.admin?.user ?? config.collections.find((collection) => collection.auth)?.slug;

    const slug = options.collection ?? adminUser;

    const target = config.collections.find((collection) => collection.slug === slug);
    if (!slug || !target?.auth) {
      throw new Error(
        `[plugin-two-factor] Auth collection '${slug ?? '(none)'}' must exist and have auth enabled.`,
      );
    }

    const ctx: TwoFactorContext = { slug, options };
    const views = config.admin?.components?.views;

    return {
      ...config,
      ...(slug === adminUser &&
        !views?.login && {
          admin: {
            ...config.admin,
            components: {
              ...config.admin?.components,
              views: { ...views, login: { Component: LOGIN_VIEW, meta: { title: 'Login' } } },
            },
          },
        }),
      collections: config.collections.map((collection) =>
        collection === target
          ? {
              ...collection,
              fields: [...collection.fields, ...createFields(ctx)],
              hooks: {
                ...collection.hooks,
                beforeSignIn: [...(collection.hooks?.beforeSignIn ?? []), createBeforeSignIn(ctx)],
                beforeLogin: [...(collection.hooks?.beforeLogin ?? []), createBeforeLogin(ctx)],
              },
              endpoints: [
                createLoginEndpoint(ctx),
                createResetPasswordEndpoint(ctx),
                createFirstRegisterEndpoint(ctx),
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

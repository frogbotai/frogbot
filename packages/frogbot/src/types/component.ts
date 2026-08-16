// FrogBot's component reference types.
//
// Users hand FrogBot component *references* — an import path string, or a path
// plus props — never React elements. These aliases keep Payload's component
// type names out of user-facing hovers and error messages.

import type { CustomComponent } from 'payload';

import type { PayloadConfig } from './payload.js';

/**
 * Reference to a React component rendered by the admin panel.
 *
 * Either an import path (`'@app/components/Banner#Banner'`) or an object with
 * `path` plus optional `clientProps` / `serverProps`.
 */
export type Component<TProps extends object = Record<string, unknown>> = CustomComponent<TProps>;

/** Payload's root `admin.components` block. Source for the slot value types
 *  Payload does not export under a usable name. */
type PayloadAdminComponents = NonNullable<NonNullable<PayloadConfig['admin']>['components']>;

/** Reference to a component that wraps the admin panel and renders `children`. */
export type ProviderComponent = NonNullable<PayloadAdminComponents['providers']>[number];

/** Top-level admin route overrides, keyed by view name (`account`, `dashboard`)
 *  or a custom path. */
export type AdminViews = NonNullable<PayloadAdminComponents['views']>;

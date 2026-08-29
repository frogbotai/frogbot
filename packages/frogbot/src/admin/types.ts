// FrogBot's root-level admin configuration. The collection-level admin
// surface (`AdminConfig` for a single collection) is re-exported from
// Payload in Stage 8's public surface; FrogBot does not diverge there.
//
// This file owns only the root `admin` block where FrogBot's `app` /
// branding story differs from Payload's.

import type { Metadata } from 'next';
import type { CustomComponent } from 'payload';

import type { Access } from '../collections/config/types.js';
import type { PayloadConfig } from '../types/payload.js';

type DeepClone<T> = T extends object ? { [K in keyof T]: DeepClone<T[K]> } : T;

/** Metadata for the root admin block. Mirrors Payload's `MetaConfig` shape:
 *  `{ defaultOGImageType?, titleSuffix? } & DeepClone<Metadata>` from `next`. */
export type RootAdminMetaConfig = {
  defaultOGImageType?: 'dynamic' | 'static' | 'off';
  titleSuffix?: string;
} & DeepClone<Metadata>;

export interface RootAdminGraphics {
  /** Replace the icon in the admin navigation. Defaults to the FrogBot head mark. */
  Icon?: FrogbotComponent;
  /** Replace the logo on the login page. Defaults to the FrogBot wordmark. */
  Logo?: FrogbotComponent;
}

export interface NavItem {
  /** Icon shown next to the label in the sidebar. */
  icon?: FrogbotComponent;
  /** Text shown in the sidebar. */
  label: string;
  /** Full path the link navigates to, e.g. `/admin/operations`. */
  path: string;
}

export interface RootAdminComponents {
  /** Add components to the top right of the admin panel. */
  actions?: FrogbotComponent[];
  /** Add components after the login form's email and password fields. */
  afterLogin?: FrogbotComponent[];
  /** Add components before the login form's email and password fields. */
  beforeLogin?: FrogbotComponent[];
  /** Add components to the sidebar below the nav links and nav sections. */
  afterNavLinks?: FrogbotComponent[];
  /** Add components to the bottom sidebar rail, below Account and Settings. */
  afterBottomRail?: FrogbotComponent[];
  /** Add components to the bottom sidebar rail, above Account and Settings. */
  beforeBottomRail?: FrogbotComponent[];
  /** Add components to the sidebar header, left of the collapse button. */
  beforeSidebarClose?: FrogbotComponent[];
  /** Add components to the sidebar above the nav links. */
  beforeNavLinks?: FrogbotComponent[];
  /** Component slots for admin branding. */
  graphics?: RootAdminGraphics;
  /** Replace the entire admin sidebar navigation. */
  Nav?: FrogbotComponent;
  /** Sidebar links above your collections. Defaults to a single New Chat
   *  link; setting this replaces it, so include New Chat yourself if you
   *  still want it. */
  navItems?: NavItem[];
  /** Sidebar sections below the links. Defaults to Collections + Recents;
   *  setting this replaces those defaults. */
  navSections?: FrogbotComponent[];
  /** Wrap the admin panel in custom context providers. */
  providers?: ProviderComponent[];
  /** Replace, modify, or add top-level admin routes. */
  views?: AdminViews;
}

export interface RootAdminConfig {
  importMap?: {
    /** Regenerate the admin import map on boot. */
    autoGenerate?: boolean;
  };
  /**
   * Collection slug that powers admin access. FrogBot may derive this from
   * a role-marked auth collection later; explicit slug stays as the override.
   */
  user?: string;
  /**
   * Account avatar shown in the admin header.
   *
   * @default 'gravatar'
   */
  avatar?: 'default' | 'gravatar' | { Component: FrogbotComponent };
  /** Component slots for admin branding and injected UI. */
  components?: RootAdminComponents;
  /** Metadata for generated/admin surfaces. */
  meta?: RootAdminMetaConfig;
  /**
   * Restrict the Admin Panel theme to one of these values.
   *
   * @default 'all' // The theme can be configured by users
   */
  theme?: 'all' | 'dark' | 'light';
}

// FrogBot's component reference types.
//
// Users hand FrogBot component *references* — an import path string, or a path
// plus props — never React elements. These aliases keep Payload's component
// type names out of user-facing hovers and error messages.

/**
 * Reference to a React component rendered by the admin panel.
 *
 * Either an import path (`'@app/components/Banner#Banner'`) or an object with
 * `path` plus optional `clientProps` / `serverProps`.
 */
export type FrogbotComponent<TProps extends object = Record<string, unknown>> =
  CustomComponent<TProps>;

/** Payload's root `admin.components` block. Source for the slot value types
 *  Payload does not export under a usable name. */
type PayloadAdminComponents = NonNullable<NonNullable<PayloadConfig['admin']>['components']>;

/** Reference to a component that wraps the admin panel and renders `children`. */
export type ProviderComponent = NonNullable<PayloadAdminComponents['providers']>[number];

/** Top-level admin route overrides, keyed by view name (`account`, `dashboard`)
 *  or a custom path. */
export type AdminViews = NonNullable<PayloadAdminComponents['views']>;

/** A page in the admin settings area. */
export type SettingsEntry = {
  /** Label shown in the settings sidebar. */
  label: string;
  /** Route relative to `/settings`, e.g. `/billing`. */
  path: string;
  /** Component rendered for this page. */
  Component: FrogbotComponent;
  /** Icon shown next to the label. */
  icon?: FrogbotComponent;
  /** Who can see and open this page. */
  access?: Access;
};

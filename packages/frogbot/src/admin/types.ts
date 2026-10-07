import type { Metadata } from 'next';
import type { CustomComponent } from 'payload';

import type { Access } from '../collections/config/types.js';
import type { RootLivePreviewConfig } from '../config/types.js';
import type { PayloadConfig } from '../types/payload.js';
import type { IconName } from './icons.js';
import type { DashboardConfig } from './views/types.js';

type DeepClone<T> = T extends object ? { [K in keyof T]: DeepClone<T[K]> } : T;

/** Metadata for the root admin block. Mirrors Payload's `MetaConfig` shape:
 *  `{ defaultOGImageType?, titleSuffix? } & DeepClone<Metadata>` from `next`. */
export type RootAdminMetaConfig = {
  defaultOGImageType?: 'dynamic' | 'static' | 'off';
  titleSuffix?: string;
} & DeepClone<Metadata>;

export interface RootAdminGraphics {
  /** Replace the icon in the admin navigation. Defaults to the FrogBot head mark. */
  Icon?: FrogBotComponent;
  /** Replace the logo on the login page. Defaults to the FrogBot wordmark. */
  Logo?: FrogBotComponent;
}

export interface NavItem {
  /** Icon shown next to the label in the sidebar. */
  icon?: AdminIcon;
  /** Text shown in the sidebar. */
  label: string;
  /** Full path the link navigates to, e.g. `/admin/operations`. */
  path: string;
}

export interface RootAdminComponents {
  /** Add components to the top right of the admin panel. */
  actions?: FrogBotComponent[];
  /** Add items to the account menu, below Settings. */
  afterAccountMenu?: FrogBotComponent[];
  /** Add components after the login form's email and password fields. */
  afterLogin?: FrogBotComponent[];
  /** Add items to the account menu, above Settings. */
  beforeAccountMenu?: FrogBotComponent[];
  /** Add components before the login form's email and password fields. */
  beforeLogin?: FrogBotComponent[];
  /** Add components to the sidebar below the nav links and nav sections. */
  afterNavLinks?: FrogBotComponent[];
  /** Add components to the bottom sidebar rail, below Account and Settings. */
  afterBottomRail?: FrogBotComponent[];
  /** Add components to the bottom sidebar rail, above Account and Settings. */
  beforeBottomRail?: FrogBotComponent[];
  /** Add components to the sidebar header, left of the collapse button. */
  beforeSidebarClose?: FrogBotComponent[];
  /** Add components to the sidebar above the nav links. */
  beforeNavLinks?: FrogBotComponent[];
  chat?: {
    AssistantMessageActions?: FrogBotComponent;
    Chat?: FrogBotComponent;
    Greeting?: FrogBotComponent;
    UserMessageActions?: FrogBotComponent;
  };
  /** Component slots for admin branding. */
  graphics?: RootAdminGraphics;
  /** Replace the account menu's Log out item. */
  logout?: { Button?: FrogBotComponent };
  /** Replace the entire admin sidebar navigation. */
  Nav?: FrogBotComponent;
  /** Sidebar links above your collections. Empty by default. */
  navItems?: NavItem[];
  /** Sidebar sections below the links. Defaults to Collections; setting this
   *  replaces that default. */
  navSections?: FrogBotComponent[];
  /** Wrap the admin panel in custom context providers. */
  providers?: ProviderComponent[];
  /** Add items to the account menu, after `afterAccountMenu`. */
  settingsMenu?: FrogBotComponent[];
  /** Replace, modify, or add top-level admin routes. */
  views?: AdminViews;
}

export interface RootAdminConfig {
  /**
   * Log every visitor in as this user, or prefill the login form with `prefillOnly`. Keep it off in production.
   *
   * @default false
   */
  autoLogin?:
    | false
    | {
        email?: string;
        /** Only used with `prefillOnly`. */
        password?: string;
        /** Fill in the login form instead of logging in. */
        prefillOnly?: boolean;
        username?: string;
      };
  /**
   * Refresh the admin user's token before it expires instead of asking them to stay logged in.
   *
   * @default false
   */
  autoRefresh?: boolean;
  dashboard?: DashboardConfig;
  importMap?: {
    /** Regenerate the admin import map on boot. */
    autoGenerate?: boolean;
  };
  livePreview?: RootLivePreviewConfig;
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
  avatar?: 'default' | 'gravatar' | { Component: FrogBotComponent };
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

/**
 * Reference to a React component rendered by the admin panel.
 *
 * Either an import path (`'@app/components/Banner#Banner'`) or an object with
 * `path` plus optional `clientProps` / `serverProps`.
 */
export type FrogBotComponent<TProps extends object = Record<string, unknown>> =
  CustomComponent<TProps>;

/**
 * Icon for a collection, navigation item, or settings page: a built-in icon
 * name (`'robot'`) or a component (`'./src/components/Icon#Icon'`).
 */
export type AdminIcon = Exclude<FrogBotComponent, string> | (string & {}) | IconName;

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
  Component: FrogBotComponent;
  /** Icon shown next to the label. */
  icon?: AdminIcon;
  /** Who can see and open this page. */
  access?: Access;
};

// FrogBot's root-level admin configuration. The collection-level admin
// surface (`AdminConfig` for a single collection) is re-exported from
// Payload in Stage 8's public surface; FrogBot does not diverge there.
//
// This file owns only the root `admin` block where FrogBot's `app` /
// branding story differs from Payload's.

import type { Metadata } from 'next';
import type { PayloadComponent } from 'payload';

type DeepClone<T> = T extends object ? { [K in keyof T]: DeepClone<T[K]> } : T;

/** Metadata for the root admin block. Mirrors Payload's `MetaConfig` shape:
 *  `{ defaultOGImageType?, titleSuffix? } & DeepClone<Metadata>` from `next`. */
export type RootAdminMetaConfig = {
  defaultOGImageType?: 'dynamic' | 'static' | 'off';
  titleSuffix?: string;
} & DeepClone<Metadata>;

export interface RootAdminGraphics {
  /** Replace the icon in the admin navigation. Defaults to the FrogBot head mark. */
  Icon?: PayloadComponent;
  /** Replace the logo on the login page. Defaults to the FrogBot wordmark. */
  Logo?: PayloadComponent;
}

export interface RootAdminComponents {
  graphics?: RootAdminGraphics;
}

export interface RootAdminConfig {
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
  avatar?: 'default' | 'gravatar' | { Component: PayloadComponent };
  /** Component slots for admin branding. */
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

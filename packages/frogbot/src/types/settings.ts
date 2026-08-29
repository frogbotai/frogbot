import type { Access } from './access.js';
import type { FrogbotComponent } from './component.js';

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

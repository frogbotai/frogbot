import type { Access } from './access.js';
import type { FrogbotComponent } from './component.js';

export type SettingsEntry = {
  label: string;
  path: string;
  Component: FrogbotComponent;
  icon?: FrogbotComponent;
  access?: Access;
};

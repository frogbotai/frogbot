import type { Klass, LexicalNode } from 'lexical';
import type { ComponentType } from 'react';

import { PromptHistoryPlugin } from './history-plugin.js';
import { KeybindingsPlugin } from './keys.js';
import { MentionNode } from './mention-node.js';
import { MentionsPlugin } from './mentions.js';
import { PastePlugin } from './paste.js';
import { SlashMenuPlugin } from './slash-menu.js';

/** One composer behaviour: the Lexical nodes it registers and a plugin rendered inside the editor. */
export interface ComposerFeature {
  key: string;
  nodes?: readonly Klass<LexicalNode>[];
  plugin?: ComponentType;
}

/** The composer's built-in features. Pass a list to replace them; the last feature per key wins. */
export const defaultComposerFeatures: readonly ComposerFeature[] = [
  { key: 'slash', plugin: SlashMenuPlugin },
  { key: 'mentions', nodes: [MentionNode], plugin: MentionsPlugin },
  { key: 'paste', plugin: PastePlugin },
  { key: 'history', plugin: PromptHistoryPlugin },
  { key: 'keybindings', plugin: KeybindingsPlugin },
];

export function resolveFeatures(features: readonly ComposerFeature[]) {
  const byKey = new Map<string, ComposerFeature>();

  for (const feature of features) byKey.set(feature.key, feature);

  return [...byKey.values()];
}

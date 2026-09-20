import type { FrogbotConfig, Plugin } from 'frogbot';

export type NotesPluginOptions = {
  collectionSlug?: string;
};

export function notesPlugin(_options: NotesPluginOptions = {}): Plugin {
  return (config: FrogbotConfig) => {
    return config;
  };
}

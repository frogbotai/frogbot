import type { FrogBotConfig, Plugin } from 'frogbot';

export type NotesPluginOptions = {
  collectionSlug?: string;
};

export function notesPlugin(_options: NotesPluginOptions = {}): Plugin {
  return (config: FrogBotConfig) => {
    return config;
  };
}

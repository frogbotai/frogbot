import { describe, it } from 'vitest';

describe('frogbot loadConfig', () => {
  it.todo('finds frogbot.config.ts in the cwd');
  it.todo('walks up parent directories until it finds a config file');
  it.todo('accepts frogbot.config.ts, frogbot.config.mjs, and frogbot.config.js');
  it.todo('respects an absolute FROGBOT_CONFIG_PATH override');
  it.todo('respects a relative FROGBOT_CONFIG_PATH (resolved against cwd)');
  it.todo('throws `[frogbot] FROGBOT_CONFIG_PATH points to a missing file:` when the override does not exist');
  it.todo('throws `[frogbot] could not find frogbot.config.{ts,js,mjs}` when no config exists up the tree');
  it.todo('throws `[frogbot] failed to load <path>` wrapping the underlying cause on import failure');
  it.todo('throws `[frogbot] <path> has no default export` when the file has no default export');
  it.todo('awaits a Promise default export');
  it.todo('rejects a default export missing `collections` with `[frogbot] … is not a SanitizedConfig`');
  it.todo('returns the sanitized config object on success');
});

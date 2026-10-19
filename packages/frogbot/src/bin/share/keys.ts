import type { EnvKey } from './envKeys.js';
import { mask } from './envKeys.js';
import type { ShareIO } from './io.js';
import { say } from './io.js';
import { keyFingerprint } from './seal.js';

/** The keys Dojo already has for the app, from `GET /api/apps/:app/keys`, with the app's salt. */
export type LiveKeys = { salt: string; keys: { name: string; fingerprint: string }[] };

const listed = (keys: EnvKey[]) => keys.map((key) => `${key.name} ${mask(key.value)}`).join(', ');

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** First share: every key, minus any the person unticks with a TTY. Runs before any network call. */
export async function chooseFirstKeys({
  keys,
  yes,
  io,
}: {
  keys: EnvKey[];
  yes: boolean;
  io: ShareIO;
}): Promise<EnvKey[]> {
  if (keys.length === 0) return [];

  let chosen = keys;

  if (io.isTTY && !yes) {
    const picked = new Set(
      await io.prompts.multiselect(
        'Keys to bring (untick any to leave out)',
        keys.map((key) => ({ value: key.name, label: `${key.name} ${mask(key.value)}` })),
      ),
    );

    chosen = keys.filter((key) => picked.has(key.name));
  }

  if (chosen.length > 0) {
    say(io, `[frogbot] Bringing ${count(chosen.length, 'key', 'keys')}: ${listed(chosen)}`);
  }

  if (!io.isTTY && !yes) {
    say(
      io,
      '[frogbot] No terminal: carrying all keys. Use --no-keys or --skip-key NAME to leave some out.',
    );
  }

  return chosen;
}

/** Later share: new keys go; keys whose local value differs from live go only with `updateKeys`. */
export function compareLiveKeys({
  keys,
  live,
  appId,
  updateKeys,
  io,
}: {
  keys: EnvKey[];
  live: LiveKeys;
  appId: string | number;
  updateKeys: boolean;
  io: ShareIO;
}): EnvKey[] {
  const fingerprints = new Map(live.keys.map((key) => [key.name, key.fingerprint]));
  const added = keys.filter((key) => !fingerprints.has(key.name));
  const differs = keys.filter((key) => {
    const fingerprint = fingerprints.get(key.name);

    return (
      fingerprint !== undefined &&
      fingerprint !== keyFingerprint(live.salt, appId, key.name, key.value)
    );
  });

  if (added.length > 0) {
    say(io, `[frogbot] Adding ${count(added.length, 'new key', 'new keys')}: ${listed(added)}`);
  }

  if (differs.length > 0 && updateKeys) {
    say(io, `[frogbot] Updating ${count(differs.length, 'key', 'keys')}: ${listed(differs)}`);
  } else if (differs.length > 0) {
    say(
      io,
      `[frogbot] ${count(differs.length, 'key differs', 'keys differ')} from live, kept live: ${differs.map((key) => key.name).join(', ')}. Use --update-keys to send local values.`,
    );
  }

  return updateKeys ? [...added, ...differs] : added;
}

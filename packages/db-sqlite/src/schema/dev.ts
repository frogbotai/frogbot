import {
  isSQLiteAdapter,
  keepLive,
  keptMessages,
  pushAdditive,
  type Reconciled,
  type SchemaAdapter,
  syncing,
} from './sync.js';

type Logger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

type DevAdapter = SchemaAdapter & { payload: { logger: Logger } };

const isDevAdapter = (db: object): db is DevAdapter => isSQLiteAdapter(db) && 'payload' in db;

const reconciled = new WeakMap<object, Reconciled>();
const synced = new WeakMap<object, string>();
const reported = new Set<string>();

/** When Payload would push: outside production and outside the migrate commands. */
export const shouldSyncInDev = () =>
  process.env.NODE_ENV !== 'production' && process.env.PAYLOAD_MIGRATING !== 'true';

/**
 * Replaces Payload's dev push (`pushDevSchema`, which asks before dropping and needs a terminal) with the
 * sync `frogbot up` runs: the raw schema keeps every live table and column the code lacks.
 */
export function installDevSync(adapter: object): void {
  if (!isSQLiteAdapter(adapter)) return;

  keepLive(
    adapter,
    (state) => reconciled.set(adapter, state),
    () => shouldSyncInDev() && !syncing.has(adapter),
  );
}

/**
 * Pushes the reconciled schema on the open connection after Payload connects. A change that would lose
 * data is logged and skipped, and the app keeps starting on the old schema; it never prompts.
 */
export async function syncInDev(adapter: object): Promise<void> {
  const state = reconciled.get(adapter);

  if (!state || !isDevAdapter(adapter) || !shouldSyncInDev() || syncing.has(adapter)) return;

  const schema = JSON.stringify(adapter.rawTables);

  if (synced.get(adapter) === schema) return;

  const { logger } = adapter.payload;

  for (const message of await keptMessages(adapter, state)) {
    if (reported.has(message)) continue;

    reported.add(message);
    logger.info(`[db-sqlite] ${message}`);
  }

  const result = await pushAdditive(adapter, state);

  if (!result.ok) {
    logger.error(`[db-sqlite] ${result.error} The app keeps running on the current schema.`);

    return;
  }

  synced.set(adapter, schema);

  if (result.applied.length) {
    logger.info(`[db-sqlite] Schema sync applied ${result.applied.length} statements.`);
  }
}

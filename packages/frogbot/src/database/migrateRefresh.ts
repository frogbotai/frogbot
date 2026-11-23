import type { BaseDatabaseAdapter } from 'payload';

/**
 * Makes `migrate:refresh` run `migrate:reset`, then `migrate`. Payload's SQL refresh calls each `up` without
 * `db`, so a migration written against `MigrateUpArgs` would fail there. Without a terminal it never asks
 * about dev-mode changes: it returns `cancelled` instead.
 */
export function installMigrateRefresh(adapter: BaseDatabaseAdapter): void {
  adapter.migrateRefresh = async function (this: BaseDatabaseAdapter) {
    const reset = await this.migrateReset();
    const up = await this.migrate({ shouldPrompt: Boolean(process.stdin.isTTY) });

    return {
      ...(up?.cancelled && { cancelled: true as const }),
      migrated: up?.migrated ?? [],
      rolledBack: reset?.rolledBack ?? [],
    };
  };
}

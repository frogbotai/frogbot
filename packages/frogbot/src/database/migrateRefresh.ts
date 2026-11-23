import type { BaseDatabaseAdapter } from 'payload';

/**
 * Makes `migrate:refresh` run `migrate:reset`, then `migrate`. Payload's SQL refresh calls each `up` without
 * `db`, so a migration written against `MigrateUpArgs` would fail there.
 */
export function installMigrateRefresh(adapter: BaseDatabaseAdapter): void {
  adapter.migrateRefresh = async function (this: BaseDatabaseAdapter) {
    const reset = await this.migrateReset();
    const up = await this.migrate();

    return { migrated: up?.migrated ?? [], rolledBack: reset?.rolledBack ?? [] };
  };
}

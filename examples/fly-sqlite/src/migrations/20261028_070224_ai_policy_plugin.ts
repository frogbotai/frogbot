import { MigrateUpArgs, MigrateDownArgs, sql } from '@frogbotai/db-sqlite';

export async function up({ db, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`model_access\`;`);
}

export async function down({ db, req }: MigrateDownArgs): Promise<void> {
  await db.run(
    sql`ALTER TABLE \`users\` ADD \`model_access\` text DEFAULT 'all';`,
  );
}

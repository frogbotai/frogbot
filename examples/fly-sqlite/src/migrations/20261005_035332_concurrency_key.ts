import { MigrateUpArgs, MigrateDownArgs, sql } from '@frogbotai/db-sqlite';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`payload_jobs\` ADD \`concurrency_key\` text;`);
  await db.run(
    sql`CREATE INDEX \`payload_jobs_concurrency_key_idx\` ON \`payload_jobs\` (\`concurrency_key\`);`,
  );
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`payload_jobs_concurrency_key_idx\`;`);
  await db.run(
    sql`ALTER TABLE \`payload_jobs\` DROP COLUMN \`concurrency_key\`;`,
  );
}

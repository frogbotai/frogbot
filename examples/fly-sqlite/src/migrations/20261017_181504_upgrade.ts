import { MigrateUpArgs, MigrateDownArgs, sql } from '@frogbotai/db-sqlite';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`users_rels_order_idx\` ON \`users_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_rels_parent_idx\` ON \`users_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_rels_path_idx\` ON \`users_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_rels_users_id_idx\` ON \`users_rels\` (\`users_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_llm_instructions\` (
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`entity_slug\` text NOT NULL,
  	\`entity_type\` text NOT NULL,
  	\`additional_instructions\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_entity_slug_idx\` ON \`payload_llm_instructions\` (\`entity_slug\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_updated_at_idx\` ON \`payload_llm_instructions\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_created_at_idx\` ON \`payload_llm_instructions\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_llm_instructions_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_llm_instructions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_rels_order_idx\` ON \`payload_llm_instructions_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_rels_parent_idx\` ON \`payload_llm_instructions_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_rels_path_idx\` ON \`payload_llm_instructions_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_rels_users_id_idx\` ON \`payload_llm_instructions_rels\` (\`users_id\`);`,
  );
  await db.run(sql`DROP INDEX \`payload_jobs_processing_idx\`;`);
  await db.run(sql`DROP INDEX \`payload_jobs_lease_until_idx\`;`);
  await db.run(
    sql`ALTER TABLE \`payload_jobs\` ADD \`processing_until\` text;`,
  );
  await db.run(
    sql`ALTER TABLE \`payload_jobs\` ADD \`processing_token\` text;`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_processing_until_idx\` ON \`payload_jobs\` (\`processing_until\`);`,
  );
  await db.run(sql`ALTER TABLE \`payload_jobs\` DROP COLUMN \`processing\`;`);
  await db.run(sql`ALTER TABLE \`payload_jobs\` DROP COLUMN \`lease_until\`;`);
  await db.run(sql`ALTER TABLE \`payload_jobs\` DROP COLUMN \`lease_owner\`;`);
  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_payload_jobs_log\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`executed_at\` text NOT NULL,
  	\`completed_at\` text NOT NULL,
  	\`task_slug\` text NOT NULL,
  	\`task_i_d\` text NOT NULL,
  	\`input\` text NOT NULL,
  	\`output\` text,
  	\`state\` text NOT NULL,
  	\`error\` text,
  	\`parent_task_slug\` text,
  	\`parent_task_i_d\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`payload_jobs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  // Workaround: https://github.com/drizzle-team/drizzle-orm/issues/1313
  await db.run(
    sql`INSERT INTO \`__new_payload_jobs_log\`("_order", "_parent_id", "id", "executed_at", "completed_at", "task_slug", "task_i_d", "input", "output", "state", "error") SELECT "_order", "_parent_id", "id", "executed_at", "completed_at", "task_slug", "task_i_d", "input", "output", "state", "error" FROM \`payload_jobs_log\`;`,
  );
  await db.run(sql`DROP TABLE \`payload_jobs_log\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_payload_jobs_log\` RENAME TO \`payload_jobs_log\`;`,
  );
  await db.run(sql`PRAGMA foreign_keys=ON;`);
  await db.run(
    sql`CREATE INDEX \`payload_jobs_log_order_idx\` ON \`payload_jobs_log\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_log_parent_id_idx\` ON \`payload_jobs_log\` (\`_parent_id\`);`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` ADD \`original_filename\` text;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` ADD \`original_url\` text;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` ADD \`original_mime_type\` text;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` ADD \`original_filesize\` numeric;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` ADD \`original_width\` numeric;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` ADD \`original_height\` numeric;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` ADD \`original_prefix\` text;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` ADD \`original__objectkey\` text;`,
  );
  await db.run(
    sql`CREATE INDEX \`frogbot_chat_assets_original_original_filename_idx\` ON \`frogbot_chat_assets\` (\`original_filename\`);`,
  );
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`users_rels\`;`);
  await db.run(sql`DROP TABLE \`payload_llm_instructions\`;`);
  await db.run(sql`DROP TABLE \`payload_llm_instructions_rels\`;`);
  await db.run(
    sql`DROP INDEX \`frogbot_chat_assets_original_original_filename_idx\`;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` DROP COLUMN \`original_filename\`;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` DROP COLUMN \`original_url\`;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` DROP COLUMN \`original_mime_type\`;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` DROP COLUMN \`original_filesize\`;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` DROP COLUMN \`original_width\`;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` DROP COLUMN \`original_height\`;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` DROP COLUMN \`original_prefix\`;`,
  );
  await db.run(
    sql`ALTER TABLE \`frogbot_chat_assets\` DROP COLUMN \`original__objectkey\`;`,
  );
  await db.run(sql`DROP INDEX \`payload_jobs_processing_until_idx\`;`);
  await db.run(
    sql`ALTER TABLE \`payload_jobs\` ADD \`processing\` integer DEFAULT false;`,
  );
  await db.run(sql`ALTER TABLE \`payload_jobs\` ADD \`lease_until\` text;`);
  await db.run(sql`ALTER TABLE \`payload_jobs\` ADD \`lease_owner\` text;`);
  await db.run(
    sql`CREATE INDEX \`payload_jobs_processing_idx\` ON \`payload_jobs\` (\`processing\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_lease_until_idx\` ON \`payload_jobs\` (\`lease_until\`);`,
  );
  await db.run(
    sql`ALTER TABLE \`payload_jobs\` DROP COLUMN \`processing_until\`;`,
  );
  await db.run(
    sql`ALTER TABLE \`payload_jobs\` DROP COLUMN \`processing_token\`;`,
  );
  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_payload_jobs_log\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`executed_at\` text NOT NULL,
  	\`completed_at\` text NOT NULL,
  	\`task_slug\` text NOT NULL,
  	\`task_i_d\` text NOT NULL,
  	\`input\` text,
  	\`output\` text,
  	\`state\` text NOT NULL,
  	\`error\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`payload_jobs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_payload_jobs_log\`("_order", "_parent_id", "id", "executed_at", "completed_at", "task_slug", "task_i_d", "input", "output", "state", "error") SELECT "_order", "_parent_id", "id", "executed_at", "completed_at", "task_slug", "task_i_d", "input", "output", "state", "error" FROM \`payload_jobs_log\`;`,
  );
  await db.run(sql`DROP TABLE \`payload_jobs_log\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_payload_jobs_log\` RENAME TO \`payload_jobs_log\`;`,
  );
  await db.run(sql`PRAGMA foreign_keys=ON;`);
  await db.run(
    sql`CREATE INDEX \`payload_jobs_log_order_idx\` ON \`payload_jobs_log\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_log_parent_id_idx\` ON \`payload_jobs_log\` (\`_parent_id\`);`,
  );
}

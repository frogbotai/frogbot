import { MigrateUpArgs, MigrateDownArgs, sql } from '@frogbotai/db-sqlite';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`plugin_ai_policy_spend\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`period\` text NOT NULL,
  	\`amount\` numeric DEFAULT 0 NOT NULL,
  	\`user_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX \`plugin_ai_policy_spend_key_idx\` ON \`plugin_ai_policy_spend\` (\`key\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`plugin_ai_policy_spend_user_idx\` ON \`plugin_ai_policy_spend\` (\`user_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`plugin_ai_policy_spend_updated_at_idx\` ON \`plugin_ai_policy_spend\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`plugin_ai_policy_spend_created_at_idx\` ON \`plugin_ai_policy_spend\` (\`created_at\`);`,
  );
  await db.run(
    sql`ALTER TABLE \`users_sessions\` ADD \`refresh_count\` numeric;`,
  );
  await db.run(sql`ALTER TABLE \`users_sessions\` ADD \`refreshed_at\` text;`);
  await db.run(
    sql`ALTER TABLE \`users\` ADD \`spend_counter_id\` integer REFERENCES plugin_ai_policy_spend(id);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_spend_counter_idx\` ON \`users\` (\`spend_counter_id\`);`,
  );
  await db.run(
    sql`ALTER TABLE \`users\` DROP COLUMN \`spend_this_period_u_s_d\`;`,
  );
  await db.run(
    sql`ALTER TABLE \`chats\` ADD \`auto_approve\` integer DEFAULT false;`,
  );
  await db.run(
    sql`ALTER TABLE \`messages\` ADD \`usage_last_step_input_tokens\` numeric;`,
  );
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`plugin_ai_policy_spend_id\` integer REFERENCES plugin_ai_policy_spend(id);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_plugin_ai_policy_spend_id_idx\` ON \`payload_locked_documents_rels\` (\`plugin_ai_policy_spend_id\`);`,
  );
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_users\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`monthly_budget\` numeric,
  	\`spend_this_period_u_s_d\` numeric DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`reset_password_requested_at\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_users\`("id", "name", "monthly_budget", "spend_this_period_u_s_d", "updated_at", "created_at", "email", "reset_password_token", "reset_password_expiration", "salt", "hash", "reset_password_requested_at", "login_attempts", "lock_until") SELECT "id", "name", "monthly_budget", "spend_this_period_u_s_d", "updated_at", "created_at", "email", "reset_password_token", "reset_password_expiration", "salt", "hash", "reset_password_requested_at", "login_attempts", "lock_until" FROM \`users\`;`,
  );
  await db.run(sql`DROP TABLE \`users\`;`);
  await db.run(sql`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`);
  await db.run(sql`PRAGMA foreign_keys=ON;`);
  await db.run(
    sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`,
  );
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`chats_id\` integer,
  	\`messages_id\` text,
  	\`frogbot_chat_assets_id\` integer,
  	\`frogbot_chat_turns_id\` text,
  	\`usage_logs_id\` integer,
  	\`frogbot_waitpoints_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`chats_id\`) REFERENCES \`chats\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`messages_id\`) REFERENCES \`messages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`frogbot_chat_assets_id\`) REFERENCES \`frogbot_chat_assets\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`frogbot_chat_turns_id\`) REFERENCES \`frogbot_chat_turns\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`usage_logs_id\`) REFERENCES \`usage_logs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`frogbot_waitpoints_id\`) REFERENCES \`frogbot_waitpoints\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "chats_id", "messages_id", "frogbot_chat_assets_id", "frogbot_chat_turns_id", "usage_logs_id", "frogbot_waitpoints_id") SELECT "id", "order", "parent_id", "path", "users_id", "chats_id", "messages_id", "frogbot_chat_assets_id", "frogbot_chat_turns_id", "usage_logs_id", "frogbot_waitpoints_id" FROM \`payload_locked_documents_rels\`;`,
  );
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_chats_id_idx\` ON \`payload_locked_documents_rels\` (\`chats_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_messages_id_idx\` ON \`payload_locked_documents_rels\` (\`messages_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_frogbot_chat_assets_id_idx\` ON \`payload_locked_documents_rels\` (\`frogbot_chat_assets_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_frogbot_chat_turns_id_idx\` ON \`payload_locked_documents_rels\` (\`frogbot_chat_turns_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_usage_logs_id_idx\` ON \`payload_locked_documents_rels\` (\`usage_logs_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_frogbot_waitpoints_id_idx\` ON \`payload_locked_documents_rels\` (\`frogbot_waitpoints_id\`);`,
  );
  await db.run(
    sql`ALTER TABLE \`users_sessions\` DROP COLUMN \`refresh_count\`;`,
  );
  await db.run(
    sql`ALTER TABLE \`users_sessions\` DROP COLUMN \`refreshed_at\`;`,
  );
  await db.run(sql`ALTER TABLE \`chats\` DROP COLUMN \`auto_approve\`;`);
  await db.run(
    sql`ALTER TABLE \`messages\` DROP COLUMN \`usage_last_step_input_tokens\`;`,
  );
  await db.run(sql`DROP TABLE \`plugin_ai_policy_spend\`;`);
}

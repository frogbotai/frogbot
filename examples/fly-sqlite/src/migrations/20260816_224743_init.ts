import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users_sessions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`created_at\` text,
  	\`expires_at\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`users_sessions_order_idx\` ON \`users_sessions\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_sessions_parent_id_idx\` ON \`users_sessions\` (\`_parent_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`users\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text
  );
  `);
  await db.run(
    sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`,
  );
  await db.run(sql`CREATE TABLE \`threads\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`user_id\` integer,
  	\`agent\` text,
  	\`last_message_at\` text,
  	\`todos\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`threads_user_idx\` ON \`threads\` (\`user_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`threads_agent_idx\` ON \`threads\` (\`agent\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`threads_last_message_at_idx\` ON \`threads\` (\`last_message_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`threads_updated_at_idx\` ON \`threads\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`threads_created_at_idx\` ON \`threads\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`threads_deleted_at_idx\` ON \`threads\` (\`deleted_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`messages\` (
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`thread_id\` integer NOT NULL,
  	\`role\` text NOT NULL,
  	\`parts\` text NOT NULL,
  	\`metadata\` text,
  	\`usage_input_tokens\` numeric,
  	\`usage_output_tokens\` numeric,
  	\`usage_total_tokens\` numeric,
  	\`usage_reasoning_tokens\` numeric,
  	\`usage_cached_input_tokens\` numeric,
  	\`usage_model\` text,
  	\`usage_provider\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	FOREIGN KEY (\`thread_id\`) REFERENCES \`threads\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`messages_thread_idx\` ON \`messages\` (\`thread_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`messages_updated_at_idx\` ON \`messages\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`messages_created_at_idx\` ON \`messages\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`messages_deleted_at_idx\` ON \`messages\` (\`deleted_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`usage_logs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`user_id\` integer,
  	\`thread_id\` integer,
  	\`request_id\` text NOT NULL,
  	\`run_id\` text,
  	\`model\` text NOT NULL,
  	\`operation\` text NOT NULL,
  	\`input_tokens\` numeric DEFAULT 0 NOT NULL,
  	\`output_tokens\` numeric DEFAULT 0 NOT NULL,
  	\`cached_input_tokens\` numeric,
  	\`cache_write_tokens\` numeric,
  	\`reasoning_tokens\` numeric,
  	\`total_tokens\` numeric DEFAULT 0 NOT NULL,
  	\`cost_u_s_d\` numeric DEFAULT 0 NOT NULL,
  	\`finish_reason\` text,
  	\`requested_at\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`thread_id\`) REFERENCES \`threads\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`usage_logs_user_idx\` ON \`usage_logs\` (\`user_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`usage_logs_thread_idx\` ON \`usage_logs\` (\`thread_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`usage_logs_request_id_idx\` ON \`usage_logs\` (\`request_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`usage_logs_run_id_idx\` ON \`usage_logs\` (\`run_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`usage_logs_model_idx\` ON \`usage_logs\` (\`model\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`usage_logs_requested_at_idx\` ON \`usage_logs\` (\`requested_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`usage_logs_updated_at_idx\` ON \`usage_logs\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`usage_logs_created_at_idx\` ON \`usage_logs\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`files\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`folder_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	FOREIGN KEY (\`folder_id\`) REFERENCES \`payload_folders\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`files_folder_idx\` ON \`files\` (\`folder_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`files_updated_at_idx\` ON \`files\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`files_created_at_idx\` ON \`files\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`files_deleted_at_idx\` ON \`files\` (\`deleted_at\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`files_filename_idx\` ON \`files\` (\`filename\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL
  );
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_folders_folder_type\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_folders\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_folders_folder_type_order_idx\` ON \`payload_folders_folder_type\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_folders_folder_type_parent_idx\` ON \`payload_folders_folder_type\` (\`parent_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_folders\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`folder_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`folder_id\`) REFERENCES \`payload_folders\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_folders_name_idx\` ON \`payload_folders\` (\`name\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_folders_folder_idx\` ON \`payload_folders\` (\`folder_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_folders_updated_at_idx\` ON \`payload_folders\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_folders_created_at_idx\` ON \`payload_folders\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`global_slug\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`threads_id\` integer,
  	\`messages_id\` text,
  	\`usage_logs_id\` integer,
  	\`files_id\` integer,
  	\`payload_folders_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`threads_id\`) REFERENCES \`threads\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`messages_id\`) REFERENCES \`messages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`usage_logs_id\`) REFERENCES \`usage_logs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`files_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`payload_folders_id\`) REFERENCES \`payload_folders\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
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
    sql`CREATE INDEX \`payload_locked_documents_rels_threads_id_idx\` ON \`payload_locked_documents_rels\` (\`threads_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_messages_id_idx\` ON \`payload_locked_documents_rels\` (\`messages_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_usage_logs_id_idx\` ON \`payload_locked_documents_rels\` (\`usage_logs_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_files_id_idx\` ON \`payload_locked_documents_rels\` (\`files_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_payload_folders_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_folders_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text,
  	\`value\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_users_id_idx\` ON \`payload_preferences_rels\` (\`users_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`batch\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`,
  );
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`users_sessions\`;`);
  await db.run(sql`DROP TABLE \`users\`;`);
  await db.run(sql`DROP TABLE \`threads\`;`);
  await db.run(sql`DROP TABLE \`messages\`;`);
  await db.run(sql`DROP TABLE \`usage_logs\`;`);
  await db.run(sql`DROP TABLE \`files\`;`);
  await db.run(sql`DROP TABLE \`payload_kv\`;`);
  await db.run(sql`DROP TABLE \`payload_folders_folder_type\`;`);
  await db.run(sql`DROP TABLE \`payload_folders\`;`);
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`);
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`);
  await db.run(sql`DROP TABLE \`payload_preferences\`;`);
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`);
  await db.run(sql`DROP TABLE \`payload_migrations\`;`);
}

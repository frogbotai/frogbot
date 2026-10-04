import { MigrateUpArgs, MigrateDownArgs, sql } from '@frogbotai/db-sqlite';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users_models\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`users_models_order_idx\` ON \`users_models\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_models_parent_idx\` ON \`users_models\` (\`parent_id\`);`,
  );
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
  	\`model_access\` text DEFAULT 'all',
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
    sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`,
  );
  await db.run(sql`CREATE TABLE \`chats\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`user_id\` integer,
  	\`agent\` text,
  	\`channel\` text,
  	\`external_id\` text,
  	\`channel_key\` text,
  	\`channel_thread\` text,
  	\`last_message_at\` text,
  	\`todos\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`chats_user_idx\` ON \`chats\` (\`user_id\`);`,
  );
  await db.run(sql`CREATE INDEX \`chats_agent_idx\` ON \`chats\` (\`agent\`);`);
  await db.run(
    sql`CREATE INDEX \`chats_channel_idx\` ON \`chats\` (\`channel\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`chats_external_id_idx\` ON \`chats\` (\`external_id\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`chats_channel_key_idx\` ON \`chats\` (\`channel_key\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`chats_last_message_at_idx\` ON \`chats\` (\`last_message_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`chats_updated_at_idx\` ON \`chats\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`chats_created_at_idx\` ON \`chats\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`chats_deleted_at_idx\` ON \`chats\` (\`deleted_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`messages\` (
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`chat_id\` integer NOT NULL,
  	\`role\` text NOT NULL,
  	\`parts\` text NOT NULL,
  	\`metadata\` text,
  	\`status\` text DEFAULT 'active',
  	\`delivery\` text,
  	\`model\` text,
  	\`reasoning\` text,
  	\`author\` text,
  	\`settlements\` text,
  	\`version\` numeric DEFAULT 0,
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
  	FOREIGN KEY (\`chat_id\`) REFERENCES \`chats\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`messages_chat_idx\` ON \`messages\` (\`chat_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`messages_status_idx\` ON \`messages\` (\`status\`);`,
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
  await db.run(sql`CREATE TABLE \`frogbot_chat_assets\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`owner_id\` integer,
  	\`chat_id\` integer,
  	\`sha256\` text,
  	\`text\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`chat_id\`) REFERENCES \`chats\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`frogbot_chat_assets_owner_idx\` ON \`frogbot_chat_assets\` (\`owner_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`frogbot_chat_assets_chat_idx\` ON \`frogbot_chat_assets\` (\`chat_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`frogbot_chat_assets_updated_at_idx\` ON \`frogbot_chat_assets\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`frogbot_chat_assets_created_at_idx\` ON \`frogbot_chat_assets\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`frogbot_chat_assets_filename_idx\` ON \`frogbot_chat_assets\` (\`filename\`);`,
  );
  await db.run(sql`CREATE TABLE \`frogbot_chat_turns\` (
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`state\` text DEFAULT 'idle' NOT NULL,
  	\`attempt\` text,
  	\`lease_until\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`frogbot_chat_turns_updated_at_idx\` ON \`frogbot_chat_turns\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`frogbot_chat_turns_created_at_idx\` ON \`frogbot_chat_turns\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`usage_logs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`user_id\` integer,
  	\`chat_id\` integer,
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
  	FOREIGN KEY (\`chat_id\`) REFERENCES \`chats\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`usage_logs_user_idx\` ON \`usage_logs\` (\`user_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`usage_logs_chat_idx\` ON \`usage_logs\` (\`chat_id\`);`,
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
  await db.run(sql`CREATE TABLE \`frogbot_waitpoints\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`job_id\` text NOT NULL,
  	\`holder_id\` integer,
  	\`name\` text NOT NULL,
  	\`token\` text NOT NULL,
  	\`kind\` text NOT NULL,
  	\`ready\` integer DEFAULT false NOT NULL,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`expires_at\` text,
  	\`until\` text,
  	\`data\` text,
  	\`dispatched\` integer DEFAULT false NOT NULL,
  	\`dispatch_owner\` text,
  	\`dispatch_lease_until\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`holder_id\`) REFERENCES \`payload_jobs\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`frogbot_waitpoints_holder_idx\` ON \`frogbot_waitpoints\` (\`holder_id\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`frogbot_waitpoints_token_idx\` ON \`frogbot_waitpoints\` (\`token\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`frogbot_waitpoints_expires_at_idx\` ON \`frogbot_waitpoints\` (\`expires_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`frogbot_waitpoints_updated_at_idx\` ON \`frogbot_waitpoints\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`frogbot_waitpoints_created_at_idx\` ON \`frogbot_waitpoints\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`jobId_name_idx\` ON \`frogbot_waitpoints\` (\`job_id\`,\`name\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`ready_dispatched_status_idx\` ON \`frogbot_waitpoints\` (\`ready\`,\`dispatched\`,\`status\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL,
  	\`expires_at\` text
  );
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_kv_expires_at_idx\` ON \`payload_kv\` (\`expires_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_jobs_log\` (
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
    sql`CREATE INDEX \`payload_jobs_log_order_idx\` ON \`payload_jobs_log\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_log_parent_id_idx\` ON \`payload_jobs_log\` (\`_parent_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_jobs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`input\` text,
  	\`completed_at\` text,
  	\`total_tried\` numeric DEFAULT 0,
  	\`has_error\` integer DEFAULT false,
  	\`error\` text,
  	\`task_slug\` text,
  	\`queue\` text DEFAULT 'default',
  	\`wait_until\` text,
  	\`processing\` integer DEFAULT false,
  	\`meta\` text,
  	\`job_id\` text,
  	\`lease_until\` text,
  	\`lease_owner\` text,
  	\`waitpoint\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_jobs_completed_at_idx\` ON \`payload_jobs\` (\`completed_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_total_tried_idx\` ON \`payload_jobs\` (\`total_tried\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_has_error_idx\` ON \`payload_jobs\` (\`has_error\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_task_slug_idx\` ON \`payload_jobs\` (\`task_slug\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_queue_idx\` ON \`payload_jobs\` (\`queue\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_wait_until_idx\` ON \`payload_jobs\` (\`wait_until\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_processing_idx\` ON \`payload_jobs\` (\`processing\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_lease_until_idx\` ON \`payload_jobs\` (\`lease_until\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_updated_at_idx\` ON \`payload_jobs\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_created_at_idx\` ON \`payload_jobs\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`payload_jobs_job_id_live_idx\` ON \`payload_jobs\` (\`job_id\`) WHERE "payload_jobs"."job_id" is not null and "payload_jobs"."completed_at" is null and coalesce("payload_jobs"."has_error", 0) = 0;`,
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
  await db.run(sql`CREATE TABLE \`payload_jobs_stats\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`stats\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`users_models\`;`);
  await db.run(sql`DROP TABLE \`users_sessions\`;`);
  await db.run(sql`DROP TABLE \`users\`;`);
  await db.run(sql`DROP TABLE \`chats\`;`);
  await db.run(sql`DROP TABLE \`messages\`;`);
  await db.run(sql`DROP TABLE \`frogbot_chat_assets\`;`);
  await db.run(sql`DROP TABLE \`frogbot_chat_turns\`;`);
  await db.run(sql`DROP TABLE \`usage_logs\`;`);
  await db.run(sql`DROP TABLE \`frogbot_waitpoints\`;`);
  await db.run(sql`DROP TABLE \`payload_kv\`;`);
  await db.run(sql`DROP TABLE \`payload_jobs_log\`;`);
  await db.run(sql`DROP TABLE \`payload_jobs\`;`);
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`);
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`);
  await db.run(sql`DROP TABLE \`payload_preferences\`;`);
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`);
  await db.run(sql`DROP TABLE \`payload_migrations\`;`);
  await db.run(sql`DROP TABLE \`payload_jobs_stats\`;`);
}

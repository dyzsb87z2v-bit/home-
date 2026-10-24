CREATE TYPE "public"."application_status" AS ENUM('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'SUBMITTED_MANUALLY', 'FAILED', 'UNCERTAIN', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."automation_mode" AS ENUM('DISCOVERY', 'DRAFTING', 'AUTO_APPLY');--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('AVAILABLE', 'UNAVAILABLE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."submission_channel" AS ENUM('EMAIL', 'PORTAL_API', 'MANUAL', 'TEST');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('CONNECTED', 'EXPIRED', 'ERROR', 'DISCONNECTED');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('INBOUND', 'OUTBOUND');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('PAYSLIP', 'EMPLOYMENT_CONTRACT', 'SCHUFA', 'RENT_DEBT_FREE_CERTIFICATE', 'TENANT_SELF_DISCLOSURE', 'IDENTIFICATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."eligibility" AS ENUM('ELIGIBLE', 'INELIGIBLE', 'NEEDS_VERIFICATION');--> statement-breakpoint
CREATE TYPE "public"."email_provider" AS ENUM('GMAIL', 'TEST');--> statement-breakpoint
CREATE TYPE "public"."integration_method" AS ENUM('OFFICIAL_API', 'PARTNER_API', 'FEED', 'RSS', 'EMAIL_ALERTS', 'PUBLIC_RETRIEVAL', 'MANUAL_IMPORT', 'BROWSER_ASSISTED', 'TEST_PROVIDER');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('fa', 'de');--> statement-breakpoint
CREATE TYPE "public"."location_precision" AS ENUM('EXACT', 'APPROXIMATE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."log_result" AS ENUM('SUCCESS', 'FAILURE', 'INFO', 'WARNING');--> statement-breakpoint
CREATE TYPE "public"."operational_state" AS ENUM('CONNECTED', 'ALERTS_ONLY', 'PARTIALLY_CONNECTED', 'MANUAL_ONLY', 'UNAVAILABLE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('APARTMENT', 'ROOM', 'SHARED_APARTMENT', 'HOLIDAY', 'DORMITORY', 'HOTEL', 'OTHER', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."rental_duration" AS ENUM('LONG_TERM', 'TEMPORARY', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."reply_category" AS ENUM('APPLICATION_RECEIVED', 'VIEWING_INVITATION', 'MORE_INFO_REQUESTED', 'DOCUMENT_REQUEST', 'REJECTED', 'APARTMENT_RENTED', 'ALTERNATIVE_SUGGESTED', 'FOLLOW_UP_NEEDED', 'SUSPICIOUS', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."source_category" AS ENUM('PORTAL', 'PUBLIC_HOUSING', 'PRIVATE_COMPANY', 'COOPERATIVE', 'AGGREGATOR', 'TEMPORARY_FURNISHED', 'ALERT_SERVICE', 'PROPERTY_MANAGER');--> statement-breakpoint
CREATE TYPE "public"."submission_capability" AS ENUM('EMAIL', 'PORTAL_API', 'PORTAL_FORM_MANUAL', 'NONE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."tri_state" AS ENUM('YES', 'NO', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."viewing_status" AS ENUM('PROPOSED', 'ACCEPTED_BY_USER', 'DECLINED', 'PAST');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"result" "log_result" NOT NULL,
	"property_id" uuid,
	"source_id" uuid,
	"application_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_micro_usd" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applicant_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"contact_email" text,
	"phone" text,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schufa_available" "tri_state" DEFAULT 'UNKNOWN' NOT NULL,
	"private_notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applicant_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"channel" "submission_channel" NOT NULL,
	"recipient" text NOT NULL,
	"recipient_normalized" text NOT NULL,
	"email_account_id" uuid,
	"status" "application_status" DEFAULT 'DRAFT' NOT NULL,
	"subject" text NOT NULL,
	"body_de" text NOT NULL,
	"body_fa" text,
	"generated_by" text DEFAULT 'TEMPLATE' NOT NULL,
	"validation" jsonb,
	"idempotency_key" text NOT NULL,
	"provider_message_id" text,
	"provider_thread_id" text,
	"submitted_content" jsonb,
	"submitted_at" timestamp with time zone,
	"last_error" text,
	"auto_submitted" boolean DEFAULT false NOT NULL,
	"follow_up_count" integer DEFAULT 0 NOT NULL,
	"last_follow_up_at" timestamp with time zone,
	"closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"ip" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "document_type" NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"encrypted_data" "bytea" NOT NULL,
	"retention_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "email_provider" NOT NULL,
	"email_address" text NOT NULL,
	"encrypted_refresh_token" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "connection_status" DEFAULT 'CONNECTED' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"provider_message_id" text NOT NULL,
	"direction" "direction" NOT NULL,
	"from_address" text,
	"to_address" text,
	"subject" text,
	"body_text" text,
	"body_fa" text,
	"is_listing_alert" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_thread_id" text NOT NULL,
	"application_id" uuid,
	"property_id" uuid,
	"subject" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"body_de" text NOT NULL,
	"body_fa" text,
	"status" "application_status" DEFAULT 'DRAFT' NOT NULL,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"adults" integer NOT NULL,
	"children" integer NOT NULL,
	"child_ages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"monthly_net_income_eur" integer,
	"income_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "households_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "landlord_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"application_id" uuid,
	"category" "reply_category" NOT NULL,
	"confidence" double precision NOT NULL,
	"summary_fa" text,
	"suggested_action" text,
	"suspicious" boolean DEFAULT false NOT NULL,
	"suspicious_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"classified_by" text NOT NULL,
	"handled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landlord_replies_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link" text,
	"delivered_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"title" text,
	"description_de" text,
	"description_fa" text,
	"street" text,
	"house_number" text,
	"postal_code" text,
	"neighborhood" text,
	"district" text,
	"city" text,
	"latitude" double precision,
	"longitude" double precision,
	"location_precision" "location_precision" DEFAULT 'UNKNOWN' NOT NULL,
	"rooms" double precision,
	"area_sqm" double precision,
	"cold_rent_eur" double precision,
	"warm_rent_eur" double precision,
	"service_charges_eur" double precision,
	"heating_costs_eur" double precision,
	"heating_included" boolean,
	"other_costs_eur" double precision,
	"deposit_text" text,
	"furnished" boolean,
	"kitchen" boolean,
	"balcony" boolean,
	"terrace" boolean,
	"elevator" boolean,
	"floor" text,
	"accessible" boolean,
	"available_from" date,
	"available_from_text" text,
	"rental_duration" "rental_duration" DEFAULT 'UNKNOWN' NOT NULL,
	"wbs_required" boolean,
	"cooperative_membership" text,
	"property_type" "property_type" DEFAULT 'UNKNOWN' NOT NULL,
	"landlord_name" text,
	"contact_email" text,
	"contact_method" text,
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone,
	"availability" "availability" DEFAULT 'UNKNOWN' NOT NULL,
	"eligibility" "eligibility" DEFAULT 'NEEDS_VERIFICATION' NOT NULL,
	"score" integer,
	"saved" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"eligibility" "eligibility" NOT NULL,
	"reasons" jsonb NOT NULL,
	"score" integer,
	"score_breakdown" jsonb,
	"criteria" jsonb NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"source_id" uuid
);
--> statement-breakpoint
CREATE TABLE "property_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_listing_id" text,
	"url" text,
	"canonical_url" text,
	"raw" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "rental_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"category" "source_category" NOT NULL,
	"coverage" text DEFAULT 'Berlin' NOT NULL,
	"integration_methods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submission_capability" "submission_capability" DEFAULT 'UNKNOWN' NOT NULL,
	"operational_state" "operational_state" DEFAULT 'MANUAL_ONLY' NOT NULL,
	"min_interval_minutes" integer DEFAULT 60 NOT NULL,
	"exists_verified" boolean,
	"verification_note" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "search_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"district" text DEFAULT 'Spandau' NOT NULL,
	"max_warm_rent_eur" integer DEFAULT 1200 NOT NULL,
	"min_rooms" double precision DEFAULT 3 NOT NULL,
	"min_area_sqm" double precision DEFAULT 50 NOT NULL,
	"require_entire_apartment" boolean DEFAULT true NOT NULL,
	"exclude_wbs" boolean DEFAULT true NOT NULL,
	"long_term_only" boolean DEFAULT true NOT NULL,
	"move_in" text DEFAULT 'ASAP' NOT NULL,
	"automation_mode" "automation_mode" DEFAULT 'DISCOVERY' NOT NULL,
	"auto_apply_enabled" boolean DEFAULT false NOT NULL,
	"auto_apply_authorization" jsonb,
	"follow_up_after_days" integer DEFAULT 5 NOT NULL,
	"max_follow_ups" integer DEFAULT 1 NOT NULL,
	"auto_follow_up" boolean DEFAULT false NOT NULL,
	"notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "source_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"adapter" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" "operational_state" DEFAULT 'MANUAL_ONLY' NOT NULL,
	"auth_state" text DEFAULT 'NOT_REQUIRED' NOT NULL,
	"interval_minutes" integer DEFAULT 60 NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"listings_found" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" "sync_status" DEFAULT 'RUNNING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"locale" "locale" DEFAULT 'fa' NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "viewing_appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid,
	"reply_id" uuid,
	"proposed_at" timestamp with time zone,
	"proposed_text" text,
	"location" text,
	"status" "viewing_status" DEFAULT 'PROPOSED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "viewing_appointments_reply_id_unique" UNIQUE("reply_id")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_source_id_rental_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."rental_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_profiles" ADD CONSTRAINT "applicant_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_email_account_id_email_accounts_id_fk" FOREIGN KEY ("email_account_id") REFERENCES "public"."email_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_replies" ADD CONSTRAINT "landlord_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_replies" ADD CONSTRAINT "landlord_replies_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_replies" ADD CONSTRAINT "landlord_replies_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_evaluations" ADD CONSTRAINT "property_evaluations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_source_id_rental_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."rental_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_source_links" ADD CONSTRAINT "property_source_links_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_source_links" ADD CONSTRAINT "property_source_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_source_links" ADD CONSTRAINT "property_source_links_source_id_rental_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."rental_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_preferences" ADD CONSTRAINT "search_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_connections" ADD CONSTRAINT "source_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_connections" ADD CONSTRAINT "source_connections_source_id_rental_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."rental_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_sync_jobs" ADD CONSTRAINT "source_sync_jobs_connection_id_source_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."source_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewing_appointments" ADD CONSTRAINT "viewing_appointments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewing_appointments" ADD CONSTRAINT "viewing_appointments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewing_appointments" ADD CONSTRAINT "viewing_appointments_reply_id_landlord_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."landlord_replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_at_idx" ON "activity_logs" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "ai_usage_at_idx" ON "ai_usage" USING btree ("at");--> statement-breakpoint
CREATE INDEX "app_events_app_idx" ON "application_events" USING btree ("application_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_property_recipient" ON "applications" USING btree ("user_id","property_id","recipient_normalized");--> statement-breakpoint
CREATE INDEX "applications_user_status_idx" ON "applications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "audit_user_at_idx" ON "audit_logs" USING btree ("user_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_rules_user_type" ON "automation_rules" USING btree ("user_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "email_accounts_user_addr" ON "email_accounts" USING btree ("user_id","provider","email_address");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_thread_msg" ON "email_messages" USING btree ("thread_id","provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_threads_account_thread" ON "email_threads" USING btree ("account_id","provider_thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "follow_ups_app_seq" ON "follow_ups" USING btree ("application_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_user_fingerprint" ON "properties" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "properties_user_elig_idx" ON "properties" USING btree ("user_id","eligibility","score");--> statement-breakpoint
CREATE INDEX "properties_user_seen_idx" ON "properties" USING btree ("user_id","first_seen_at");--> statement-breakpoint
CREATE INDEX "evaluations_property_idx" ON "property_evaluations" USING btree ("property_id","evaluated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "photos_property_url" ON "property_photos" USING btree ("property_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "psl_user_source_listing" ON "property_source_links" USING btree ("user_id","source_id","source_listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "psl_user_canonical_url" ON "property_source_links" USING btree ("user_id","canonical_url");--> statement-breakpoint
CREATE INDEX "psl_property_idx" ON "property_source_links" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_conn_user_source_adapter" ON "source_connections" USING btree ("user_id","source_id","adapter");--> statement-breakpoint
CREATE INDEX "sync_jobs_conn_idx" ON "source_sync_jobs" USING btree ("connection_id","started_at");
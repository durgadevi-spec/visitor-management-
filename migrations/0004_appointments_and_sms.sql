CREATE TABLE "appointments" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "appointment_number" text NOT NULL,
  "created_by" integer NOT NULL,
  "visitor_name" text NOT NULL,
  "mobile" text NOT NULL,
  "email" text NOT NULL,
  "company" text NOT NULL,
  "scheduled_at" timestamptz NOT NULL,
  "timezone" text NOT NULL,
  "purpose" text NOT NULL,
  "meeting_person" text NOT NULL,
  "meeting_person_id" integer,
  "department" text NOT NULL,
  "notes" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'pending',
  "registration_token_hash" text NOT NULL UNIQUE,
  "registration_expires_at" timestamptz NOT NULL,
  "submitted_at" timestamptz,
  "reviewed_by" integer,
  "reviewed_at" timestamptz,
  "admin_remarks" text,
  "cancellation_reason" text,
  "reschedule_reason" text,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "appointments_org_number_unique" ON "appointments" ("organization_id", "appointment_number");
CREATE INDEX "appointments_org_scheduled_idx" ON "appointments" ("organization_id", "scheduled_at");
CREATE INDEX "appointments_org_status_idx" ON "appointments" ("organization_id", "status");

ALTER TABLE "visitors"
  ADD COLUMN "appointment_id" text REFERENCES "appointments"("id") ON DELETE SET NULL;
CREATE UNIQUE INDEX "visitors_appointment_id_unique" ON "visitors" ("appointment_id");

CREATE TABLE "appointment_submissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "appointment_id" text NOT NULL UNIQUE REFERENCES "appointments"("id") ON DELETE CASCADE,
  "full_name" text NOT NULL,
  "mobile" text NOT NULL,
  "email" text NOT NULL,
  "company" text NOT NULL,
  "full_address" text NOT NULL,
  "id_proof_type" text NOT NULL,
  "id_proof_number" text NOT NULL,
  "purpose" text NOT NULL,
  "meeting_person" text NOT NULL,
  "department" text NOT NULL,
  "additional_information" text NOT NULL DEFAULT '',
  "photo_url" text NOT NULL,
  "submitted_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "appointment_submissions_org_submitted_idx" ON "appointment_submissions" ("organization_id", "submitted_at");

CREATE TABLE "appointment_passes" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "appointment_id" text NOT NULL REFERENCES "appointments"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "visitor_pass_number" text NOT NULL,
  "valid_from" timestamptz NOT NULL,
  "valid_until" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_by" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "appointment_passes_org_number_unique" ON "appointment_passes" ("organization_id", "visitor_pass_number");
CREATE INDEX "appointment_passes_org_appointment_idx" ON "appointment_passes" ("organization_id", "appointment_id");

CREATE TABLE "appointment_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "appointment_id" text NOT NULL REFERENCES "appointments"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "actor_user_id" integer,
  "actor_email" text NOT NULL,
  "details" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "appointment_audit_org_appointment_idx" ON "appointment_audit_logs" ("organization_id", "appointment_id", "created_at");

CREATE TABLE "appointment_sms_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "appointment_id" text REFERENCES "appointments"("id") ON DELETE SET NULL,
  "recipient" text NOT NULL,
  "message_type" text NOT NULL,
  "provider" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "provider_message_id" text,
  "status" text NOT NULL DEFAULT 'queued',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "provider_response" text,
  "last_error" text,
  "sent_at" timestamptz,
  "delivered_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "appointment_sms_org_dedupe_unique" ON "appointment_sms_logs" ("organization_id", "dedupe_key");
CREATE INDEX "appointment_sms_org_created_idx" ON "appointment_sms_logs" ("organization_id", "created_at");

CREATE TABLE "appointment_reminders" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "appointment_id" text NOT NULL REFERENCES "appointments"("id") ON DELETE CASCADE,
  "reminder_type" text NOT NULL,
  "due_at" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "processing_started_at" timestamptz,
  "last_error" text,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "appointment_reminders_appointment_type_due_unique" ON "appointment_reminders" ("appointment_id", "reminder_type", "due_at");
CREATE INDEX "appointment_reminders_due_status_idx" ON "appointment_reminders" ("status", "due_at");

CREATE TABLE "appointment_rate_limits" (
  "key" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamptz NOT NULL,
  "request_count" integer NOT NULL DEFAULT 0
);

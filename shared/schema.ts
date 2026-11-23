import { pgTable, text, serial, timestamp, boolean, integer, date, doublePrecision, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/* ================================
   ORGANIZATIONS AND SUBSCRIPTIONS
================================ */
export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  contactEmail: text("contact_email"),
  contactMobile: text("contact_mobile"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id).unique(),
  planId: text("plan_id").notNull(),
  status: text("status").notNull(),
  billingCycle: text("billing_cycle").notNull().default("annual"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionInvoicesTable = pgTable("subscription_invoices", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  invoiceNumber: text("invoice_number").notNull().unique(),
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull().default("INR"),
  status: text("status").notNull().default("pending"),
  description: text("description").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (table) => [index("subscription_invoices_org_issued_idx").on(table.organizationId, table.issuedAt)]);

export const subscriptionPlanRequestsTable = pgTable("subscription_plan_requests", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  requestedBy: integer("requested_by").notNull(),
  requestedPlanId: text("requested_plan_id").notNull(),
  billingCycle: text("billing_cycle").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: integer("reviewed_by"),
});

export const subscriptionUsageAlertsTable = pgTable("subscription_usage_alerts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  monthKey: text("month_key").notNull(),
  alertType: text("alert_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("subscription_usage_alerts_org_month_type_unique").on(
  table.organizationId,
  table.monthKey,
  table.alertType,
)]);

/* ================================
   USERS
================================ */
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizationsTable.id),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("employee"), // superadmin | admin | security | employee
  password: text("password").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

/* ================================
   APPOINTMENTS
================================ */
export const appointmentsTable = pgTable("appointments", {
  id: text("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  appointmentNumber: text("appointment_number").notNull(),
  createdBy: integer("created_by").notNull(),
  visitorName: text("visitor_name").notNull(),
  mobile: text("mobile").notNull(),
  email: text("email").notNull(),
  company: text("company").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull(),
  purpose: text("purpose").notNull(),
  meetingPerson: text("meeting_person").notNull(),
  meetingPersonId: integer("meeting_person_id"),
  department: text("department").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("pending"),
  registrationTokenHash: text("registration_token_hash").notNull().unique(),
  registrationExpiresAt: timestamp("registration_expires_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  adminRemarks: text("admin_remarks"),
  cancellationReason: text("cancellation_reason"),
  rescheduleReason: text("reschedule_reason"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("appointments_org_number_unique").on(table.organizationId, table.appointmentNumber),
  index("appointments_org_scheduled_idx").on(table.organizationId, table.scheduledAt),
  index("appointments_org_status_idx").on(table.organizationId, table.status),
]);

/* ================================
   VISITORS
================================ */
export const visitorsTable = pgTable("visitors", {
  id: text("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  appointmentId: text("appointment_id").references(() => appointmentsTable.id, { onDelete: "set null" }),
  visitorId: text("visitor_id").notNull().unique(),
  name: text("name").notNull(),
  mobile: text("mobile").notNull(),
  email: text("email"),
  purpose: text("purpose").notNull(),
  personToMeet: text("person_to_meet").notNull(),
  personToMeetId: integer("person_to_meet_id"),
  idProofType: text("id_proof_type").notNull(),
  idNumber: text("id_number").notNull(),
  idCardNumber: text("id_card_number"),
  idCardReturned: boolean("id_card_returned"),
  checkedOutBy: integer("checked_out_by"),
  photoUrl: text("photo_url"),
  qrCode: text("qr_code"),
  status: text("status").notNull().default("pending"), // pending|approved|checked_in|checked_out|rejected
  scheduledFor: date("scheduled_for", { mode: "string" }),
  checkIn: timestamp("check_in", { withTimezone: true }),
  checkOut: timestamp("check_out", { withTimezone: true }),
  isBlacklisted: boolean("is_blacklisted").notNull().default(false),
  isFlagged: boolean("is_flagged").notNull().default(false),
  remarks: text("remarks"),
  approvedBy: integer("approved_by"),
  currentLocationLatitude: doublePrecision("current_location_latitude"),
  currentLocationLongitude: doublePrecision("current_location_longitude"),
  currentLocationUpdatedAt: timestamp("current_location_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("visitors_org_created_idx").on(table.organizationId, table.createdAt),
  uniqueIndex("visitors_appointment_id_unique").on(table.appointmentId),
]);

export const insertVisitorSchema = createInsertSchema(visitorsTable).omit({ createdAt: true });
export type InsertVisitor = z.infer<typeof insertVisitorSchema>;
export type Visitor = typeof visitorsTable.$inferSelect;

/* ================================
   BLACKLIST
================================ */
export const blacklistTable = pgTable("blacklist", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  mobile: text("mobile").notNull(),
  reason: text("reason").notNull(),
  addedBy: text("added_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBlacklistSchema = createInsertSchema(blacklistTable).omit({ id: true, createdAt: true });
export type InsertBlacklist = z.infer<typeof insertBlacklistSchema>;
export type BlacklistEntry = typeof blacklistTable.$inferSelect;

/* ================================
   NOTIFICATIONS
================================ */
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  userId: integer("user_id").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"),
  readStatus: boolean("read_status").notNull().default(false),
  visitorId: text("visitor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;

/* ================================
   SYSTEM SETTINGS
================================ */
export const systemSettingsTable = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id).unique(),
  facilityName: text("facility_name").notNull().default("Concept Trunk Interiors"),
  companyLogo: text("company_logo"),
  contactEmail: text("contact_email").notNull().default("www.ctint.in"),
  autoCheckoutEnabled: boolean("auto_checkout_enabled").notNull().default(true),
  autoCheckoutTime: text("auto_checkout_time").notNull().default("23:59"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  requireApproval: boolean("require_approval").notNull().default(false),
  requirePhoto: boolean("require_photo").notNull().default(false),
  receptionLatitude: doublePrecision("reception_latitude"),
  receptionLongitude: doublePrecision("reception_longitude"),
});

/* ================================
   VISITOR AUDIT LOG
================================ */
export const visitorAuditTable = pgTable("visitor_audit_log", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  visitorId: text("visitor_id").notNull(),
  action: text("action").notNull(),
  actorUserId: integer("actor_user_id"),
  actorEmail: text("actor_email").notNull(),
  details: text("details").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const visitorGadgetsTable = pgTable("visitor_gadgets", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  visitorId: text("visitor_id").notNull(),
  name: text("name").notNull(),
  makeModel: text("make_model"),
  serialNumber: text("serial_number"),
  approvalStatus: text("approval_status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appointmentSubmissionsTable = pgTable("appointment_submissions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  appointmentId: text("appointment_id").notNull().references(() => appointmentsTable.id, { onDelete: "cascade" }).unique(),
  fullName: text("full_name").notNull(),
  mobile: text("mobile").notNull(),
  email: text("email").notNull(),
  company: text("company").notNull(),
  fullAddress: text("full_address").notNull(),
  idProofType: text("id_proof_type").notNull(),
  idProofNumber: text("id_proof_number").notNull(),
  purpose: text("purpose").notNull(),
  meetingPerson: text("meeting_person").notNull(),
  department: text("department").notNull(),
  additionalInformation: text("additional_information").notNull().default(""),
  photoUrl: text("photo_url").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("appointment_submissions_org_submitted_idx").on(table.organizationId, table.submittedAt)]);

export const appointmentPassesTable = pgTable("appointment_passes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  appointmentId: text("appointment_id").notNull().references(() => appointmentsTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  visitorPassNumber: text("visitor_pass_number").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("appointment_passes_org_number_unique").on(table.organizationId, table.visitorPassNumber),
  index("appointment_passes_org_appointment_idx").on(table.organizationId, table.appointmentId),
]);

export const appointmentAuditTable = pgTable("appointment_audit_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  appointmentId: text("appointment_id").notNull().references(() => appointmentsTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  actorUserId: integer("actor_user_id"),
  actorEmail: text("actor_email").notNull(),
  details: text("details").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("appointment_audit_org_appointment_idx").on(table.organizationId, table.appointmentId, table.createdAt)]);

export const appointmentSmsLogsTable = pgTable("appointment_sms_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  appointmentId: text("appointment_id").references(() => appointmentsTable.id, { onDelete: "set null" }),
  recipient: text("recipient").notNull(),
  messageType: text("message_type").notNull(),
  provider: text("provider").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  providerMessageId: text("provider_message_id"),
  status: text("status").notNull().default("queued"),
  attemptCount: integer("attempt_count").notNull().default(0),
  providerResponse: text("provider_response"),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("appointment_sms_org_dedupe_unique").on(table.organizationId, table.dedupeKey),
  index("appointment_sms_org_created_idx").on(table.organizationId, table.createdAt),
]);

export const appointmentRemindersTable = pgTable("appointment_reminders", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  appointmentId: text("appointment_id").notNull().references(() => appointmentsTable.id, { onDelete: "cascade" }),
  reminderType: text("reminder_type").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("appointment_reminders_appointment_type_due_unique").on(table.appointmentId, table.reminderType, table.dueAt),
  index("appointment_reminders_due_status_idx").on(table.status, table.dueAt),
]);

export const appointmentRateLimitsTable = pgTable("appointment_rate_limits", {
  key: text("key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  requestCount: integer("request_count").notNull().default(0),
});

/* ================================
   API REQUEST VALIDATORS
   (previously generated from openapi.yaml via orval — written by hand
   here now that the codegen package is gone)
================================ */
export const LoginBody = z.object({
  email: z.string(),
  password: z.string(),
});

export const SignupBody = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  organizationName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const appointmentDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a valid appointment date");

export const CreateAppointmentBody = z.object({
  visitorName: z.string().trim().min(2).max(150),
  mobile: z.string().trim().regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"),
  email: z.string().trim().email().max(254),
  company: z.string().trim().min(1).max(150),
  scheduledDate: appointmentDate,
  scheduledTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid appointment time"),
  timezone: z.string().trim().min(1).max(100),
  purpose: z.string().trim().min(2).max(500),
  meetingPerson: z.string().trim().min(2).max(150),
  meetingPersonId: z.number().int().positive().nullable().optional(),
  department: z.string().trim().min(1).max(150),
  notes: z.string().trim().max(2000).optional().default(""),
});

export const SubmitAppointmentBody = z.object({
  fullName: z.string().trim().min(2).max(150),
  mobile: z.string().trim().regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"),
  email: z.string().trim().email().max(254),
  company: z.string().trim().min(1).max(150),
  fullAddress: z.string().trim().min(5).max(500),
  idProofType: z.enum(["aadhar", "pan", "passport", "driving_license", "voter_id"]),
  idProofNumber: z.string().trim().min(2).max(100),
  additionalInformation: z.string().trim().max(2000).optional().default(""),
  photoUrl: z.string().regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/).max(700_000),
});

export const RejectAppointmentBody = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const AppointmentActionBody = z.object({
  reason: z.string().trim().max(1000).optional().default(""),
});

export const RescheduleAppointmentBody = z.object({
  scheduledDate: appointmentDate,
  scheduledTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid appointment time"),
  reason: z.string().trim().min(3).max(1000),
});

export const CreateVisitorBody = z.object({
  name: z.string(),
  mobile: z.string().regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"),
  email: z.string().nullish(),
  purpose: z.string(),
  personToMeet: z.string(),
  personToMeetId: z.number().nullish(),
  idProofType: z.enum(["aadhar", "pan", "passport", "driving_license", "voter_id"]),
  idNumber: z.string(),
  idCardNumber: z.string().trim().max(100).optional().transform((value) => value || undefined),
  photoUrl: z.string().nullish(),
  scheduledFor: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Enter a valid scheduled visit date")
    .optional(),
  gadgets: z.array(z.object({
    name: z.string().trim().min(1).max(150),
    makeModel: z.string().trim().max(150).nullish(),
    serialNumber: z.string().trim().max(150).nullish(),
  })).max(25).optional(),
});

export const UpdateVisitorBody = CreateVisitorBody.extend({
  idCardNumber: z.string().trim().max(100, "ID card number must be 100 characters or fewer").optional(),
});

export const GetVisitorsQueryParams = z.object({
  status: z
    .union([
      z.literal("pending"),
      z.literal("approved"),
      z.literal("checked_in"),
      z.literal("checked_out"),
      z.literal("rejected"),
      z.literal("scheduled"),
      z.literal("cancelled"),
      z.literal(null),
    ])
    .nullish(),
  date: z.coerce.string().nullish(),
  search: z.coerce.string().nullish(),
  person_to_meet: z.coerce.string().nullish(),
});

export const LookupVisitorByMobileQueryParams = z.object({
  mobile: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
});

export const ApproveVisitorBody = z.object({
  action: z.enum(["approve", "reject"]),
  remarks: z.string().nullish(),
});

export const CheckinVisitorBody = z.object({
  idCardNumber: z.string().trim().min(1).max(100).optional(),
});

export const ManualCheckoutBody = z.object({
  idCardReturned: z.literal(true),
});

export const GetReportsQueryParams = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).optional(),
});

export const CreateUserBody = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
  role: z.enum(["admin", "security", "employee"]),
});

export const UpdateUserBody = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Enter a valid email address"),
  role: z.enum(["admin", "security", "employee"]),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
});

export const AddToBlacklistBody = z.object({
  name: z.string(),
  mobile: z.string().regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"),
  reason: z.string(),
});

export const UpdateBlacklistBody = AddToBlacklistBody;

export const UpdateSystemSettingsBody = z.object({
  facilityName: z.string().trim().min(1, "Facility name is required"),
  companyLogo: z.string()
    .max(350_000, "Company logo is too large")
    .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/, "Company logo must be an optimized image")
    .nullable(),
  contactEmail: z.string().trim().min(1, "Contact email is required"),
  autoCheckoutEnabled: z.boolean(),
  autoCheckoutTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time"),
  timezone: z.string().min(1, "Timezone is required"),
  requireApproval: z.boolean(),
  requirePhoto: z.boolean(),
  receptionLatitude: z.number().min(-90).max(90).nullable(),
  receptionLongitude: z.number().min(-180).max(180).nullable(),
}).refine(
  (settings) => (settings.receptionLatitude === null) === (settings.receptionLongitude === null),
  { message: "Reception latitude and longitude must both be set or both be empty", path: ["receptionLongitude"] },
);

export const ReviewVisitorGadgetBody = z.object({
  action: z.enum(["approve", "reject"]),
});

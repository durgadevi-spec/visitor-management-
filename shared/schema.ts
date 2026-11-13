import { pgTable, text, serial, timestamp, boolean, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/* ================================
   USERS
================================ */
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("employee"), // admin | security | employee
  password: text("password").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

/* ================================
   VISITORS
================================ */
export const visitorsTable = pgTable("visitors", {
  id: text("id").primaryKey(),
  visitorId: text("visitor_id").notNull().unique(),
  name: text("name").notNull(),
  mobile: text("mobile").notNull(),
  email: text("email"),
  purpose: text("purpose").notNull(),
  personToMeet: text("person_to_meet").notNull(),
  personToMeetId: integer("person_to_meet_id"),
  idProofType: text("id_proof_type").notNull(),
  idNumber: text("id_number").notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVisitorSchema = createInsertSchema(visitorsTable).omit({ createdAt: true });
export type InsertVisitor = z.infer<typeof insertVisitorSchema>;
export type Visitor = typeof visitorsTable.$inferSelect;

/* ================================
   BLACKLIST
================================ */
export const blacklistTable = pgTable("blacklist", {
  id: serial("id").primaryKey(),
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
  id: integer("id").primaryKey().default(1),
  facilityName: text("facility_name").notNull().default("Concept Trunk Interiors"),
  companyLogo: text("company_logo"),
  contactEmail: text("contact_email").notNull().default("www.ctint.in"),
  autoCheckoutEnabled: boolean("auto_checkout_enabled").notNull().default(true),
  autoCheckoutTime: text("auto_checkout_time").notNull().default("23:59"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  requirePhoto: boolean("require_photo").notNull().default(false),
});

/* ================================
   VISITOR AUDIT LOG
================================ */
export const visitorAuditTable = pgTable("visitor_audit_log", {
  id: serial("id").primaryKey(),
  visitorId: text("visitor_id").notNull(),
  action: text("action").notNull(),
  actorUserId: integer("actor_user_id"),
  actorEmail: text("actor_email").notNull(),
  details: text("details").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const visitorGadgetsTable = pgTable("visitor_gadgets", {
  id: serial("id").primaryKey(),
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
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
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

export const UpdateVisitorBody = CreateVisitorBody;

export const GetVisitorsQueryParams = z.object({
  status: z
    .union([
      z.literal("pending"),
      z.literal("approved"),
      z.literal("checked_in"),
      z.literal("checked_out"),
      z.literal("rejected"),
      z.literal("scheduled"),
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
  requirePhoto: z.boolean(),
});

export const ReviewVisitorGadgetBody = z.object({
  action: z.enum(["approve", "reject"]),
});

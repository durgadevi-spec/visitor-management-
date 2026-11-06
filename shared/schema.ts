import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
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
   API REQUEST VALIDATORS
   (previously generated from openapi.yaml via orval — written by hand
   here now that the codegen package is gone)
================================ */
export const LoginBody = z.object({
  email: z.string(),
  password: z.string(),
});

export const CreateVisitorBody = z.object({
  name: z.string(),
  mobile: z.string(),
  email: z.string().nullish(),
  purpose: z.string(),
  personToMeet: z.string(),
  personToMeetId: z.number().nullish(),
  idProofType: z.enum(["aadhar", "pan", "passport", "driving_license", "voter_id"]),
  idNumber: z.string(),
  photoUrl: z.string().nullish(),
});

export const GetVisitorsQueryParams = z.object({
  status: z
    .union([
      z.literal("pending"),
      z.literal("approved"),
      z.literal("checked_in"),
      z.literal("checked_out"),
      z.literal("rejected"),
      z.literal(null),
    ])
    .nullish(),
  date: z.coerce.string().nullish(),
  search: z.coerce.string().nullish(),
  person_to_meet: z.coerce.string().nullish(),
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

export const AddToBlacklistBody = z.object({
  name: z.string(),
  mobile: z.string(),
  reason: z.string(),
});

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, lt, or, sql } from "drizzle-orm";
import { authMiddleware, type AuthenticatedRequest } from "./auth";
import { db } from "./db";
import { getSystemSettings } from "./settings";
import {
  claimAppointmentSms,
  markAppointmentSmsFailed,
  sendAppointmentSms,
  sendClaimedAppointmentSms,
  type AppointmentSmsType,
} from "./appointment-sms";
import { isPlanId, planHasFeature } from "../shared/plans";
import {
  appointmentAuditTable,
  appointmentPassesTable,
  appointmentRateLimitsTable,
  appointmentRemindersTable,
  appointmentSmsLogsTable,
  appointmentSubmissionsTable,
  appointmentsTable,
  AppointmentActionBody,
  CreateAppointmentBody,
  RejectAppointmentBody,
  RescheduleAppointmentBody,
  SubmitAppointmentBody,
  blacklistTable,
  notificationsTable,
  organizationsTable,
  subscriptionsTable,
  usersTable,
  visitorAuditTable,
  visitorsTable,
} from "../shared/schema.ts";

interface AppointmentRouteHelpers {
  requireOrganization: (req: Request, res: Response, next: (error?: unknown) => void) => void;
  organizationId: (req: Request) => number;
  requireFeature: (feature: "appointments" | "sms", req: Request, res: Response) => boolean;
  checkVisitorCapacity: (req: Request, res: Response, timezone: string) => Promise<boolean>;
}

function isAdmin(req: Request, res: Response): boolean {
  if ((req as AuthenticatedRequest).user.role !== "admin") {
    res.status(403).json({ error: "Administrator access is required" });
    return false;
  }
  return true;
}

function isWritableAdmin(req: Request, res: Response): boolean {
  if (!isAdmin(req, res)) return false;
  if ((req as AuthenticatedRequest).org?.readOnly) {
    res.status(403).json({ error: "Your subscription is read-only. Appointment changes are disabled." });
    return false;
  }
  return true;
}

function appointmentTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateVisitorNumber(): string {
  return `VMS-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function publicAppUrl(path: string): string {
  const configured = process.env.APP_BASE_URL?.trim();
  const base = configured || (process.env.NODE_ENV === "production" ? "" : "http://localhost:5000");
  if (!base) throw new Error("APP_BASE_URL must be configured before appointment links can be generated");
  const parsed = new URL(base);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
    throw new Error("APP_BASE_URL must use HTTPS except for localhost testing");
  }
  return new URL(path, parsed.origin).toString();
}

function localDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) throw new Error("Unable to format appointment date");
  return `${year}-${month}-${day}`;
}

function dateAtTimezone(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = targetUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
    const representedUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute);
    candidate += targetUtc - representedUtc;
  }

  const result = new Date(candidate);
  const rendered = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(result);
  const values = Object.fromEntries(rendered.map(({ type, value }) => [type, value]));
  if (
    values.year !== String(year).padStart(4, "0") ||
    values.month !== String(month).padStart(2, "0") ||
    values.day !== String(day).padStart(2, "0") ||
    values.hour !== String(hour).padStart(2, "0") ||
    values.minute !== String(minute).padStart(2, "0")
  ) {
    throw new Error("The selected time does not exist in this timezone");
  }
  return result;
}

function formatAppointment<T extends typeof appointmentsTable.$inferSelect>(appointment: T) {
  return {
    ...appointment,
    scheduledAt: appointment.scheduledAt.toISOString(),
    registrationExpiresAt: appointment.registrationExpiresAt.toISOString(),
    submittedAt: appointment.submittedAt?.toISOString() ?? null,
    reviewedAt: appointment.reviewedAt?.toISOString() ?? null,
    completedAt: appointment.completedAt?.toISOString() ?? null,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}

function requireAppointmentFeature(req: Request, res: Response, helpers: AppointmentRouteHelpers): boolean {
  return helpers.requireFeature("appointments", req, res);
}

async function checkPublicFeatureAccess(organizationId: number, requireWrite = false): Promise<boolean> {
  const [subscription] = await db.select({
    planId: subscriptionsTable.planId,
    status: subscriptionsTable.status,
    trialEndsAt: subscriptionsTable.trialEndsAt,
    currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
  })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.organizationId, organizationId));
  if (!subscription || !isPlanId(subscription.planId) || !planHasFeature(subscription.planId, "appointments")) return false;
  if (!requireWrite) return true;
  const now = new Date();
  const status = subscription.status === "trial" && subscription.trialEndsAt && subscription.trialEndsAt <= now
    ? "expired"
    : subscription.status === "active" && subscription.currentPeriodEnd && subscription.currentPeriodEnd <= now
      ? "past_due"
      : subscription.status;
  const graceEnd = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd.getTime() + 7 * 24 * 60 * 60 * 1000)
    : null;
  return status !== "canceled" && status !== "expired" && !(status === "past_due" && (!graceEnd || graceEnd < now));
}

async function enforcePublicRateLimit(req: Request, res: Response, keyScope: string, maxRequests: number): Promise<boolean> {
  const peer = req.socket.remoteAddress ?? "";
  const forwardedFor = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1"
    ? req.headers["x-forwarded-for"]
    : undefined;
  const forwardedIp = typeof forwardedFor === "string" ? forwardedFor.split(",")[0]?.trim() : "";
  const ip = forwardedIp || req.ip || peer || "unknown";
  const pepper = process.env.SESSION_SECRET || "appointment-rate-limit";
  const key = createHash("sha256").update(`${pepper}:${keyScope}:${ip}`).digest("hex");
  const now = new Date();
  const windowStartedAt = new Date(now.getTime() - 60_000);
  const [row] = await db.insert(appointmentRateLimitsTable).values({
    key,
    windowStartedAt: now,
    requestCount: 1,
  }).onConflictDoUpdate({
    target: appointmentRateLimitsTable.key,
    set: {
      requestCount: sql`CASE WHEN ${appointmentRateLimitsTable.windowStartedAt} <= ${windowStartedAt} THEN 1 ELSE ${appointmentRateLimitsTable.requestCount} + 1 END`,
      windowStartedAt: sql`CASE WHEN ${appointmentRateLimitsTable.windowStartedAt} <= ${windowStartedAt} THEN ${now} ELSE ${appointmentRateLimitsTable.windowStartedAt} END`,
    },
  }).returning({ requestCount: appointmentRateLimitsTable.requestCount });

  if (row.requestCount > maxRequests) {
    res.status(429).json({ error: "Too many appointment requests. Please try again later." });
    return false;
  }
  return true;
}

async function writeAppointmentAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  appointment: typeof appointmentsTable.$inferSelect,
  action: string,
  user: { userId: number | null; email: string },
  details: string,
) {
  await tx.insert(appointmentAuditTable).values({
    organizationId: appointment.organizationId,
    appointmentId: appointment.id,
    action,
    actorUserId: user.userId,
    actorEmail: user.email,
    details,
  });
}

async function scheduleReminders(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  appointment: typeof appointmentsTable.$inferSelect,
  now: Date,
) {
  const reminders = [
    { type: "24h", dueAt: new Date(appointment.scheduledAt.getTime() - 24 * 60 * 60 * 1000) },
    { type: "1h", dueAt: new Date(appointment.scheduledAt.getTime() - 60 * 60 * 1000) },
  ].filter((reminder) => reminder.dueAt > now);
  if (reminders.length === 0) return;
  await tx.insert(appointmentRemindersTable).values(reminders.map((reminder) => ({
    organizationId: appointment.organizationId,
    appointmentId: appointment.id,
    reminderType: reminder.type,
    dueAt: reminder.dueAt,
  }))).onConflictDoNothing();
}

async function makeAppointmentPass(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  appointment: typeof appointmentsTable.$inferSelect,
  userId: number,
) {
  const token = randomBytes(32).toString("base64url");
  const passNumber = `PASS-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  await tx.update(appointmentPassesTable).set({ revokedAt: new Date() }).where(and(
    eq(appointmentPassesTable.organizationId, appointment.organizationId),
    eq(appointmentPassesTable.appointmentId, appointment.id),
    isNull(appointmentPassesTable.revokedAt),
  ));
  await tx.insert(appointmentPassesTable).values({
    organizationId: appointment.organizationId,
    appointmentId: appointment.id,
    tokenHash: appointmentTokenHash(token),
    visitorPassNumber: passNumber,
    validFrom: new Date(appointment.scheduledAt.getTime() - 6 * 60 * 60 * 1000),
    validUntil: new Date(appointment.scheduledAt.getTime() + 12 * 60 * 60 * 1000),
    createdBy: userId,
  });
  return { token, passNumber };
}

function formattedAppointmentDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function formatVisitorDuration(checkIn: Date | null, checkOut: Date | null): string | null {
  if (!checkIn) return null;
  const minutes = Math.max(0, Math.floor(((checkOut ?? new Date()).getTime() - checkIn.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
}

export function registerAppointmentRoutes(app: Express, helpers: AppointmentRouteHelpers) {
  const api = "/api";
  const organizationRoute = [authMiddleware, helpers.requireOrganization] as const;
  const appointmentFeatureRoute = [...organizationRoute] as const;

  app.get(`${api}/public/appointments/:token`, async (req, res): Promise<void> => {
    if (!await enforcePublicRateLimit(req, res, "registration-read", 60)) return;
    const [appointment] = await db.select().from(appointmentsTable).where(
      eq(appointmentsTable.registrationTokenHash, appointmentTokenHash(req.params.token)),
    );
    if (!appointment) {
      res.status(404).json({ error: "Appointment registration link is invalid or expired" });
      return;
    }
    if (!await checkPublicFeatureAccess(appointment.organizationId)) {
      res.status(403).json({ error: "Appointment registration is not available for this subscription" });
      return;
    }
    if (appointment.status === "pending" && appointment.registrationExpiresAt <= new Date()) {
      res.status(410).json({ error: "Appointment registration link has expired" });
      return;
    }
    const [organization] = await db.select({ name: organizationsTable.name })
      .from(organizationsTable).where(eq(organizationsTable.id, appointment.organizationId));
    res.json({
      appointmentNumber: appointment.appointmentNumber,
      visitorName: appointment.visitorName,
      mobile: appointment.mobile,
      email: appointment.email,
      company: appointment.company,
      scheduledAt: appointment.scheduledAt.toISOString(),
      timezone: appointment.timezone,
      purpose: appointment.purpose,
      meetingPerson: appointment.meetingPerson,
      department: appointment.department,
      status: appointment.status,
      organizationName: organization.name,
    });
  });

  app.post(`${api}/public/appointments/:token/submission`, async (req, res): Promise<void> => {
    if (!await enforcePublicRateLimit(req, res, "registration-submit", 30) ||
      !await enforcePublicRateLimit(req, res, `registration-submit:${appointmentTokenHash(req.params.token)}`, 10)) return;
    const parsed = SubmitAppointmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid registration details" });
      return;
    }
    const [appointment] = await db.select().from(appointmentsTable).where(
      eq(appointmentsTable.registrationTokenHash, appointmentTokenHash(req.params.token)),
    );
    if (!appointment) {
      res.status(404).json({ error: "Appointment registration link is invalid or expired" });
      return;
    }
    if (!await checkPublicFeatureAccess(appointment.organizationId, true)) {
      res.status(403).json({ error: "Appointment registration is not available for this subscription" });
      return;
    }
    if (appointment.status !== "pending" || appointment.registrationExpiresAt <= new Date()) {
      res.status(409).json({ error: "This appointment is no longer accepting registration" });
      return;
    }
    if (parsed.data.mobile !== appointment.mobile) {
      res.status(400).json({ error: "Use the mobile number that received this appointment link" });
      return;
    }
    const submittedAt = new Date();
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(appointmentsTable).set({
        status: "submitted",
        submittedAt,
        updatedAt: submittedAt,
      }).where(and(
        eq(appointmentsTable.id, appointment.id),
        eq(appointmentsTable.organizationId, appointment.organizationId),
        eq(appointmentsTable.status, "pending"),
        gte(appointmentsTable.registrationExpiresAt, submittedAt),
      )).returning();
      if (!updated) return false;
      await tx.insert(appointmentSubmissionsTable).values({
        organizationId: appointment.organizationId,
        appointmentId: appointment.id,
        fullName: parsed.data.fullName,
        mobile: parsed.data.mobile,
        email: parsed.data.email,
        company: parsed.data.company,
        fullAddress: parsed.data.fullAddress,
        idProofType: parsed.data.idProofType,
        idProofNumber: parsed.data.idProofNumber,
        purpose: appointment.purpose,
        meetingPerson: appointment.meetingPerson,
        department: appointment.department,
        additionalInformation: parsed.data.additionalInformation,
        photoUrl: parsed.data.photoUrl,
        submittedAt,
      });
      await writeAppointmentAudit(tx, updated, "registration_submitted", {
        userId: null,
        email: "visitor registration link",
      }, "Visitor submitted appointment registration details for administrator review.");
      return true;
    });
    if (!result) {
      res.status(409).json({ error: "This appointment has already been submitted or changed" });
      return;
    }

    await sendAppointmentSms({
      organizationId: appointment.organizationId,
      appointmentId: appointment.id,
      recipient: appointment.mobile,
      messageType: "submission_confirmation",
      dedupeKey: `submission:${appointment.id}`,
      variables: { var1: parsed.data.fullName, var2: appointment.appointmentNumber },
    });
    res.status(201).json({ status: "submitted", appointmentNumber: appointment.appointmentNumber });
  });

  app.get(`${api}/public/appointment-passes/:token`, async (req, res): Promise<void> => {
    if (!await enforcePublicRateLimit(req, res, "appointment-pass", 60)) return;
    const tokenHash = appointmentTokenHash(req.params.token);
    const [pass] = await db.select().from(appointmentPassesTable).where(and(
      eq(appointmentPassesTable.tokenHash, tokenHash),
      isNull(appointmentPassesTable.revokedAt),
    ));
    if (!pass) {
      res.status(404).json({ error: "Appointment pass is invalid or has been revoked" });
      return;
    }
    if (!await checkPublicFeatureAccess(pass.organizationId)) {
      res.status(403).json({ error: "Appointment passes are not available for this subscription" });
      return;
    }
    const now = new Date();
    if (now > pass.validUntil) {
      res.status(410).json({ error: "Appointment pass is outside its valid time window" });
      return;
    }
    const [[appointment], [visitor], settings] = await Promise.all([
      db.select().from(appointmentsTable).where(and(
        eq(appointmentsTable.id, pass.appointmentId),
        eq(appointmentsTable.organizationId, pass.organizationId),
      )),
      db.select({
        id: visitorsTable.id,
        visitorId: visitorsTable.visitorId,
        name: visitorsTable.name,
        photoUrl: visitorsTable.photoUrl,
        status: visitorsTable.status,
      }).from(visitorsTable).where(and(
        eq(visitorsTable.organizationId, pass.organizationId),
        eq(visitorsTable.appointmentId, pass.appointmentId),
      )),
      getSystemSettings(pass.organizationId),
    ]);
    if (!appointment || !visitor || !["approved", "checked_in", "completed"].includes(appointment.status)) {
      res.status(404).json({ error: "Approved appointment pass was not found" });
      return;
    }
    res.json({
      visitorId: visitor.visitorId,
      name: visitor.name,
      photoUrl: visitor.photoUrl,
      appointmentNumber: appointment.appointmentNumber,
      visitorPassNumber: pass.visitorPassNumber,
      scheduledAt: appointment.scheduledAt.toISOString(),
      timezone: appointment.timezone,
      meetingPerson: appointment.meetingPerson,
      department: appointment.department,
      purpose: appointment.purpose,
      visitorStatus: visitor.status,
      facilityName: settings.facilityName,
      companyLogo: settings.companyLogo ?? null,
    });
  });

  app.post(`${api}/public/webhooks/msg91/dlr`, async (req, res): Promise<void> => {
    const expectedSecret = process.env.MSG91_DLR_WEBHOOK_SECRET?.trim();
    const suppliedSecret = typeof req.query.secret === "string" ? req.query.secret : "";
    const expectedBytes = Buffer.from(expectedSecret ?? "");
    const suppliedBytes = Buffer.from(suppliedSecret);
    if (!expectedSecret || suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)) {
      res.status(401).json({ error: "Invalid delivery report authentication" });
      return;
    }
    const records = Array.isArray(req.body) ? req.body :
      Array.isArray(req.body?.reports) ? req.body.reports :
        Array.isArray(req.body?.report) ? req.body.report.map((record: Record<string, unknown>) => ({
          ...record,
          request_id: record.request_id ?? req.body.request_id ?? req.body.requestId,
        })) : [req.body];
    let updatedCount = 0;
    for (const record of records) {
      if (!record || typeof record !== "object") continue;
      const idValue = record.request_id ?? record.requestId ?? record.message_id ?? record.messageId;
      const statusValue = record.status ?? record.delivery_status ?? record.deliveryStatus;
      if ((typeof idValue !== "string" && typeof idValue !== "number") || typeof statusValue !== "string") continue;
      const status = statusValue.toLowerCase();
      if (["delivered", "success", "successful"].includes(status)) {
        const [updated] = await db.update(appointmentSmsLogsTable).set({
          status: "delivered",
          deliveredAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        }).where(eq(appointmentSmsLogsTable.providerMessageId, String(idValue))).returning({ id: appointmentSmsLogsTable.id });
        if (updated) updatedCount += 1;
      } else if (["failed", "rejected", "undelivered", "expired"].includes(status)) {
        const [updated] = await db.update(appointmentSmsLogsTable).set({
          status: "failed",
          lastError: `MSG91 delivery status: ${status}`,
          updatedAt: new Date(),
        }).where(eq(appointmentSmsLogsTable.providerMessageId, String(idValue))).returning({ id: appointmentSmsLogsTable.id });
        if (updated) updatedCount += 1;
      }
    }
    res.json({ accepted: true, updated: updatedCount });
  });

  app.get(`${api}/appointments`, ...appointmentFeatureRoute, async (req, res): Promise<void> => {
    if (!requireAppointmentFeature(req, res, helpers) || !isAdmin(req, res)) return;
    const orgId = helpers.organizationId(req);
    const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : null;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
    const conditions = [eq(appointmentsTable.organizationId, orgId)];
    if (status) conditions.push(eq(appointmentsTable.status, status));
    if (search) conditions.push(or(
      ilike(appointmentsTable.appointmentNumber, `%${search}%`),
      ilike(appointmentsTable.visitorName, `%${search}%`),
      ilike(appointmentsTable.mobile, `%${search}%`),
      ilike(appointmentsTable.meetingPerson, `%${search}%`),
    )!);
    if (from && !Number.isNaN(from.getTime())) conditions.push(gte(appointmentsTable.scheduledAt, from));
    if (to && !Number.isNaN(to.getTime())) conditions.push(lte(appointmentsTable.scheduledAt, to));

    const appointments = await db.select().from(appointmentsTable)
      .where(and(...conditions))
      .orderBy(desc(appointmentsTable.scheduledAt))
      .limit(500);
    const visitorRows = appointments.length === 0 ? [] : await db.select({
      id: visitorsTable.id,
      appointmentId: visitorsTable.appointmentId,
      visitorId: visitorsTable.visitorId,
      status: visitorsTable.status,
      checkIn: visitorsTable.checkIn,
      checkOut: visitorsTable.checkOut,
      idCardNumber: visitorsTable.idCardNumber,
      idCardReturned: visitorsTable.idCardReturned,
      checkedOutBy: visitorsTable.checkedOutBy,
      checkedOutByEmail: usersTable.email,
    }).from(visitorsTable).leftJoin(usersTable, eq(visitorsTable.checkedOutBy, usersTable.id)).where(and(
      eq(visitorsTable.organizationId, orgId),
      inArray(visitorsTable.appointmentId, appointments.map((appointment) => appointment.id)),
    ));
    const visitorByAppointment = new Map(visitorRows.map((visitor) => [visitor.appointmentId, {
      ...visitor,
      duration: formatVisitorDuration(visitor.checkIn, visitor.checkOut),
    }]));
    res.json(appointments.map((appointment) => ({
      ...formatAppointment(appointment),
      visitor: visitorByAppointment.get(appointment.id) ?? null,
    })));
  });

  app.get(`${api}/appointments/summary`, ...appointmentFeatureRoute, async (req, res): Promise<void> => {
    if (!requireAppointmentFeature(req, res, helpers) || !isAdmin(req, res)) return;
    const rows = await db.select({
      status: appointmentsTable.status,
      count: sql<number>`count(*)::int`,
    }).from(appointmentsTable).where(eq(appointmentsTable.organizationId, helpers.organizationId(req)))
      .groupBy(appointmentsTable.status);
    res.json(Object.fromEntries(rows.map((row) => [row.status, row.count])));
  });

  app.post(`${api}/appointments`, ...appointmentFeatureRoute, async (req, res): Promise<void> => {
    if (!requireAppointmentFeature(req, res, helpers) || !helpers.requireFeature("sms", req, res) || !isWritableAdmin(req, res)) return;
    const parsed = CreateAppointmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid appointment details" });
      return;
    }
    const data = parsed.data;
    const orgId = helpers.organizationId(req);
    let scheduledAt: Date;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: data.timezone });
      scheduledAt = dateAtTimezone(data.scheduledDate, data.scheduledTime, data.timezone);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid appointment timezone" });
      return;
    }
    if (scheduledAt <= new Date()) {
      res.status(400).json({ error: "Appointment must be scheduled for a future date and time" });
      return;
    }

    let meetingPersonId = data.meetingPersonId ?? null;
    let meetingPerson = data.meetingPerson;
    if (meetingPersonId !== null) {
      const [host] = await db.select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable).where(and(
          eq(usersTable.organizationId, orgId),
          eq(usersTable.id, meetingPersonId),
        ));
      if (!host) {
        res.status(400).json({ error: "The selected host does not belong to this organization" });
        return;
      }
      meetingPerson = host.name;
    }

    const id = randomUUID();
    const registrationToken = randomBytes(32).toString("base64url");
    let registrationUrl: string;
    try {
      registrationUrl = publicAppUrl(`/appointment/register/${registrationToken}`);
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Appointment links are not configured" });
      return;
    }
    const appointmentNumber = `APT-${localDate(scheduledAt, data.timezone).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const now = new Date();
    const appointment = await db.transaction(async (tx) => {
      const [created] = await tx.insert(appointmentsTable).values({
        id,
        organizationId: orgId,
        appointmentNumber,
        createdBy: (req as AuthenticatedRequest).user.userId,
        visitorName: data.visitorName,
        mobile: data.mobile,
        email: data.email.toLowerCase(),
        company: data.company,
        scheduledAt,
        timezone: data.timezone,
        purpose: data.purpose,
        meetingPerson,
        meetingPersonId,
        department: data.department,
        notes: data.notes,
        status: "pending",
        registrationTokenHash: appointmentTokenHash(registrationToken),
        registrationExpiresAt: scheduledAt,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await scheduleReminders(tx, created, now);
      await writeAppointmentAudit(tx, created, "created", {
        userId: (req as AuthenticatedRequest).user.userId,
        email: (req as AuthenticatedRequest).user.email,
      }, `Appointment ${created.appointmentNumber} was created.`);
      return created;
    });
    const sms = await sendAppointmentSms({
      organizationId: orgId,
      appointmentId: appointment.id,
      recipient: appointment.mobile,
      messageType: "registration_link",
      dedupeKey: `registration:${appointment.id}`,
      variables: {
        var1: appointment.visitorName,
        var2: appointment.appointmentNumber,
        var3: registrationUrl,
      },
    });
    res.status(201).json({
      ...formatAppointment(appointment),
      registrationUrl,
      sms: sms.status,
    });
  });

  app.get(`${api}/appointments/:id`, ...appointmentFeatureRoute, async (req, res): Promise<void> => {
    if (!requireAppointmentFeature(req, res, helpers) || !isAdmin(req, res)) return;
    const orgId = helpers.organizationId(req);
    const [appointment] = await db.select().from(appointmentsTable).where(and(
      eq(appointmentsTable.organizationId, orgId),
      eq(appointmentsTable.id, req.params.id),
    ));
    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    const [[submission], [visitor], passes, audit, smsLogs] = await Promise.all([
      db.select().from(appointmentSubmissionsTable).where(and(
        eq(appointmentSubmissionsTable.organizationId, orgId),
        eq(appointmentSubmissionsTable.appointmentId, appointment.id),
      )),
      db.select({
        id: visitorsTable.id,
        visitorId: visitorsTable.visitorId,
        status: visitorsTable.status,
        checkIn: visitorsTable.checkIn,
        checkOut: visitorsTable.checkOut,
        idCardNumber: visitorsTable.idCardNumber,
        idCardReturned: visitorsTable.idCardReturned,
        checkedOutBy: visitorsTable.checkedOutBy,
        checkedOutByEmail: usersTable.email,
      }).from(visitorsTable).leftJoin(usersTable, eq(visitorsTable.checkedOutBy, usersTable.id)).where(and(
        eq(visitorsTable.organizationId, orgId),
        eq(visitorsTable.appointmentId, appointment.id),
      )),
      db.select().from(appointmentPassesTable).where(and(
        eq(appointmentPassesTable.organizationId, orgId),
        eq(appointmentPassesTable.appointmentId, appointment.id),
      )).orderBy(desc(appointmentPassesTable.createdAt)),
      db.select().from(appointmentAuditTable).where(and(
        eq(appointmentAuditTable.organizationId, orgId),
        eq(appointmentAuditTable.appointmentId, appointment.id),
      )).orderBy(desc(appointmentAuditTable.createdAt)),
      db.select().from(appointmentSmsLogsTable).where(and(
        eq(appointmentSmsLogsTable.organizationId, orgId),
        eq(appointmentSmsLogsTable.appointmentId, appointment.id),
      )).orderBy(desc(appointmentSmsLogsTable.createdAt)),
    ]);
    const formattedVisitor = visitor ? {
      ...visitor,
      duration: formatVisitorDuration(visitor.checkIn, visitor.checkOut),
    } : null;
    res.json({
      appointment: formatAppointment(appointment),
      submission: submission ? { ...submission, submittedAt: submission.submittedAt.toISOString() } : null,
      visitor: formattedVisitor,
      passes: passes.map((pass) => ({
        ...pass,
        validFrom: pass.validFrom.toISOString(),
        validUntil: pass.validUntil.toISOString(),
        revokedAt: pass.revokedAt?.toISOString() ?? null,
        createdAt: pass.createdAt.toISOString(),
      })),
      audit: audit.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
      smsLogs: smsLogs.map((entry) => ({
        ...entry,
        sentAt: entry.sentAt?.toISOString() ?? null,
        deliveredAt: entry.deliveredAt?.toISOString() ?? null,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      })),
    });
  });

  app.post(`${api}/appointments/:id/send-registration`, ...appointmentFeatureRoute, async (req, res): Promise<void> => {
    if (!requireAppointmentFeature(req, res, helpers) || !helpers.requireFeature("sms", req, res) || !isWritableAdmin(req, res)) return;
    const orgId = helpers.organizationId(req);
    const [appointment] = await db.select().from(appointmentsTable).where(and(
      eq(appointmentsTable.organizationId, orgId),
      eq(appointmentsTable.id, req.params.id),
    ));
    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    if (appointment.status !== "pending" || appointment.registrationExpiresAt <= new Date()) {
      res.status(409).json({ error: "Only pending appointments can receive a registration link" });
      return;
    }
    const dedupeKey = `registration:${appointment.id}`;
    const claim = await claimAppointmentSms({
      organizationId: orgId,
      appointmentId: appointment.id,
      recipient: appointment.mobile,
      messageType: "registration_link",
      dedupeKey,
      variables: {},
    });
    if (!claim.claimed) {
      res.status(409).json({ error: "A registration SMS has already been sent or is already being processed" });
      return;
    }

    const registrationToken = randomBytes(32).toString("base64url");
    let registrationUrl: string;
    try {
      registrationUrl = publicAppUrl(`/appointment/register/${registrationToken}`);
    } catch (error) {
      await markAppointmentSmsFailed(claim.entry.id, error instanceof Error ? error.message : "Appointment links are not configured");
      res.status(503).json({ error: error instanceof Error ? error.message : "Appointment links are not configured" });
      return;
    }
    const [updated] = await db.update(appointmentsTable).set({
      registrationTokenHash: appointmentTokenHash(registrationToken),
      updatedAt: new Date(),
    }).where(and(
      eq(appointmentsTable.organizationId, orgId),
      eq(appointmentsTable.id, appointment.id),
      eq(appointmentsTable.status, "pending"),
    )).returning({ id: appointmentsTable.id });
    if (!updated) {
      await markAppointmentSmsFailed(claim.entry.id, "Appointment status changed before the registration link could be resent");
      res.status(409).json({ error: "Registration is no longer available for this appointment" });
      return;
    }
    const logEntry = await sendClaimedAppointmentSms({
      organizationId: orgId,
      appointmentId: appointment.id,
      recipient: appointment.mobile,
      messageType: "registration_link",
      dedupeKey,
      variables: {
        var1: appointment.visitorName,
        var2: appointment.appointmentNumber,
        var3: registrationUrl,
      },
    }, claim.entry);
    await db.insert(appointmentAuditTable).values({
      organizationId: orgId,
      appointmentId: appointment.id,
      action: "registration_link_sent",
      actorUserId: (req as AuthenticatedRequest).user.userId,
      actorEmail: (req as AuthenticatedRequest).user.email,
      details: `Registration SMS ${logEntry.status}.`,
    });
    res.json({ sms: logEntry.status, registrationUrl });
  });

  app.post(`${api}/appointments/:id/approve`, ...appointmentFeatureRoute, async (req, res): Promise<void> => {
    if (!requireAppointmentFeature(req, res, helpers) || !isWritableAdmin(req, res)) return;
    const parsed = AppointmentActionBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid approval details" });
      return;
    }
    const orgId = helpers.organizationId(req);
    const user = (req as AuthenticatedRequest).user;
    const [current] = await db.select().from(appointmentsTable).where(and(
      eq(appointmentsTable.organizationId, orgId),
      eq(appointmentsTable.id, req.params.id),
    ));
    if (!current) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    const [submission] = await db.select().from(appointmentSubmissionsTable).where(and(
      eq(appointmentSubmissionsTable.organizationId, orgId),
      eq(appointmentSubmissionsTable.appointmentId, current.id),
    ));
    if (!submission || current.status !== "submitted") {
      res.status(409).json({ error: "Only submitted appointments can be approved" });
      return;
    }
    try {
      publicAppUrl("/appointment-pass/check");
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Appointment pass links are not configured" });
      return;
    }
    if (!await helpers.checkVisitorCapacity(req, res, current.timezone)) return;

    const blacklistMatches = await db.select({ id: blacklistTable.id, reason: blacklistTable.reason })
      .from(blacklistTable).where(and(
        eq(blacklistTable.organizationId, orgId),
        or(
          eq(blacklistTable.mobile, submission.mobile),
          eq(blacklistTable.name, submission.fullName),
        ),
      ));
    const blacklisted = blacklistMatches.length > 0;
    const visitorRecordId = randomUUID();
    const visitorNumber = generateVisitorNumber();
    const approvedAt = new Date();
    const result = await db.transaction(async (tx) => {
      const [updatedAppointment] = await tx.update(appointmentsTable).set({
        status: "approved",
        reviewedBy: user.userId,
        reviewedAt: approvedAt,
        adminRemarks: parsed.data.reason || null,
        updatedAt: approvedAt,
      }).where(and(
        eq(appointmentsTable.organizationId, orgId),
        eq(appointmentsTable.id, current.id),
        eq(appointmentsTable.status, "submitted"),
      )).returning();
      if (!updatedAppointment) return null;

      const [visitor] = await tx.insert(visitorsTable).values({
        id: visitorRecordId,
        organizationId: orgId,
        appointmentId: current.id,
        visitorId: visitorNumber,
        name: submission.fullName,
        mobile: submission.mobile,
        email: submission.email,
        purpose: current.purpose,
        personToMeet: current.meetingPerson,
        personToMeetId: current.meetingPersonId,
        idProofType: submission.idProofType,
        idNumber: submission.idProofNumber,
        photoUrl: submission.photoUrl,
        qrCode: visitorNumber,
        scheduledFor: localDate(current.scheduledAt, current.timezone),
        status: "approved",
        approvedBy: user.userId,
        isBlacklisted: blacklisted,
        isFlagged: blacklisted,
        remarks: blacklisted ? `Security alert: matched blacklist entry "${blacklistMatches[0].reason}"` : null,
      }).returning();
      const pass = await makeAppointmentPass(tx, current, user.userId);
      await tx.insert(visitorAuditTable).values({
        organizationId: orgId,
        visitorId: visitor.id,
        action: "appointment_approved",
        actorUserId: user.userId,
        actorEmail: user.email,
        details: `Appointment ${current.appointmentNumber} approved; visitor record and QR pass created.`,
        createdAt: approvedAt,
      });
      await writeAppointmentAudit(tx, updatedAppointment, "approved", {
        userId: user.userId,
        email: user.email,
      }, `Appointment ${current.appointmentNumber} approved. ${parsed.data.reason || ""}`.trim());
      return { appointment: updatedAppointment, visitor, pass };
    });
    if (!result) {
      res.status(409).json({ error: "Appointment status changed before approval could be completed" });
      return;
    }

    if (current.meetingPersonId) {
      await db.insert(notificationsTable).values({
        organizationId: orgId,
        userId: current.meetingPersonId,
        message: `${submission.fullName} has an approved appointment on ${formattedAppointmentDate(current.scheduledAt, current.timezone)}.`,
        type: "info",
        readStatus: false,
        visitorId: visitorRecordId,
      });
    }
    let passUrl: string;
    try {
      passUrl = publicAppUrl(`/appointment-pass/${result.pass.token}`);
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Appointment pass links are not configured" });
      return;
    }
    const sms = await sendAppointmentSms({
      organizationId: orgId,
      appointmentId: current.id,
      recipient: submission.mobile,
      messageType: "approved",
      dedupeKey: `approved:${current.id}`,
      variables: {
        var1: submission.fullName,
        var2: current.appointmentNumber,
        var3: passUrl,
        var4: result.pass.passNumber,
        var5: formattedAppointmentDate(current.scheduledAt, current.timezone),
      },
    });
    res.json({
      appointment: formatAppointment(result.appointment),
      visitorId: result.visitor.id,
      visitorNumber: result.visitor.visitorId,
      visitorPassNumber: result.pass.passNumber,
      passUrl,
      sms: sms.status,
    });
  });

  app.post(`${api}/appointments/:id/issue-pass`, ...appointmentFeatureRoute, async (req, res): Promise<void> => {
    if (!requireAppointmentFeature(req, res, helpers) || !isWritableAdmin(req, res)) return;
    const orgId = helpers.organizationId(req);
    const user = (req as AuthenticatedRequest).user;
    const [appointment] = await db.select().from(appointmentsTable).where(and(
      eq(appointmentsTable.organizationId, orgId),
      eq(appointmentsTable.id, req.params.id),
      inArray(appointmentsTable.status, ["approved", "checked_in"]),
    ));
    if (!appointment) {
      res.status(409).json({ error: "Only approved or checked-in appointments can receive a pass" });
      return;
    }
    try {
      publicAppUrl("/appointment-pass/check");
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Appointment pass links are not configured" });
      return;
    }
    const pass = await db.transaction(async (tx) => {
      const newPass = await makeAppointmentPass(tx, appointment, user.userId);
      await writeAppointmentAudit(tx, appointment, "pass_issued", {
        userId: user.userId,
        email: user.email,
      }, `A new QR pass (${newPass.passNumber}) was issued and prior passes were revoked.`);
      return newPass;
    });
    res.json({
      visitorPassNumber: pass.passNumber,
      passUrl: publicAppUrl(`/appointment-pass/${pass.token}`),
    });
  });

  app.post(`${api}/appointments/:id/reject`, ...appointmentFeatureRoute, async (req, res): Promise<void> => {
    if (!requireAppointmentFeature(req, res, helpers) || !isWritableAdmin(req, res)) return;
    const parsed = RejectAppointmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "A rejection reason is required" });
      return;
    }
    const orgId = helpers.organizationId(req);
    const user = (req as AuthenticatedRequest).user;
    const [updated] = await db.update(appointmentsTable).set({
      status: "rejected",
      reviewedBy: user.userId,
      reviewedAt: new Date(),
      adminRemarks: parsed.data.reason,
      updatedAt: new Date(),
    }).where(and(
      eq(appointmentsTable.organizationId, orgId),
      eq(appointmentsTable.id, req.params.id),
      eq(appointmentsTable.status, "submitted"),
    )).returning();
    if (!updated) {
      res.status(409).json({ error: "Only submitted appointments can be rejected" });
      return;
    }
    await db.insert(appointmentAuditTable).values({
      organizationId: orgId,
      appointmentId: updated.id,
      action: "rejected",
      actorUserId: user.userId,
      actorEmail: user.email,
      details: `Appointment rejected. Reason: ${parsed.data.reason}`,
    });
    const sms = await sendAppointmentSms({
      organizationId: orgId,
      appointmentId: updated.id,
      recipient: updated.mobile,
      messageType: "rejected",
      dedupeKey: `rejected:${updated.id}`,
      variables: { var1: updated.visitorName, var2: updated.appointmentNumber, var3: parsed.data.reason },
    });
    res.json({ appointment: formatAppointment(updated), sms: sms.status });
  });

  app.post(`${api}/appointments/:id/cancel`, ...appointmentFeatureRoute, async (req, res): Promise<void> => {
    if (!requireAppointmentFeature(req, res, helpers) || !isWritableAdmin(req, res)) return;
    const parsed = AppointmentActionBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid cancellation reason" });
      return;
    }
    const orgId = helpers.organizationId(req);
    const user = (req as AuthenticatedRequest).user;
    const cancelledAt = new Date();
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(appointmentsTable).set({
        status: "cancelled",
        cancellationReason: parsed.data.reason || "Cancelled by administrator",
        updatedAt: cancelledAt,
      }).where(and(
        eq(appointmentsTable.organizationId, orgId),
        eq(appointmentsTable.id, req.params.id),
        inArray(appointmentsTable.status, ["pending", "submitted", "approved"]),
      )).returning();
      if (!updated) return null;
      await tx.update(appointmentRemindersTable).set({
        status: "cancelled",
        processingStartedAt: null,
      }).where(and(
        eq(appointmentRemindersTable.organizationId, orgId),
        eq(appointmentRemindersTable.appointmentId, updated.id),
        inArray(appointmentRemindersTable.status, ["pending", "failed", "processing"]),
      ));
      const [visitor] = await tx.update(visitorsTable).set({ status: "cancelled" }).where(and(
        eq(visitorsTable.organizationId, orgId),
        eq(visitorsTable.appointmentId, updated.id),
        inArray(visitorsTable.status, ["approved", "scheduled"]),
      )).returning();
      if (visitor) {
        await tx.insert(visitorAuditTable).values({
          organizationId: orgId,
          visitorId: visitor.id,
          action: "appointment_cancelled",
          actorUserId: user.userId,
          actorEmail: user.email,
          details: `Appointment ${updated.appointmentNumber} cancelled. ${parsed.data.reason}`,
          createdAt: cancelledAt,
        });
      }
      await tx.update(appointmentPassesTable).set({ revokedAt: cancelledAt }).where(and(
        eq(appointmentPassesTable.organizationId, orgId),
        eq(appointmentPassesTable.appointmentId, updated.id),
        isNull(appointmentPassesTable.revokedAt),
      ));
      await writeAppointmentAudit(tx, updated, "cancelled", {
        userId: user.userId,
        email: user.email,
      }, parsed.data.reason || "Cancelled by administrator.");
      return updated;
    });
    if (!result) {
      res.status(409).json({ error: "This appointment cannot be cancelled from its current status" });
      return;
    }
    const sms = await sendAppointmentSms({
      organizationId: orgId,
      appointmentId: result.id,
      recipient: result.mobile,
      messageType: "cancelled",
      dedupeKey: `cancelled:${result.id}`,
      variables: { var1: result.visitorName, var2: result.appointmentNumber, var3: parsed.data.reason || "Cancelled by administrator" },
    });
    res.json({ appointment: formatAppointment(result), sms: sms.status });
  });

  app.post(`${api}/appointments/:id/reschedule`, ...appointmentFeatureRoute, async (req, res): Promise<void> => {
    if (!requireAppointmentFeature(req, res, helpers) || !isWritableAdmin(req, res)) return;
    const parsed = RescheduleAppointmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid reschedule details" });
      return;
    }
    const orgId = helpers.organizationId(req);
    const user = (req as AuthenticatedRequest).user;
    const [current] = await db.select().from(appointmentsTable).where(and(
      eq(appointmentsTable.organizationId, orgId),
      eq(appointmentsTable.id, req.params.id),
    ));
    if (!current) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    let scheduledAt: Date;
    try {
      scheduledAt = dateAtTimezone(parsed.data.scheduledDate, parsed.data.scheduledTime, current.timezone);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid appointment time" });
      return;
    }
    if (scheduledAt <= new Date()) {
      res.status(400).json({ error: "Appointment must be rescheduled to a future date and time" });
      return;
    }
    if (current.status === "approved") {
      try {
        publicAppUrl("/appointment-pass/check");
      } catch (error) {
        res.status(503).json({ error: error instanceof Error ? error.message : "Appointment pass links are not configured" });
        return;
      }
    }
    const updated = await db.transaction(async (tx) => {
      const [appointment] = await tx.update(appointmentsTable).set({
        scheduledAt,
        registrationExpiresAt: scheduledAt,
        rescheduleReason: parsed.data.reason,
        updatedAt: new Date(),
      }).where(and(
        eq(appointmentsTable.organizationId, orgId),
        eq(appointmentsTable.id, current.id),
        inArray(appointmentsTable.status, ["pending", "submitted", "approved"]),
      )).returning();
      if (!appointment) return null;
      await tx.update(appointmentRemindersTable).set({
        status: "cancelled",
        processingStartedAt: null,
      }).where(and(
        eq(appointmentRemindersTable.organizationId, orgId),
        eq(appointmentRemindersTable.appointmentId, current.id),
        inArray(appointmentRemindersTable.status, ["pending", "failed", "processing"]),
      ));
      await scheduleReminders(tx, appointment, new Date());
      if (appointment.status === "approved") {
        await tx.update(appointmentPassesTable).set({ revokedAt: new Date() }).where(and(
          eq(appointmentPassesTable.organizationId, orgId),
          eq(appointmentPassesTable.appointmentId, appointment.id),
          isNull(appointmentPassesTable.revokedAt),
        ));
        await tx.update(visitorsTable).set({
          scheduledFor: localDate(scheduledAt, current.timezone),
        }).where(and(
          eq(visitorsTable.organizationId, orgId),
          eq(visitorsTable.appointmentId, appointment.id),
        ));
      }
      await writeAppointmentAudit(tx, appointment, "rescheduled", {
        userId: user.userId,
        email: user.email,
      }, `Appointment rescheduled to ${formattedAppointmentDate(scheduledAt, current.timezone)}. Reason: ${parsed.data.reason}`);
      return appointment;
    });
    if (!updated) {
      res.status(409).json({ error: "This appointment cannot be rescheduled from its current status" });
      return;
    }

    let passUrl = "";
    let passNumber = "";
    if (updated.status === "approved") {
      const pass = await db.transaction(async (tx) => makeAppointmentPass(tx, updated, user.userId));
      passUrl = publicAppUrl(`/appointment-pass/${pass.token}`);
      passNumber = pass.passNumber;
    }
    const sms = await sendAppointmentSms({
      organizationId: orgId,
      appointmentId: updated.id,
      recipient: updated.mobile,
      messageType: "rescheduled",
      dedupeKey: `rescheduled:${updated.id}:${scheduledAt.getTime()}`,
      variables: {
        var1: updated.visitorName,
        var2: updated.appointmentNumber,
        var3: formattedAppointmentDate(scheduledAt, updated.timezone),
        var4: passUrl,
        var5: passNumber,
      },
    });
    res.json({ appointment: formatAppointment(updated), sms: sms.status, passUrl: passUrl || undefined });
  });

  app.post(`${api}/appointments/sms/:logId/retry`, ...appointmentFeatureRoute, async (req, res): Promise<void> => {
    if (!requireAppointmentFeature(req, res, helpers) || !helpers.requireFeature("sms", req, res) || !isWritableAdmin(req, res)) return;
    const orgId = helpers.organizationId(req);
    const logId = Number(req.params.logId);
    if (!Number.isSafeInteger(logId) || logId < 1) {
      res.status(400).json({ error: "Invalid SMS log identifier" });
      return;
    }
    const [logEntry] = await db.select().from(appointmentSmsLogsTable).where(and(
      eq(appointmentSmsLogsTable.organizationId, orgId),
      eq(appointmentSmsLogsTable.id, logId),
    ));
    if (!logEntry) {
      res.status(404).json({ error: "SMS log was not found" });
      return;
    }
    if (logEntry.status !== "failed") {
      res.status(409).json({ error: "Only failed SMS notifications can be retried" });
      return;
    }
    if (!logEntry.appointmentId) {
      res.status(409).json({ error: "The SMS is not linked to an active appointment" });
      return;
    }
    const [appointment] = await db.select().from(appointmentsTable).where(and(
      eq(appointmentsTable.organizationId, orgId),
      eq(appointmentsTable.id, logEntry.appointmentId),
    ));
    if (!appointment) {
      res.status(409).json({ error: "The appointment associated with this SMS no longer exists" });
      return;
    }
    const [submission] = await db.select().from(appointmentSubmissionsTable).where(and(
      eq(appointmentSubmissionsTable.organizationId, orgId),
      eq(appointmentSubmissionsTable.appointmentId, appointment.id),
    ));
    const user = (req as AuthenticatedRequest).user;
    switch (logEntry.messageType) {
      case "registration_link":
        if (appointment.status !== "pending" || appointment.registrationExpiresAt <= new Date()) {
          res.status(409).json({ error: "Registration is no longer available for this appointment" });
          return;
        }
        try {
          publicAppUrl("/appointment/register/check");
        } catch (error) {
          res.status(503).json({ error: error instanceof Error ? error.message : "Appointment links are not configured" });
          return;
        }
        break;
      case "submission_confirmation":
        if (!submission) {
          res.status(409).json({ error: "Visitor registration details are no longer available" });
          return;
        }
        break;
      case "approved":
        if (!submission || !["approved", "checked_in"].includes(appointment.status)) {
          res.status(409).json({ error: "An active approved pass is required to retry this SMS" });
          return;
        }
        try {
          publicAppUrl("/appointment-pass/check");
        } catch (error) {
          res.status(503).json({ error: error instanceof Error ? error.message : "Appointment pass links are not configured" });
          return;
        }
        break;
      case "rejected":
        if (appointment.status !== "rejected") {
          res.status(409).json({ error: "This rejection notification is no longer applicable" });
          return;
        }
        break;
      case "cancelled":
        if (appointment.status !== "cancelled") {
          res.status(409).json({ error: "This cancellation notification is no longer applicable" });
          return;
        }
        break;
      case "rescheduled":
        if (!["pending", "submitted", "approved", "checked_in"].includes(appointment.status)) {
          res.status(409).json({ error: "This reschedule notification is no longer applicable" });
          return;
        }
        if (["approved", "checked_in"].includes(appointment.status)) {
          try {
            publicAppUrl("/appointment-pass/check");
          } catch (error) {
            res.status(503).json({ error: error instanceof Error ? error.message : "Appointment pass links are not configured" });
            return;
          }
        }
        break;
      case "reminder":
        if (!submission || appointment.status !== "approved") {
          res.status(409).json({ error: "Only reminders for approved appointments can be retried" });
          return;
        }
        break;
      default:
        res.status(400).json({ error: "This SMS type cannot be retried" });
        return;
    }

    const claim = await claimAppointmentSms({
      organizationId: orgId,
      appointmentId: appointment.id,
      recipient: logEntry.recipient,
      messageType: logEntry.messageType as AppointmentSmsType,
      dedupeKey: logEntry.dedupeKey,
      variables: {},
    });
    if (!claim.claimed) {
      res.status(409).json({ error: "This SMS is already being sent or has already succeeded" });
      return;
    }

    let messageType: AppointmentSmsType;
    let variables: Record<string, string>;
    let registrationUrl: string | undefined;
    let passUrl: string | undefined;

    try {
      switch (logEntry.messageType) {
      case "registration_link": {
        const token = randomBytes(32).toString("base64url");
        registrationUrl = publicAppUrl(`/appointment/register/${token}`);
        const [rotated] = await db.update(appointmentsTable).set({
          registrationTokenHash: appointmentTokenHash(token),
          updatedAt: new Date(),
        }).where(and(
          eq(appointmentsTable.organizationId, orgId),
          eq(appointmentsTable.id, appointment.id),
          eq(appointmentsTable.status, "pending"),
          gte(appointmentsTable.registrationExpiresAt, new Date()),
        )).returning({ id: appointmentsTable.id });
        if (!rotated) {
          await markAppointmentSmsFailed(claim.entry.id, "Appointment status changed before the registration link could be resent");
          res.status(409).json({ error: "Registration is no longer available for this appointment" });
          return;
        }
        messageType = "registration_link";
        variables = { var1: appointment.visitorName, var2: appointment.appointmentNumber, var3: registrationUrl };
        break;
      }
      case "submission_confirmation":
        messageType = "submission_confirmation";
        variables = { var1: submission!.fullName, var2: appointment.appointmentNumber };
        break;
      case "approved": {
        const pass = await db.transaction(async (tx) => makeAppointmentPass(tx, appointment, user.userId));
        messageType = "approved";
        passUrl = publicAppUrl(`/appointment-pass/${pass.token}`);
        variables = {
          var1: submission!.fullName,
          var2: appointment.appointmentNumber,
          var3: passUrl,
          var4: pass.passNumber,
          var5: formattedAppointmentDate(appointment.scheduledAt, appointment.timezone),
        };
        break;
      }
      case "rejected":
        messageType = "rejected";
        variables = { var1: appointment.visitorName, var2: appointment.appointmentNumber, var3: appointment.adminRemarks ?? "" };
        break;
      case "cancelled":
        messageType = "cancelled";
        variables = { var1: appointment.visitorName, var2: appointment.appointmentNumber, var3: appointment.cancellationReason ?? "" };
        break;
      case "rescheduled": {
        let passUrl = "";
        let passNumber = "";
        if (appointment.status === "approved" || appointment.status === "checked_in") {
          const pass = await db.transaction(async (tx) => makeAppointmentPass(tx, appointment, user.userId));
          passUrl = publicAppUrl(`/appointment-pass/${pass.token}`);
          passNumber = pass.passNumber;
        }
        messageType = "rescheduled";
        variables = {
          var1: appointment.visitorName,
          var2: appointment.appointmentNumber,
          var3: formattedAppointmentDate(appointment.scheduledAt, appointment.timezone),
          var4: passUrl,
          var5: passNumber,
        };
        break;
      }
      case "reminder": {
        const [pass] = await db.select().from(appointmentPassesTable).where(and(
          eq(appointmentPassesTable.organizationId, orgId),
          eq(appointmentPassesTable.appointmentId, appointment.id),
          isNull(appointmentPassesTable.revokedAt),
        )).orderBy(desc(appointmentPassesTable.createdAt)).limit(1);
        messageType = "reminder";
        variables = {
          var1: submission!.fullName,
          var2: appointment.appointmentNumber,
          var3: formattedAppointmentDate(appointment.scheduledAt, appointment.timezone),
          var4: pass?.visitorPassNumber ?? "",
        };
        break;
      }
      default:
        throw new Error("Unsupported appointment SMS type");
      }

      const retry = await sendClaimedAppointmentSms({
        organizationId: orgId,
        appointmentId: appointment.id,
        recipient: logEntry.recipient,
        messageType,
        dedupeKey: logEntry.dedupeKey,
        variables,
      }, claim.entry);
      res.json({ sms: retry.status, registrationUrl, passUrl });
    } catch (error) {
      await markAppointmentSmsFailed(claim.entry.id, error instanceof Error ? error.message : "SMS retry failed");
      console.error("Appointment SMS retry failed:", error);
      res.status(500).json({ error: "The SMS retry could not be completed. Check the appointment SMS log." });
    }
  });

  app.get(`${api}/appointments/passes/verify/:token`, ...organizationRoute, async (req, res): Promise<void> => {
    if (!requireAppointmentFeature(req, res, helpers)) return;
    const role = (req as AuthenticatedRequest).user.role;
    if (role !== "admin" && role !== "security") {
      res.status(403).json({ error: "Administrator or security access is required" });
      return;
    }
    const orgId = helpers.organizationId(req);
    const [pass] = await db.select().from(appointmentPassesTable).where(and(
      eq(appointmentPassesTable.organizationId, orgId),
      eq(appointmentPassesTable.tokenHash, appointmentTokenHash(req.params.token)),
      isNull(appointmentPassesTable.revokedAt),
    ));
    if (!pass) {
      res.status(404).json({ error: "Appointment pass is invalid or revoked" });
      return;
    }
    const [appointment] = await db.select().from(appointmentsTable).where(and(
      eq(appointmentsTable.organizationId, orgId),
      eq(appointmentsTable.id, pass.appointmentId),
    ));
    const [visitor] = await db.select({
      id: visitorsTable.id,
      visitorId: visitorsTable.visitorId,
      name: visitorsTable.name,
      mobile: visitorsTable.mobile,
      status: visitorsTable.status,
      checkIn: visitorsTable.checkIn,
      checkOut: visitorsTable.checkOut,
      idCardNumber: visitorsTable.idCardNumber,
    }).from(visitorsTable).where(and(
      eq(visitorsTable.organizationId, orgId),
      eq(visitorsTable.appointmentId, pass.appointmentId),
    ));
    if (!appointment || !visitor) {
      res.status(404).json({ error: "Approved visitor record was not found for this pass" });
      return;
    }
    if (new Date() < pass.validFrom || new Date() > pass.validUntil) {
      res.status(410).json({ error: "Appointment pass is outside its valid time window" });
      return;
    }
    res.json({
      appointmentNumber: appointment.appointmentNumber,
      visitorPassNumber: pass.visitorPassNumber,
      scheduledAt: appointment.scheduledAt.toISOString(),
      timezone: appointment.timezone,
      purpose: appointment.purpose,
      meetingPerson: appointment.meetingPerson,
      department: appointment.department,
      appointmentStatus: appointment.status,
      visitor,
    });
  });
}

let reminderProcessorRunning = false;

export async function processAppointmentReminders(): Promise<void> {
  if (reminderProcessorRunning) return;
  reminderProcessorRunning = true;
  try {
    const now = new Date();
    await db.update(appointmentRemindersTable).set({
      status: "failed",
      processingStartedAt: null,
      lastError: "Reminder processing lease expired",
    }).where(and(
      eq(appointmentRemindersTable.status, "processing"),
      lte(appointmentRemindersTable.processingStartedAt, new Date(now.getTime() - 15 * 60 * 1000)),
    ));
    await db.update(appointmentsTable).set({ status: "expired", updatedAt: now }).where(and(
      eq(appointmentsTable.status, "pending"),
      lt(appointmentsTable.registrationExpiresAt, now),
    ));
    await db.delete(appointmentRateLimitsTable).where(lt(appointmentRateLimitsTable.windowStartedAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
    const due = await db.select().from(appointmentRemindersTable).where(and(
      inArray(appointmentRemindersTable.status, ["pending", "failed"]),
      lte(appointmentRemindersTable.dueAt, now),
      lt(appointmentRemindersTable.attemptCount, 3),
    )).orderBy(appointmentRemindersTable.dueAt).limit(50);
    for (const reminder of due) {
      const [claimed] = await db.update(appointmentRemindersTable).set({
        status: "processing",
        attemptCount: reminder.attemptCount + 1,
        processingStartedAt: now,
      }).where(and(
        eq(appointmentRemindersTable.id, reminder.id),
        inArray(appointmentRemindersTable.status, ["pending", "failed"]),
      )).returning();
      if (!claimed) continue;

      if (!await checkPublicFeatureAccess(reminder.organizationId, true)) {
        await db.update(appointmentRemindersTable).set({
          status: "cancelled",
          processingStartedAt: null,
        })
          .where(eq(appointmentRemindersTable.id, reminder.id));
        continue;
      }

      const [[appointment], [submission]] = await Promise.all([
        db.select().from(appointmentsTable).where(and(
          eq(appointmentsTable.organizationId, reminder.organizationId),
          eq(appointmentsTable.id, reminder.appointmentId),
        )),
        db.select().from(appointmentSubmissionsTable).where(and(
          eq(appointmentSubmissionsTable.organizationId, reminder.organizationId),
          eq(appointmentSubmissionsTable.appointmentId, reminder.appointmentId),
        )),
      ]);
      if (!appointment || !submission || appointment.status !== "approved") {
       await db.update(appointmentRemindersTable).set({
         status: "cancelled",
         processingStartedAt: null,
       })
          .where(eq(appointmentRemindersTable.id, reminder.id));
        continue;
      }
      const [pass] = await db.select().from(appointmentPassesTable).where(and(
        eq(appointmentPassesTable.organizationId, reminder.organizationId),
        eq(appointmentPassesTable.appointmentId, appointment.id),
        isNull(appointmentPassesTable.revokedAt),
      )).orderBy(desc(appointmentPassesTable.createdAt)).limit(1);
      const sms = await sendAppointmentSms({
        organizationId: reminder.organizationId,
        appointmentId: appointment.id,
        recipient: submission.mobile,
        messageType: "reminder",
        dedupeKey: `reminder:${reminder.id}`,
        variables: {
          var1: submission.fullName,
          var2: appointment.appointmentNumber,
          var3: formattedAppointmentDate(appointment.scheduledAt, appointment.timezone),
          var4: pass?.visitorPassNumber ?? "",
        },
      });
      await db.update(appointmentRemindersTable).set({
        status: sms.status === "sent" || sms.status === "delivered" ? "sent" : "failed",
        sentAt: sms.status === "sent" || sms.status === "delivered" ? new Date() : null,
        processingStartedAt: null,
        lastError: sms.lastError,
      }).where(and(
        eq(appointmentRemindersTable.id, reminder.id),
        eq(appointmentRemindersTable.status, "processing"),
      ));
    }
  } catch (error) {
    console.error("Appointment reminder processing failed:", error);
  } finally {
    reminderProcessorRunning = false;
  }
}

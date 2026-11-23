import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { eq, and, or, ilike, gte, lte, lt, desc, inArray, count, sql, isNotNull, isNull } from "drizzle-orm";
import { db } from "./db";
import { z } from "zod/v4";
import { authMiddleware, hashPassword, signToken, verifyPassword, type AuthenticatedRequest } from "./auth";
import {
  organizationsTable,
  usersTable,
  visitorsTable,
  blacklistTable,
  notificationsTable,
  systemSettingsTable,
  subscriptionsTable,
  subscriptionInvoicesTable,
  subscriptionPlanRequestsTable,
  subscriptionUsageAlertsTable,
  visitorAuditTable,
  visitorGadgetsTable,
  appointmentsTable,
  appointmentAuditTable,
  LoginBody,
  SignupBody,
  CreateVisitorBody,
  UpdateVisitorBody,
  GetVisitorsQueryParams,
  LookupVisitorByMobileQueryParams,
  ApproveVisitorBody,
  CheckinVisitorBody,
  ManualCheckoutBody,
  GetReportsQueryParams,
  CreateUserBody,
  UpdateUserBody,
  AddToBlacklistBody,
  UpdateBlacklistBody,
  UpdateSystemSettingsBody,
  ReviewVisitorGadgetBody,
} from "../shared/schema.ts";
import { getSystemSettings } from "./settings";
import { registerAppointmentRoutes } from "./appointment-routes";
import { PLANS, isPlanId, planHasFeature, type BillingCycle, type PlanId, type LiveFeatureKey } from "../shared/plans";
import { distanceInMeters } from "../shared/location";

const publicVisitorLocationBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().min(0).max(10_000),
  }),
  z.object({ action: z.literal("stop") }),
]);

type AuthedRequest = AuthenticatedRequest;

function requireOrganization(req: Request, res: Response, next: NextFunction): void {
  if (!(req as AuthedRequest).org) {
    res.status(403).json({ error: "Organization access is required" });
    return;
  }
  next();
}

function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if ((req as AuthedRequest).user.role !== "superadmin") {
    res.status(403).json({ error: "Super-admin access is required" });
    return;
  }
  next();
}

function organizationId(req: Request): number {
  const organization = (req as AuthedRequest).org;
  if (!organization) throw new Error("Tenant route was accessed without an organization context");
  return organization.id;
}

function requireFeature(feature: LiveFeatureKey, req: Request, res: Response): boolean {
  const organization = (req as AuthedRequest).org;
  if (!organization || !planHasFeature(organization.planId, feature)) {
    res.status(403).json({
      error: `This feature is not included in your current plan.`,
      code: "feature_not_in_plan",
      feature,
    });
    return false;
  }
  return true;
}

async function checkVisitorCapacity(req: Request, res: Response, timezone: string): Promise<boolean> {
  const orgId = organizationId(req);
  const organization = (req as AuthedRequest).org!;
  const limit = PLANS[organization.planId].limits.visitorsPerMonth;
  if (limit === null) return true;

  const [{ value: used }] = await db.select({ value: count() }).from(visitorsTable).where(and(
    eq(visitorsTable.organizationId, orgId),
    sql`date_trunc('month', ${visitorsTable.createdAt} AT TIME ZONE ${timezone}) =
        date_trunc('month', now() AT TIME ZONE ${timezone})`,
  ));
  if (used >= limit) {
    res.status(429).json({
      error: "Your monthly visitor limit has been reached. Upgrade your plan to register more visitors.",
      code: "visitor_limit_reached",
      limit,
      used,
    });
    return false;
  }

  if (used + 1 >= Math.ceil(limit * 0.8)) {
    const monthParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const monthKey = `${monthParts.find((part) => part.type === "year")?.value}-${monthParts.find((part) => part.type === "month")?.value}`;
    const [alert] = await db.insert(subscriptionUsageAlertsTable).values({
      organizationId: orgId,
      monthKey,
      alertType: "visitor_80_percent",
    }).onConflictDoNothing().returning({ id: subscriptionUsageAlertsTable.id });
    if (alert) {
      const admins = await db.select({ id: usersTable.id }).from(usersTable).where(and(
        eq(usersTable.organizationId, orgId),
        eq(usersTable.role, "admin"),
      ));
      if (admins.length > 0) {
        await db.insert(notificationsTable).values(admins.map((admin) => ({
          organizationId: orgId,
          userId: admin.id,
          message: `Your organization has used at least 80% of its ${limit} monthly visitor limit.`,
          type: "warning",
          readStatus: false,
        })));
      }
    }
  }
  return true;
}

async function checkStaffCapacity(req: Request, res: Response): Promise<boolean> {
  const orgId = organizationId(req);
  const organization = (req as AuthedRequest).org!;
  const limit = PLANS[organization.planId].limits.staffUsers;
  if (limit === null) return true;

  const [{ value: used }] = await db.select({ value: count() }).from(usersTable)
    .where(eq(usersTable.organizationId, orgId));
  if (used >= limit) {
    res.status(429).json({
      error: "Your staff-user limit has been reached. Upgrade your plan to add more users.",
      code: "staff_limit_reached",
      limit,
      used,
    });
    return false;
  }
  return true;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function dateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  if (!values.year || !values.month || !values.day) throw new Error("Unable to determine local report date");
  return `${values.year}-${values.month}-${values.day}`;
}

function formatVisitor(v: typeof visitorsTable.$inferSelect, includeCurrentLocation = false) {
  const duration =
    v.checkIn && v.checkOut
      ? formatDuration(new Date(v.checkOut).getTime() - new Date(v.checkIn).getTime())
      : v.checkIn
      ? formatDuration(Date.now() - new Date(v.checkIn).getTime())
      : null;

  return {
    ...v,
    email: v.email ?? null,
    photoUrl: v.photoUrl ?? null,
    qrCode: v.qrCode ?? null,
    checkIn: v.checkIn ? v.checkIn.toISOString() : null,
    checkOut: v.checkOut ? v.checkOut.toISOString() : null,
    duration,
    remarks: v.remarks ?? null,
    currentLocationLatitude: includeCurrentLocation ? v.currentLocationLatitude : null,
    currentLocationLongitude: includeCurrentLocation ? v.currentLocationLongitude : null,
    currentLocationUpdatedAt: includeCurrentLocation ? v.currentLocationUpdatedAt?.toISOString() ?? null : null,
    createdAt: v.createdAt.toISOString(),
  };
}

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    organizationId: u.organizationId,
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  };
}

function formatBlacklist(b: typeof blacklistTable.$inferSelect) {
  return {
    id: b.id,
    name: b.name,
    mobile: b.mobile,
    reason: b.reason,
    addedBy: b.addedBy,
    createdAt: b.createdAt.toISOString(),
  };
}

function formatNotification(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id,
    userId: n.userId,
    message: n.message,
    type: n.type,
    readStatus: n.readStatus,
    createdAt: n.createdAt.toISOString(),
    visitorId: n.visitorId ?? null,
  };
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findBlacklistMatchEntry(entries: Array<typeof blacklistTable.$inferSelect>, name: string, mobile: string) {
  const normalizedName = normalizeText(name);
  const normalizedMobile = normalizeText(mobile);

  return entries.find((entry) => {
    const entryName = normalizeText(entry.name);
    const entryMobile = normalizeText(entry.mobile);

    if (entryMobile && normalizedMobile && entryMobile === normalizedMobile) return true;
    if (!entryName || !normalizedName) return false;

    return entryName === normalizedName || entryName.includes(normalizedName) || normalizedName.includes(entryName);
  }) ?? null;
}

function hasBlacklistMatch(entries: Array<typeof blacklistTable.$inferSelect>, name: string, mobile: string): boolean {
  return !!findBlacklistMatchEntry(entries, name, mobile);
}

function buildVisitorWithBlacklistFlag<T extends { name: string; mobile: string; isBlacklisted: boolean }>(
  entry: T,
  blacklistEntries: Array<typeof blacklistTable.$inferSelect>,
) {
  return {
    ...entry,
    isBlacklisted: entry.isBlacklisted || hasBlacklistMatch(blacklistEntries, entry.name, entry.mobile),
  };
}

function generateVisitorId(): string {
  const prefix = "VMS";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

function generateId(): string {
  return crypto.randomUUID();
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

export async function registerRoutes(_httpServer: Server, app: Express) {
  const api = "/api";

  /* ---------------------------------- health --------------------------------- */
  app.get(`${api}/healthz`, (_req, res) => {
    res.json({ status: "ok" });
  });

  registerAppointmentRoutes(app, {
    requireOrganization,
    organizationId,
    requireFeature,
    checkVisitorCapacity,
  });

  /* ----------------------------------- auth ----------------------------------- */
  app.post(`${api}/auth/signup`, async (req, res): Promise<void> => {
    const parsed = SignupBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid signup details" });
      return;
    }

    const name = parsed.data.name;
    const organizationName = parsed.data.organizationName?.trim() || `${name}'s organization`;
    const email = parsed.data.email.toLowerCase();
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
    if (existing.length > 0) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const slugBase = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "organization";
    const slug = `${slugBase}-${generateId().slice(0, 8)}`;
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const user = await db.transaction(async (tx) => {
      const [organization] = await tx.insert(organizationsTable).values({
        name: organizationName,
        slug,
        contactEmail: email,
      }).returning();
      const [createdUser] = await tx.insert(usersTable).values({
        organizationId: organization.id,
        name,
        email,
        role: "admin",
        password: hashPassword(parsed.data.password),
      }).returning();
      await tx.insert(subscriptionsTable).values({
        organizationId: organization.id,
        planId: "business",
        status: "trial",
        billingCycle: "annual",
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
      });
      await tx.insert(systemSettingsTable).values({
        organizationId: organization.id,
        facilityName: organizationName,
        contactEmail: email,
      });
      return createdUser;
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });
    res.status(201).json({ token, user: formatUser(user) });
  });

  app.post(`${api}/auth/login`, async (req, res): Promise<void> => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { password } = parsed.data;
    const email = parsed.data.email.toLowerCase();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const passwordVerification = verifyPassword(password, user.password);
    if (!passwordVerification.valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    if (passwordVerification.needsUpgrade) {
      const [upgradedUser] = await db.update(usersTable)
        .set({ password: hashPassword(password) })
        .where(eq(usersTable.id, user.id))
        .returning();
      user.password = upgradedUser.password;
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });

    res.json({ token, user: formatUser(user) });
  });

  app.get(`${api}/auth/me`, authMiddleware, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    const [found] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));
    if (!found) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(formatUser(found));
  });

  app.get(`${api}/public/visitor-pass/:id`, async (req, res): Promise<void> => {
    const [visitor] = await db.select({
      visitorId: visitorsTable.visitorId,
      name: visitorsTable.name,
      personToMeet: visitorsTable.personToMeet,
      photoUrl: visitorsTable.photoUrl,
      status: visitorsTable.status,
      scheduledFor: visitorsTable.scheduledFor,
      createdAt: visitorsTable.createdAt,
      organizationId: visitorsTable.organizationId,
    }).from(visitorsTable).where(eq(visitorsTable.id, req.params.id));
    if (!visitor) {
      res.status(404).json({ error: "Visitor pass not found" });
      return;
    }

    const settings = await getSystemSettings(visitor.organizationId);
    const trackingAvailable = visitor.status === "checked_in" &&
      settings.receptionLatitude !== null &&
      settings.receptionLongitude !== null;
    res.json({
      visitorId: visitor.visitorId,
      name: visitor.name,
      personToMeet: visitor.personToMeet,
      photoUrl: visitor.photoUrl ?? null,
      status: visitor.status,
      scheduledFor: visitor.scheduledFor,
      createdAt: visitor.createdAt.toISOString(),
      facilityName: settings.facilityName,
      companyLogo: settings.companyLogo ?? null,
      trackingAvailable,
      receptionCoordinates: trackingAvailable
        ? { latitude: settings.receptionLatitude!, longitude: settings.receptionLongitude! }
        : null,
    });
  });

  app.post(`${api}/public/visitor-pass/:id/location`, async (req, res): Promise<void> => {
    const parsed = publicVisitorLocationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid visitor location update" });
      return;
    }

    const [visitor] = await db.select({
      id: visitorsTable.id,
      organizationId: visitorsTable.organizationId,
      status: visitorsTable.status,
    }).from(visitorsTable).where(eq(visitorsTable.id, req.params.id));
    if (!visitor) {
      res.status(404).json({ error: "Visitor pass not found" });
      return;
    }
    if (visitor.status !== "checked_in") {
      res.status(409).json({ error: "Location sharing is available only while the visitor is checked in" });
      return;
    }

    const clearCurrentLocation = async () => {
      await db.update(visitorsTable).set({
        currentLocationLatitude: null,
        currentLocationLongitude: null,
        currentLocationUpdatedAt: null,
      }).where(and(
        eq(visitorsTable.id, visitor.id),
        eq(visitorsTable.organizationId, visitor.organizationId),
        eq(visitorsTable.status, "checked_in"),
      ));
    };

    if (parsed.data.action === "stop") {
      await clearCurrentLocation();
      res.json({ stored: false, reason: "stopped" });
      return;
    }

    const settings = await getSystemSettings(visitor.organizationId);
    if (settings.receptionLatitude === null || settings.receptionLongitude === null) {
      res.status(409).json({ error: "Reception location is not configured" });
      return;
    }
    if (parsed.data.accuracyMeters > 100) {
      await clearCurrentLocation();
      res.json({ stored: false, reason: "poor_accuracy" });
      return;
    }

    const distance = distanceInMeters(
      settings.receptionLatitude,
      settings.receptionLongitude,
      parsed.data.latitude,
      parsed.data.longitude,
    );
    if (distance > 500) {
      await clearCurrentLocation();
      res.json({ stored: false, reason: "outside_geofence" });
      return;
    }

    const [updated] = await db.update(visitorsTable).set({
      currentLocationLatitude: parsed.data.latitude,
      currentLocationLongitude: parsed.data.longitude,
      currentLocationUpdatedAt: new Date(),
    }).where(and(
      eq(visitorsTable.id, visitor.id),
      eq(visitorsTable.organizationId, visitor.organizationId),
      eq(visitorsTable.status, "checked_in"),
    )).returning({ id: visitorsTable.id });
    if (!updated) {
      res.status(409).json({ error: "Visitor is no longer checked in" });
      return;
    }
    res.json({ stored: true });
  });

  app.get(`${api}/settings`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const settings = await getSystemSettings(organizationId(req));
    const approvalsAvailable = planHasFeature((req as AuthedRequest).org!.planId, "approvals");
    res.json({ ...settings, requireApproval: settings.requireApproval && approvalsAvailable });
  });

  app.put(`${api}/settings`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Administrator access is required" });
      return;
    }

    const parsed = UpdateSystemSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid system settings" });
      return;
    }

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
    } catch {
      res.status(400).json({ error: "Enter a valid IANA timezone" });
      return;
    }

    if (parsed.data.requirePhoto && !requireFeature("mandatoryPhoto", req, res)) return;
    if (parsed.data.requireApproval && !requireFeature("approvals", req, res)) return;

    const orgId = organizationId(req);
    const settings = await db.transaction(async (tx) => {
      const [existing] = await tx.select({
        receptionLatitude: systemSettingsTable.receptionLatitude,
        receptionLongitude: systemSettingsTable.receptionLongitude,
      }).from(systemSettingsTable).where(eq(systemSettingsTable.organizationId, orgId));
      const [savedSettings] = await tx
        .insert(systemSettingsTable)
        .values({ organizationId: orgId, ...parsed.data })
        .onConflictDoUpdate({
          target: systemSettingsTable.organizationId,
          set: parsed.data,
        })
        .returning();

      if (existing && (
        existing.receptionLatitude !== parsed.data.receptionLatitude ||
        existing.receptionLongitude !== parsed.data.receptionLongitude
      )) {
        await tx.update(visitorsTable).set({
          currentLocationLatitude: null,
          currentLocationLongitude: null,
          currentLocationUpdatedAt: null,
        }).where(eq(visitorsTable.organizationId, orgId));
      }

      return savedSettings;
    });

    res.json(settings);
  });

  /* --------------------------------- visitors --------------------------------- */
  app.get(`${api}/visitors`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const params = GetVisitorsQueryParams.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }

    const { status, date, search, person_to_meet } = params.data;
    const conditions = [eq(visitorsTable.organizationId, organizationId(req))];
    if (status) conditions.push(eq(visitorsTable.status, status));
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      conditions.push(gte(visitorsTable.createdAt, start));
      conditions.push(lte(visitorsTable.createdAt, end));
    }
    if (search) {
      conditions.push(or(
        ilike(visitorsTable.name, `%${search}%`),
        ilike(visitorsTable.visitorId, `%${search}%`),
        ilike(visitorsTable.personToMeet, `%${search}%`),
        ilike(visitorsTable.purpose, `%${search}%`),
      )!);
    }
    if (person_to_meet) conditions.push(ilike(visitorsTable.personToMeet, `%${person_to_meet}%`));

    const blacklistEntries = await db.select().from(blacklistTable)
      .where(eq(blacklistTable.organizationId, organizationId(req)));
    const visitors = await db
      .select()
      .from(visitorsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(visitorsTable.createdAt));

    res.json(visitors.map((visitor) => formatVisitor(buildVisitorWithBlacklistFlag(visitor, blacklistEntries))));
  });

  app.get(`${api}/visitors/lookup`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const parsed = LookupVisitorByMobileQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid mobile number" });
      return;
    }

    const matches = await db.select({
      id: visitorsTable.id,
      name: visitorsTable.name,
      mobile: visitorsTable.mobile,
      email: visitorsTable.email,
      personToMeet: visitorsTable.personToMeet,
      idProofType: visitorsTable.idProofType,
      idNumber: visitorsTable.idNumber,
      createdAt: visitorsTable.createdAt,
    })
      .from(visitorsTable)
      .where(and(
        eq(visitorsTable.organizationId, organizationId(req)),
        eq(visitorsTable.mobile, parsed.data.mobile),
      ))
      .orderBy(desc(visitorsTable.createdAt))
      .limit(5);

    res.json(matches.map((visitor) => ({
      ...visitor,
      email: visitor.email ?? null,
      createdAt: visitor.createdAt.toISOString(),
    })));
  });

  app.post(`${api}/visitors`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const parsed = CreateVisitorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;
    const user = (req as AuthedRequest).user;
    const orgId = organizationId(req);
    const isScheduled = !!data.scheduledFor;
    if (isScheduled && user.role !== "admin") {
      res.status(403).json({ error: "Only administrators can schedule future visits" });
      return;
    }

    const settings = await getSystemSettings(orgId);
    const requireApproval = settings.requireApproval &&
      planHasFeature((req as AuthedRequest).org!.planId, "approvals");
    if (data.gadgets?.length && !requireFeature("gadgets", req, res)) return;
    if (data.personToMeetId) {
      const [host] = await db.select({ id: usersTable.id }).from(usersTable).where(and(
        eq(usersTable.organizationId, orgId),
        eq(usersTable.id, data.personToMeetId),
      ));
      if (!host) {
        res.status(400).json({ error: "The selected host does not belong to this organization" });
        return;
      }
    }
    if (settings.requirePhoto && !data.photoUrl) {
      res.status(400).json({ error: "A visitor photo is required by system settings" });
      return;
    }
    if (data.scheduledFor) {
      const currentDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: settings.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      if (data.scheduledFor < currentDate) {
        res.status(400).json({ error: "Scheduled visit date cannot be in the past" });
        return;
      }
    }

    if (!await checkVisitorCapacity(req, res, settings.timezone)) return;
    const id = generateId();
    const visitorId = generateVisitorId();
    const blacklistEntries = await db.select().from(blacklistTable)
      .where(eq(blacklistTable.organizationId, orgId));
    const blacklistMatch = findBlacklistMatchEntry(blacklistEntries, data.name, data.mobile);
    const isBlacklisted = !!blacklistMatch;

    const visitor = await db.transaction(async (tx) => {
      const [createdVisitor] = await tx
        .insert(visitorsTable)
        .values({
          id,
          organizationId: orgId,
          visitorId,
          name: data.name,
          mobile: data.mobile,
          email: data.email ?? null,
          purpose: data.purpose,
          personToMeet: data.personToMeet,
          personToMeetId: data.personToMeetId ?? null,
          idProofType: data.idProofType ?? "aadhar",
          idNumber: data.idNumber?.trim() ?? "",
          idCardNumber: data.idCardNumber?.trim() ?? null,
          photoUrl: data.photoUrl ?? null,
          qrCode: visitorId,
          scheduledFor: data.scheduledFor ?? null,
          status: isScheduled ? "scheduled" : requireApproval ? "pending" : "checked_in",
          checkIn: isScheduled || requireApproval ? null : new Date(),
          isBlacklisted,
          isFlagged: isBlacklisted,
          remarks: isBlacklisted ? `Security alert: matched blacklist reason "${blacklistMatch.reason}"` : null,
        })
        .returning();

      await tx.insert(visitorAuditTable).values({
        organizationId: orgId,
        visitorId: id,
        action: isScheduled ? "visit_scheduled" : requireApproval ? "approval_requested" : "registered",
        actorUserId: user.userId,
        actorEmail: user.email,
        details: `${isScheduled
          ? `Future visit scheduled for ${data.scheduledFor}.`
          : requireApproval
            ? "Visitor registered and is awaiting administrator approval."
            : "Visitor registered and checked in."} ID card number: ${data.idCardNumber?.trim() ?? "Not assigned at pre-registration"}.`,
      });
      if (requireApproval) {
        const admins = await tx.select({ id: usersTable.id }).from(usersTable)
          .where(and(
            eq(usersTable.organizationId, orgId),
            eq(usersTable.role, "admin"),
          ));
        if (admins.length > 0) {
          await tx.insert(notificationsTable).values(admins.map((admin) => ({
            organizationId: orgId,
            userId: admin.id,
            message: `${data.name} is awaiting administrator approval.`,
            type: "warning",
            readStatus: false,
            visitorId: id,
          })));
        }
      }
      if (data.gadgets?.length) {
        await tx.insert(visitorGadgetsTable).values(data.gadgets.map((gadget) => ({
          organizationId: orgId,
          visitorId: id,
          name: gadget.name,
          makeModel: gadget.makeModel || null,
          serialNumber: gadget.serialNumber || null,
        })));
        await tx.insert(visitorAuditTable).values({
          organizationId: orgId,
          visitorId: id,
          action: "gadgets_recorded",
          actorUserId: user.userId,
          actorEmail: user.email,
          details: `${data.gadgets.length} gadget${data.gadgets.length === 1 ? "" : "s"} recorded; approval is pending.`,
        });
        if (!isScheduled) {
          const reviewers = await tx.select({ id: usersTable.id }).from(usersTable)
            .where(and(
              eq(usersTable.organizationId, orgId),
              or(eq(usersTable.role, "admin"), eq(usersTable.role, "security")),
            ));
          if (reviewers.length > 0) {
            await tx.insert(notificationsTable).values(reviewers.map((reviewer) => ({
              organizationId: orgId,
              userId: reviewer.id,
              message: `${data.gadgets!.length} gadget${data.gadgets!.length === 1 ? "" : "s"} carried by ${data.name} need approval.`,
              type: "warning",
              readStatus: false,
              visitorId: id,
            })));
          }
        }
      }

      return createdVisitor;
    });

    if (data.personToMeetId && !isScheduled && !requireApproval) {
      await db.insert(notificationsTable).values({
        organizationId: orgId,
        userId: data.personToMeetId,
        message: `${data.name} has arrived to meet you. Purpose: ${data.purpose}`,
        type: "info",
        readStatus: false,
        visitorId: id,
      });
    }

    res.status(201).json(formatVisitor(visitor));
  });

  app.get(`${api}/visitors/:id`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const [visitor] = await db.select().from(visitorsTable).where(and(
      eq(visitorsTable.organizationId, organizationId(req)),
      eq(visitorsTable.id, req.params.id),
    ));
    if (!visitor) {
      res.status(404).json({ error: "Visitor not found" });
      return;
    }
    const blacklistEntries = await db.select().from(blacklistTable)
      .where(eq(blacklistTable.organizationId, organizationId(req)));
    const role = (req as AuthedRequest).user.role;
    res.json(formatVisitor(buildVisitorWithBlacklistFlag(visitor, blacklistEntries), role === "admin" || role === "security"));
  });

  app.get(`${api}/visitors/:id/audit`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const organization = (req as AuthedRequest).org!;
    const retentionDays = PLANS[organization.planId].limits.auditRetentionDays;
    const conditions = [
      eq(visitorAuditTable.organizationId, organization.id),
      eq(visitorAuditTable.visitorId, req.params.id),
    ];
    if (retentionDays !== null) {
      conditions.push(gte(visitorAuditTable.createdAt, new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)));
    }
    const entries = await db
      .select()
      .from(visitorAuditTable)
      .where(and(...conditions))
      .orderBy(desc(visitorAuditTable.createdAt));

    res.json(entries.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })));
  });

  app.get(`${api}/visitors/:id/gadgets`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    if (!requireFeature("gadgets", req, res)) return;
    const orgId = organizationId(req);
    const [visitor] = await db.select({ id: visitorsTable.id }).from(visitorsTable).where(and(
      eq(visitorsTable.organizationId, orgId),
      eq(visitorsTable.id, req.params.id),
    ));
    if (!visitor) {
      res.status(404).json({ error: "Visitor not found" });
      return;
    }
    const gadgets = await db.select().from(visitorGadgetsTable)
      .where(and(
        eq(visitorGadgetsTable.organizationId, orgId),
        eq(visitorGadgetsTable.visitorId, req.params.id),
      ))
      .orderBy(visitorGadgetsTable.createdAt);
    res.json(gadgets.map((gadget) => ({
      ...gadget,
      reviewedAt: gadget.reviewedAt?.toISOString() ?? null,
      returnedAt: gadget.returnedAt?.toISOString() ?? null,
      createdAt: gadget.createdAt.toISOString(),
    })));
  });

  app.get(`${api}/gadgets`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    if (!requireFeature("gadgets", req, res)) return;
    if (user.role !== "admin" && user.role !== "security") {
      res.status(403).json({ error: "Administrator or security access is required to export gadget details" });
      return;
    }
    const gadgets = await db.select().from(visitorGadgetsTable)
      .where(eq(visitorGadgetsTable.organizationId, organizationId(req)))
      .orderBy(visitorGadgetsTable.createdAt);
    res.json(gadgets.map((gadget) => ({
      ...gadget,
      reviewedAt: gadget.reviewedAt?.toISOString() ?? null,
      returnedAt: gadget.returnedAt?.toISOString() ?? null,
      createdAt: gadget.createdAt.toISOString(),
    })));
  });

  app.put(`${api}/visitors/:id/gadgets/:gadgetId/approval`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    if (!requireFeature("gadgets", req, res)) return;
    const user = (req as AuthedRequest).user;
    const orgId = organizationId(req);
    if (user.role !== "admin" && user.role !== "security") {
      res.status(403).json({ error: "Administrator or security access is required to review gadgets" });
      return;
    }
    const parsed = ReviewVisitorGadgetBody.safeParse(req.body);
    const gadgetId = Number(req.params.gadgetId);
    if (!parsed.success || !Number.isInteger(gadgetId) || gadgetId <= 0) {
      res.status(400).json({ error: "Invalid gadget review request" });
      return;
    }
    const [reviewed] = await db.transaction(async (tx) => {
      const [visitor] = await tx.select({ status: visitorsTable.status }).from(visitorsTable)
        .where(and(
          eq(visitorsTable.organizationId, orgId),
          eq(visitorsTable.id, req.params.id),
        ));
      if (!visitor || visitor.status !== "checked_in") return [null];
      const [gadget] = await tx.select().from(visitorGadgetsTable).where(and(
        eq(visitorGadgetsTable.id, gadgetId),
        eq(visitorGadgetsTable.organizationId, orgId),
        eq(visitorGadgetsTable.visitorId, req.params.id),
      ));
      if (!gadget || gadget.approvalStatus !== "pending") return [null];
      const [updated] = await tx.update(visitorGadgetsTable)
        .set({
          approvalStatus: parsed.data.action === "approve" ? "approved" : "rejected",
          reviewedBy: user.userId,
          reviewedAt: new Date(),
        })
        .where(and(
          eq(visitorGadgetsTable.id, gadgetId),
          eq(visitorGadgetsTable.organizationId, orgId),
          eq(visitorGadgetsTable.visitorId, req.params.id),
          eq(visitorGadgetsTable.approvalStatus, "pending"),
        ))
        .returning();
      if (!updated) return [null];
      await tx.insert(visitorAuditTable).values({
        organizationId: orgId,
        visitorId: req.params.id,
        action: parsed.data.action === "approve" ? "gadget_approved" : "gadget_rejected",
        actorUserId: user.userId,
        actorEmail: user.email,
        details: `${gadget.name} was ${parsed.data.action === "approve" ? "approved" : "rejected"} for entry.`,
      });
      return [updated];
    });
    if (!reviewed) {
      res.status(404).json({ error: "Pending gadget was not found" });
      return;
    }
    res.json({
      ...reviewed,
      reviewedAt: reviewed.reviewedAt?.toISOString() ?? null,
      returnedAt: reviewed.returnedAt?.toISOString() ?? null,
      createdAt: reviewed.createdAt.toISOString(),
    });
  });

  app.put(`${api}/visitors/:id/gadgets/:gadgetId/return`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    if (!requireFeature("gadgets", req, res)) return;
    const user = (req as AuthedRequest).user;
    const orgId = organizationId(req);
    if (user.role !== "admin" && user.role !== "security") {
      res.status(403).json({ error: "Administrator or security access is required to verify returned gadgets" });
      return;
    }
    const gadgetId = Number(req.params.gadgetId);
    if (!Number.isInteger(gadgetId) || gadgetId <= 0) {
      res.status(400).json({ error: "Invalid gadget ID" });
      return;
    }
    const [returned] = await db.transaction(async (tx) => {
      const [visitor] = await tx.select({ status: visitorsTable.status }).from(visitorsTable)
        .where(and(
          eq(visitorsTable.organizationId, orgId),
          eq(visitorsTable.id, req.params.id),
        ));
      if (!visitor || visitor.status !== "checked_in") return [null];
      const [gadget] = await tx.select().from(visitorGadgetsTable).where(and(
        eq(visitorGadgetsTable.id, gadgetId),
        eq(visitorGadgetsTable.organizationId, orgId),
        eq(visitorGadgetsTable.visitorId, req.params.id),
      ));
      if (!gadget || gadget.approvalStatus !== "approved" || gadget.returnedAt) return [null];
      const [updated] = await tx.update(visitorGadgetsTable)
        .set({ returnedAt: new Date() })
        .where(and(
          eq(visitorGadgetsTable.id, gadgetId),
          eq(visitorGadgetsTable.organizationId, orgId),
          eq(visitorGadgetsTable.visitorId, req.params.id),
          eq(visitorGadgetsTable.approvalStatus, "approved"),
        ))
        .returning();
      if (!updated) return [null];
      await tx.insert(visitorAuditTable).values({
        organizationId: orgId,
        visitorId: req.params.id,
        action: "gadget_returned",
        actorUserId: user.userId,
        actorEmail: user.email,
        details: `${gadget.name} return verified.`,
      });
      return [updated];
    });
    if (!returned) {
      res.status(404).json({ error: "Approved, unreturned gadget was not found" });
      return;
    }
    res.json({
      ...returned,
      reviewedAt: returned.reviewedAt?.toISOString() ?? null,
      returnedAt: returned.returnedAt?.toISOString() ?? null,
      createdAt: returned.createdAt.toISOString(),
    });
  });

  app.put(`${api}/visitors/:id`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const parsed = UpdateVisitorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;
    const orgId = organizationId(req);
    const blacklistEntries = await db.select().from(blacklistTable)
      .where(eq(blacklistTable.organizationId, orgId));
    const blacklistMatch = findBlacklistMatchEntry(blacklistEntries, data.name, data.mobile);
    const user = (req as AuthedRequest).user;
    const { updated, notFound } = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(visitorsTable).where(and(
        eq(visitorsTable.organizationId, orgId),
        eq(visitorsTable.id, req.params.id),
      ));
      if (!existing) return { updated: null, notFound: true };

      const changedFields = [
        ["name", existing.name !== data.name],
        ["mobile", existing.mobile !== data.mobile],
        ["email", (existing.email ?? "") !== (data.email ?? "")],
        ["purpose", existing.purpose !== data.purpose],
        ["person to meet", existing.personToMeet !== data.personToMeet],
        ["ID proof type", existing.idProofType !== data.idProofType],
        ["ID number", existing.idNumber !== data.idNumber],
        ["ID card number", existing.idCardNumber !== (data.idCardNumber?.trim() || existing.idCardNumber)],
      ].filter(([, changed]) => changed).map(([field]) => field);

      const [updatedVisitor] = await tx
        .update(visitorsTable)
        .set({
          name: data.name,
          mobile: data.mobile,
          email: data.email ?? null,
          purpose: data.purpose,
          personToMeet: data.personToMeet,
          idProofType: data.idProofType,
          idNumber: data.idNumber,
          idCardNumber: data.idCardNumber?.trim() || existing.idCardNumber,
          isBlacklisted: !!blacklistMatch,
          isFlagged: !!blacklistMatch,
        })
        .where(and(
          eq(visitorsTable.organizationId, orgId),
          eq(visitorsTable.id, req.params.id),
        ))
        .returning();

      if (changedFields.length > 0) {
        await tx.insert(visitorAuditTable).values({
          organizationId: orgId,
          visitorId: req.params.id,
          action: "edited",
          actorUserId: user.userId,
          actorEmail: user.email,
          details: `Updated visitor fields: ${changedFields.join(", ")}.`,
        });
      }

      return { updated: updatedVisitor, notFound: false };
    });

    if (notFound || !updated) {
      res.status(404).json({ error: "Visitor not found" });
      return;
    }

    res.json(formatVisitor(buildVisitorWithBlacklistFlag(updated, blacklistEntries)));
  });

  app.put(`${api}/visitors/:id/checkout-blocked`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    const orgId = organizationId(req);
    const attemptedAt = new Date();
    const result = await db.transaction(async (tx) => {
      const [visitor] = await tx.select({
        id: visitorsTable.id,
        status: visitorsTable.status,
        idCardNumber: visitorsTable.idCardNumber,
      }).from(visitorsTable).where(and(
        eq(visitorsTable.organizationId, orgId),
        eq(visitorsTable.id, req.params.id),
      ));
      if (!visitor) return { updated: null, notFound: true, invalidStatus: false };
      if (visitor.status !== "checked_in") return { updated: null, notFound: false, invalidStatus: true };

      const [updated] = await tx.update(visitorsTable)
        .set({ idCardReturned: false })
        .where(and(
          eq(visitorsTable.organizationId, orgId),
          eq(visitorsTable.id, visitor.id),
          eq(visitorsTable.status, "checked_in"),
        ))
        .returning();
      if (!updated) return { updated: null, notFound: false, invalidStatus: true };

      await tx.insert(visitorAuditTable).values({
        organizationId: orgId,
        visitorId: visitor.id,
        action: "checkout_blocked",
        actorUserId: user.userId,
        actorEmail: user.email,
        details: `Checkout blocked. ID card (Card No: ${visitor.idCardNumber || "Not recorded"}) returned: No.`,
        createdAt: attemptedAt,
      });
      return { updated, notFound: false, invalidStatus: false };
    });

    if (result.notFound) {
      res.status(404).json({ error: "Visitor not found" });
      return;
    }
    if (result.invalidStatus || !result.updated) {
      res.status(409).json({ error: "Only checked-in visitors can have a blocked checkout recorded" });
      return;
    }

    res.json(formatVisitor(result.updated));
  });

  app.put(`${api}/visitors/:id/checkout`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const parsed = ManualCheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Confirm that the visitor returned the issued ID card before checkout" });
      return;
    }

    const user = (req as AuthedRequest).user;
    const orgId = organizationId(req);
    const checkedOutAt = new Date();
    const { updated, gadgetsNotReturned, notFound, invalidStatus } = await db.transaction(async (tx) => {
      const [visitor] = await tx.select({
        id: visitorsTable.id,
        status: visitorsTable.status,
        appointmentId: visitorsTable.appointmentId,
      }).from(visitorsTable).where(and(
        eq(visitorsTable.organizationId, orgId),
        eq(visitorsTable.id, req.params.id),
      ));
      if (!visitor) {
        return { updated: null, gadgetsNotReturned: false, notFound: true, invalidStatus: false };
      }
      if (visitor.status !== "checked_in") {
        return { updated: null, gadgetsNotReturned: false, notFound: false, invalidStatus: true };
      }

      const approvedGadgets = await tx.select().from(visitorGadgetsTable).where(and(
        eq(visitorGadgetsTable.organizationId, orgId),
        eq(visitorGadgetsTable.visitorId, req.params.id),
        eq(visitorGadgetsTable.approvalStatus, "approved"),
      ));
      if (approvedGadgets.some((gadget) => !gadget.returnedAt)) {
        return { updated: null, gadgetsNotReturned: true, notFound: false, invalidStatus: false };
      }
      const [checkedOut] = await tx
        .update(visitorsTable)
        .set({
          status: "checked_out",
          checkOut: checkedOutAt,
          idCardReturned: true,
          checkedOutBy: user.userId,
          currentLocationLatitude: null,
          currentLocationLongitude: null,
          currentLocationUpdatedAt: null,
        })
        .where(and(
          eq(visitorsTable.organizationId, orgId),
          eq(visitorsTable.id, req.params.id),
          eq(visitorsTable.status, "checked_in"),
        ))
        .returning();

      if (!checkedOut) {
        return { updated: null, gadgetsNotReturned: false, notFound: false, invalidStatus: true };
      }
      await tx.insert(visitorAuditTable).values({
        organizationId: orgId,
        visitorId: checkedOut.id,
        action: "checked_out",
        actorUserId: user.userId,
        actorEmail: user.email,
        details: `Manual checkout confirmed. ID card (Card No: ${checkedOut.idCardNumber || "Not recorded"}) returned: Yes. Checked out by ${user.email}.`,
        createdAt: checkedOutAt,
      });
      if (visitor.appointmentId) {
        const [appointment] = await tx.update(appointmentsTable).set({
          status: "completed",
          completedAt: checkedOutAt,
          updatedAt: checkedOutAt,
        }).where(and(
          eq(appointmentsTable.organizationId, orgId),
          eq(appointmentsTable.id, visitor.appointmentId),
          inArray(appointmentsTable.status, ["approved", "checked_in"]),
        )).returning();
        if (appointment) {
          await tx.insert(appointmentAuditTable).values({
            organizationId: orgId,
            appointmentId: appointment.id,
            action: "completed",
            actorUserId: user.userId,
            actorEmail: user.email,
            details: `Visitor checked out for appointment ${appointment.appointmentNumber}.`,
            createdAt: checkedOutAt,
          });
        }
      }
      return { updated: checkedOut, gadgetsNotReturned: false, notFound: false, invalidStatus: false };
    });

    if (notFound) {
      res.status(404).json({ error: "Visitor not found" });
      return;
    }
    if (invalidStatus) {
      res.status(409).json({ error: "Only checked-in visitors can be checked out" });
      return;
    }
    if (gadgetsNotReturned) {
      res.status(409).json({ error: "Verify that all approved gadgets have been returned before checking out this visitor" });
      return;
    }
    if (!updated) {
      res.status(404).json({ error: "Visitor not found" });
      return;
    }

    res.json(formatVisitor(updated));
  });

  app.put(`${api}/visitors/:id/approve`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    if (!requireFeature("approvals", req, res)) return;
    const parsed = ApproveVisitorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const user = (req as AuthedRequest).user;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Administrator access is required to approve or reject visitors" });
      return;
    }
    const newStatus = parsed.data.action === "approve" ? "approved" : "rejected";
    const orgId = organizationId(req);

    const [updated] = await db
      .update(visitorsTable)
      .set({
        status: newStatus,
        remarks: parsed.data.remarks ?? null,
        approvedBy: user.userId,
      })
      .where(and(
        eq(visitorsTable.organizationId, orgId),
        eq(visitorsTable.id, req.params.id),
        inArray(visitorsTable.status, ["pending", "scheduled"]),
      ))
      .returning();

    if (!updated) {
      res.status(409).json({ error: "Only pending or scheduled visitors can be approved or rejected" });
      return;
    }

    await db.insert(visitorAuditTable).values({
      organizationId: orgId,
      visitorId: updated.id,
      action: newStatus === "approved" ? "approved" : "rejected",
      actorUserId: user.userId,
      actorEmail: user.email,
      details: `Visitor ${newStatus} by administrator.`,
    });

    const admins = await db.select().from(usersTable).where(and(
      eq(usersTable.organizationId, organizationId(req)),
      eq(usersTable.role, "admin"),
    ));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        organizationId: organizationId(req),
        userId: admin.id,
        message: `Visitor ${updated.name} has been ${newStatus} by ${user.email}`,
        type: newStatus === "approved" ? "success" : "warning",
        readStatus: false,
        visitorId: req.params.id,
      });
    }

    res.json(formatVisitor(updated));
  });

  app.put(`${api}/visitors/:id/checkin`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const parsed = CheckinVisitorBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const user = (req as AuthedRequest).user;
    const orgId = organizationId(req);
    const [existing] = await db.select({
      status: visitorsTable.status,
      photoUrl: visitorsTable.photoUrl,
      personToMeetId: visitorsTable.personToMeetId,
      name: visitorsTable.name,
      idCardNumber: visitorsTable.idCardNumber,
      appointmentId: visitorsTable.appointmentId,
    }).from(visitorsTable).where(and(
      eq(visitorsTable.organizationId, orgId),
      eq(visitorsTable.id, req.params.id),
    ));
    if (!existing) {
      res.status(404).json({ error: "Visitor not found" });
      return;
    }
    const idCardNumber = existing.idCardNumber?.trim() || parsed.data.idCardNumber?.trim() || null;
    if (!["scheduled", "pending", "approved"].includes(existing.status)) {
      res.status(409).json({ error: "Visitor cannot be checked in from the current status" });
      return;
    }
    const settings = await getSystemSettings(orgId);
    if (settings.requireApproval &&
      planHasFeature((req as AuthedRequest).org!.planId, "approvals") &&
      existing.status !== "approved") {
      res.status(409).json({ error: "Administrator approval is required before check-in" });
      return;
    }
    if (settings.requirePhoto && !existing.photoUrl) {
      res.status(400).json({ error: "A visitor photo is required by system settings before check-in" });
      return;
    }

    const updated = await db.transaction(async (tx) => {
      const [checkedIn] = await tx
        .update(visitorsTable)
        .set({ status: "checked_in", checkIn: new Date(), idCardNumber })
        .where(and(
          eq(visitorsTable.organizationId, orgId),
          eq(visitorsTable.id, req.params.id),
          inArray(visitorsTable.status, ["scheduled", "pending", "approved"]),
        ))
        .returning();

      if (!checkedIn) return null;
      await tx.insert(visitorAuditTable).values({
        organizationId: orgId,
        visitorId: checkedIn.id,
        action: "checked_in",
        actorUserId: user.userId,
        actorEmail: user.email,
        details: `Visitor checked in. ID card number: ${idCardNumber ?? "Not recorded"}.`,
      });
      if (checkedIn.appointmentId) {
        const [appointment] = await tx.update(appointmentsTable).set({
          status: "checked_in",
          updatedAt: new Date(),
        }).where(and(
          eq(appointmentsTable.organizationId, orgId),
          eq(appointmentsTable.id, checkedIn.appointmentId),
          eq(appointmentsTable.status, "approved"),
        )).returning();
        if (appointment) {
          await tx.insert(appointmentAuditTable).values({
            organizationId: orgId,
            appointmentId: appointment.id,
            action: "checked_in",
            actorUserId: user.userId,
            actorEmail: user.email,
            details: `Visitor checked in for appointment ${appointment.appointmentNumber}.`,
          });
        }
      }
      return checkedIn;
    });
    if (!updated) {
      res.status(409).json({ error: "Visitor cannot be checked in from the current status" });
      return;
    }

    if (existing.personToMeetId) {
      await db.insert(notificationsTable).values({
        organizationId: orgId,
        userId: existing.personToMeetId,
        message: `${existing.name} has arrived. Please meet your visitor.`,
        type: "info",
        readStatus: false,
        visitorId: req.params.id,
      });
    }

    if (existing.status === "scheduled") {
      const pendingGadgets = await db.select({ id: visitorGadgetsTable.id }).from(visitorGadgetsTable)
        .where(and(
          eq(visitorGadgetsTable.visitorId, req.params.id),
          eq(visitorGadgetsTable.organizationId, orgId),
          eq(visitorGadgetsTable.approvalStatus, "pending"),
        ));
      if (pendingGadgets.length > 0) {
        const reviewers = await db.select({ id: usersTable.id }).from(usersTable)
          .where(and(
            eq(usersTable.organizationId, orgId),
            or(eq(usersTable.role, "admin"), eq(usersTable.role, "security")),
          ));
        if (reviewers.length > 0) {
          await db.insert(notificationsTable).values(reviewers.map((reviewer) => ({
            organizationId: orgId,
            userId: reviewer.id,
            message: `${pendingGadgets.length} gadget${pendingGadgets.length === 1 ? "" : "s"} carried by ${existing.name} need approval.`,
            type: "warning",
            readStatus: false,
            visitorId: req.params.id,
          })));
        }
      }
    }
    res.json(formatVisitor(updated));
  });

  /* --------------------------------- dashboard --------------------------------- */
  app.get(`${api}/dashboard/stats`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const orgId = organizationId(req);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayVisitors = await db.select().from(visitorsTable).where(and(
      eq(visitorsTable.organizationId, orgId),
      gte(visitorsTable.checkIn, today),
    ));

    const totalToday = todayVisitors.length;
    const visitorsInside = (await db.select({ id: visitorsTable.id }).from(visitorsTable)
      .where(and(
        eq(visitorsTable.organizationId, orgId),
        eq(visitorsTable.status, "checked_in"),
      ))).length;
    const checkedOut = todayVisitors.filter((v) => v.status === "checked_out").length;
    const pendingVisitors = await db.select({ id: visitorsTable.id }).from(visitorsTable)
      .where(and(
        eq(visitorsTable.organizationId, orgId),
        eq(visitorsTable.status, "pending"),
      ));
    const pendingApprovals = pendingVisitors.length;

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekVisitors = await db.select().from(visitorsTable).where(and(
      eq(visitorsTable.organizationId, orgId),
      gte(visitorsTable.checkIn, weekStart),
    ));

    const monthStart = new Date();
    monthStart.setDate(1);
    const monthVisitors = await db.select().from(visitorsTable).where(and(
      eq(visitorsTable.organizationId, orgId),
      gte(visitorsTable.checkIn, monthStart),
    ));

    const hourCounts: Record<number, number> = {};
    for (const v of todayVisitors) {
      if (v.checkIn) {
        const h = new Date(v.checkIn).getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      }
    }
    let peakHour = "N/A";
    if (Object.keys(hourCounts).length > 0) {
      const peak = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0];
      const h = parseInt(peak);
      peakHour = h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`;
    }

    const durationsMs = todayVisitors
      .filter((v) => v.checkIn && v.checkOut)
      .map((v) => new Date(v.checkOut!).getTime() - new Date(v.checkIn!).getTime());

    const avgDuration =
      durationsMs.length > 0
        ? formatDuration(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length)
        : "N/A";

    res.json({
      totalToday,
      visitorsInside,
      checkedOut,
      pendingApprovals,
      totalThisWeek: weekVisitors.length,
      totalThisMonth: monthVisitors.length,
      peakHour,
      avgDuration,
    });
  });

  app.get(`${api}/reconciliation/daily`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    if (!requireFeature("reconciliationStatement", req, res)) return;
    if ((req as AuthedRequest).user.role !== "admin") {
      res.status(403).json({ error: "Administrator access is required for daily reconciliation" });
      return;
    }

    const orgId = organizationId(req);
    const settings = await getSystemSettings(orgId);
    const suppliedDate = req.query.date;
    if (suppliedDate !== undefined && typeof suppliedDate !== "string") {
      res.status(400).json({ error: "Enter a valid reconciliation date" });
      return;
    }
    const reportDate = typeof suppliedDate === "string" ? suppliedDate : dateInTimezone(new Date(), settings.timezone);
    const parsedDate = new Date(`${reportDate}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== reportDate) {
      res.status(400).json({ error: "Enter a valid reconciliation date" });
      return;
    }
    if (reportDate > dateInTimezone(new Date(), settings.timezone)) {
      res.status(400).json({ error: "Reconciliation is only available for today or an earlier date" });
      return;
    }

    const dayStart = sql`(${reportDate}::date::timestamp AT TIME ZONE ${settings.timezone})`;
    const dayEnd = sql`((${reportDate}::date + 1)::timestamp AT TIME ZONE ${settings.timezone})`;
    const [visitorRows, blockedRows] = await Promise.all([
      db.select({
        id: visitorsTable.id,
        visitorId: visitorsTable.visitorId,
        name: visitorsTable.name,
        mobile: visitorsTable.mobile,
        status: visitorsTable.status,
        checkIn: visitorsTable.checkIn,
        checkOut: visitorsTable.checkOut,
        idCardNumber: visitorsTable.idCardNumber,
        idCardReturned: visitorsTable.idCardReturned,
        checkedOutBy: visitorsTable.checkedOutBy,
        checkedOutByName: usersTable.name,
        checkedOutByEmail: usersTable.email,
      }).from(visitorsTable).leftJoin(usersTable, and(
        eq(visitorsTable.checkedOutBy, usersTable.id),
        eq(usersTable.organizationId, orgId),
      )).where(and(
        eq(visitorsTable.organizationId, orgId),
        or(
          and(gte(visitorsTable.checkIn, dayStart), lt(visitorsTable.checkIn, dayEnd)),
          and(gte(visitorsTable.checkOut, dayStart), lt(visitorsTable.checkOut, dayEnd)),
          and(
            lt(visitorsTable.checkIn, dayEnd),
            or(isNull(visitorsTable.checkOut), gte(visitorsTable.checkOut, dayEnd))!,
          ),
          and(
            isNotNull(visitorsTable.idCardNumber),
            lt(visitorsTable.checkIn, dayEnd),
            or(
              isNull(visitorsTable.checkOut),
              gte(visitorsTable.checkOut, dayEnd),
              and(
                lt(visitorsTable.checkOut, dayEnd),
                or(isNull(visitorsTable.idCardReturned), eq(visitorsTable.idCardReturned, false))!,
              ),
            )!,
          ),
        )!,
      )),
      db.select({
        visitorId: visitorAuditTable.visitorId,
        attempts: count(),
      }).from(visitorAuditTable).where(and(
        eq(visitorAuditTable.organizationId, orgId),
        eq(visitorAuditTable.action, "checkout_blocked"),
        gte(visitorAuditTable.createdAt, dayStart),
        lt(visitorAuditTable.createdAt, dayEnd),
      )).groupBy(visitorAuditTable.visitorId),
    ]);

    const isOnReportDate = (value: Date | null) =>
      value !== null && dateInTimezone(value, settings.timezone) === reportDate;
    const blockedAttemptsByVisitor = new Map(blockedRows.map((row) => [row.visitorId, row.attempts]));
    const records = visitorRows.map((visitor) => {
      const checkedInOnDate = isOnReportDate(visitor.checkIn);
      const checkedOutOnDate = isOnReportDate(visitor.checkOut);
      const checkedOutByReportDate = visitor.checkOut !== null &&
        dateInTimezone(visitor.checkOut, settings.timezone) <= reportDate;
      const insideAtEndOfDate = visitor.checkIn !== null &&
        dateInTimezone(visitor.checkIn, settings.timezone) <= reportDate &&
        (!visitor.checkOut || dateInTimezone(visitor.checkOut, settings.timezone) > reportDate);
      const cardOutstanding = !!visitor.idCardNumber && visitor.checkIn !== null &&
        dateInTimezone(visitor.checkIn, settings.timezone) <= reportDate &&
        (!visitor.checkOut ||
          dateInTimezone(visitor.checkOut, settings.timezone) > reportDate ||
          visitor.idCardReturned !== true);
      const cardStatus = !visitor.idCardNumber
        ? "not_issued"
        : checkedOutByReportDate
          ? visitor.idCardReturned === true ? "returned" : visitor.idCardReturned === false ? "not_returned" : "unverified"
          : visitor.idCardReturned === false ? "not_returned" : "inside";
      return {
        id: visitor.id,
        visitorId: visitor.visitorId,
        name: visitor.name,
        mobile: visitor.mobile,
        status: checkedOutByReportDate ? "checked_out" : "checked_in",
        checkIn: visitor.checkIn?.toISOString() ?? null,
        checkOut: visitor.checkOut?.toISOString() ?? null,
        checkedInOnDate,
        checkedOutOnDate,
        insideAtEndOfDate,
        idCardNumber: visitor.idCardNumber,
        idCardReturned: visitor.idCardReturned,
        cardStatus,
        cardOutstanding,
        checkedOutByName: visitor.checkedOutByName,
        checkedOutByEmail: visitor.checkedOutByEmail,
        blockedCheckoutAttempts: blockedAttemptsByVisitor.get(visitor.id) ?? 0,
      };
    });

    const checkedOutToday = records.filter((visitor) => visitor.checkedOutOnDate);
    res.json({
      date: reportDate,
      timezone: settings.timezone,
      summary: {
        checkIns: records.filter((visitor) => visitor.checkedInOnDate).length,
        checkOuts: checkedOutToday.length,
        manualCheckouts: checkedOutToday.filter((visitor) => visitor.checkedOutByEmail).length,
        automaticCheckouts: checkedOutToday.filter((visitor) => !visitor.checkedOutByEmail).length,
        visitorsInside: records.filter((visitor) => visitor.insideAtEndOfDate).length,
        idCardsIssued: records.filter((visitor) => visitor.checkedInOnDate && visitor.idCardNumber).length,
        idCardsReturned: records.filter((visitor) => visitor.checkedOutOnDate && visitor.idCardReturned === true).length,
        idCardsOutstanding: records.filter((visitor) => visitor.cardOutstanding).length,
        blockedCheckoutAttempts: blockedRows.reduce((total, row) => total + row.attempts, 0),
      },
      visitors: records,
    });
  });

  app.get(`${api}/dashboard/recent`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const visitors = await db.select().from(visitorsTable)
      .where(eq(visitorsTable.organizationId, organizationId(req)))
      .orderBy(desc(visitorsTable.createdAt)).limit(10);
    res.json(visitors.map((visitor) => formatVisitor(visitor)));
  });

  app.get(`${api}/dashboard/activity`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const visitors = await db.select().from(visitorsTable)
      .where(eq(visitorsTable.organizationId, organizationId(req)))
      .orderBy(desc(visitorsTable.createdAt)).limit(20);

    const activities = visitors
      .flatMap((v) => {
        const items = [];
        if (v.checkIn) {
          items.push({
            id: `${v.id}-checkin`,
            type: "check_in" as const,
            visitorName: v.name,
            message: `${v.name} checked in to meet ${v.personToMeet}`,
            timestamp: v.checkIn.toISOString(),
          });
        }
        if (v.checkOut) {
          items.push({
            id: `${v.id}-checkout`,
            type: "check_out" as const,
            visitorName: v.name,
            message: `${v.name} checked out`,
            timestamp: v.checkOut.toISOString(),
          });
        }
        if (v.status === "approved") {
          items.push({
            id: `${v.id}-approval`,
            type: "approval" as const,
            visitorName: v.name,
            message: `${v.name}'s visit was approved`,
            timestamp: v.createdAt.toISOString(),
          });
        }
        if (v.status === "rejected") {
          items.push({
            id: `${v.id}-rejection`,
            type: "rejection" as const,
            visitorName: v.name,
            message: `${v.name}'s visit was rejected`,
            timestamp: v.createdAt.toISOString(),
          });
        }
        return items;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20)
      .map((item, idx) => ({ ...item, id: idx + 1 }));

    res.json(activities);
  });

  /* ---------------------------------- reports ---------------------------------- */
  app.get(`${api}/reports`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const params = GetReportsQueryParams.safeParse(req.query);
    const period = params.success ? (params.data.period ?? "daily") : "daily";

    const now = new Date();
    let start: Date;
    let days: number;

    if (period === "weekly") {
      start = new Date(now);
      start.setDate(now.getDate() - 7);
      days = 7;
    } else if (period === "monthly") {
      start = new Date(now);
      start.setDate(now.getDate() - 30);
      days = 30;
    } else {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      days = 1;
    }

    const orgId = organizationId(req);
    const visitors = await db.select().from(visitorsTable).where(and(
      eq(visitorsTable.organizationId, orgId),
      gte(visitorsTable.createdAt, start),
    ));
    const visitsInPeriod = await db.select().from(visitorsTable).where(and(
      eq(visitorsTable.organizationId, orgId),
      gte(visitorsTable.checkIn, start),
    ));

    const totalVisitors = visitsInPeriod.length;
    const avgDailyVisitors = days > 1 ? totalVisitors / days : totalVisitors;

    const dayCount: Record<string, number> = {};
    for (let d = 0; d < Math.max(days, 7); d++) {
      const date = new Date(now);
      date.setDate(now.getDate() - (Math.max(days, 7) - 1 - d));
      const key = date.toISOString().split("T")[0];
      dayCount[key] = 0;
    }
    for (const v of visitsInPeriod) {
      if (!v.checkIn) continue;
      const key = v.checkIn.toISOString().split("T")[0];
      if (key in dayCount) dayCount[key] = (dayCount[key] || 0) + 1;
    }

    const timeline = Object.entries(dayCount)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    const peakEntry = Object.entries(dayCount).sort(([, a], [, b]) => b - a)[0];
    const peakDay = peakEntry ? peakEntry[0] : "N/A";

    const hourCount: Record<number, number> = {};
    for (let h = 6; h <= 20; h++) hourCount[h] = 0;
    for (const v of visitsInPeriod) {
      if (!v.checkIn) continue;
      const h = v.checkIn.getHours();
      hourCount[h] = (hourCount[h] || 0) + 1;
    }
    const hourlyDistribution = Object.entries(hourCount)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([hour, count]) => ({ hour: formatHour(parseInt(hour)), count }));

    const purposeCount: Record<string, number> = {};
    for (const v of visitsInPeriod) {
      purposeCount[v.purpose] = (purposeCount[v.purpose] || 0) + 1;
    }
    const purposeBreakdown = Object.entries(purposeCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([purpose, count]) => ({ purpose, count }));

    const statusCount: Record<string, number> = {
      pending: 0,
      approved: 0,
      checked_in: 0,
      checked_out: 0,
      rejected: 0,
    };
    for (const v of visitors) {
      statusCount[v.status] = (statusCount[v.status] || 0) + 1;
    }
    const statusBreakdown = Object.entries(statusCount).map(([status, count]) => ({ status, count }));

    res.json({
      period,
      totalVisitors,
      avgDailyVisitors: Math.round(avgDailyVisitors * 10) / 10,
      peakDay,
      timeline,
      hourlyDistribution,
      purposeBreakdown,
      statusBreakdown,
    });
  });

  /* ----------------------------------- users ----------------------------------- */
  app.get(`${api}/users`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const users = await db.select().from(usersTable)
      .where(eq(usersTable.organizationId, organizationId(req)));
    res.json(users.map(formatUser));
  });

  app.post(`${api}/users`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    if ((req as AuthedRequest).user.role !== "admin") {
      res.status(403).json({ error: "Only administrators can add employees" });
      return;
    }

    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    if (!await checkStaffCapacity(req, res)) return;
    const orgId = organizationId(req);
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email.toLowerCase()));
    if (existing.length > 0) {
      res.status(400).json({ error: "User with this email already exists" });
      return;
    }

    const [user] = await db
      .insert(usersTable)
      .values({
        organizationId: orgId,
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        role: parsed.data.role,
        password: hashPassword(parsed.data.password),
      })
      .returning();

    res.status(201).json(formatUser(user));
  });

  app.put(`${api}/users/:id`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const requester = (req as AuthedRequest).user;
    const orgId = organizationId(req);
    const [admin] = await db.select({ role: usersTable.role }).from(usersTable).where(and(
      eq(usersTable.organizationId, orgId),
      eq(usersTable.id, requester.userId),
    ));
    if (!admin || admin.role !== "admin") {
      res.status(403).json({ error: "Only administrators can edit employees" });
      return;
    }

    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const parsed = UpdateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid user details" });
      return;
    }

    const [target] = await db.select().from(usersTable).where(and(
      eq(usersTable.organizationId, orgId),
      eq(usersTable.id, id),
    ));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const [emailOwner] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
    if (emailOwner && emailOwner.id !== id) {
      res.status(409).json({ error: "Another user already uses this email address" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({
        name: parsed.data.name,
        email,
        role: parsed.data.role,
        ...(parsed.data.password ? { password: hashPassword(parsed.data.password) } : {}),
      })
      .where(and(
        eq(usersTable.organizationId, orgId),
        eq(usersTable.id, id),
      ))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(formatUser(updated));
  });

  app.delete(`${api}/users/:id`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Only administrators can remove employees" });
      return;
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    const [deleted] = await db.delete(usersTable).where(and(
      eq(usersTable.organizationId, organizationId(req)),
      eq(usersTable.id, id),
    )).returning({ id: usersTable.id });
    if (!deleted) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ success: true, message: "User deleted" });
  });

  /* --------------------------------- blacklist --------------------------------- */
  app.get(`${api}/blacklist`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const entries = await db.select().from(blacklistTable)
      .where(eq(blacklistTable.organizationId, organizationId(req)))
      .orderBy(blacklistTable.createdAt);
    res.json(entries.map(formatBlacklist).reverse());
  });

  app.post(`${api}/blacklist`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const parsed = AddToBlacklistBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const user = (req as AuthedRequest).user;

    const [entry] = await db
      .insert(blacklistTable)
      .values({
        organizationId: organizationId(req),
        name: parsed.data.name,
        mobile: parsed.data.mobile,
        reason: parsed.data.reason,
        addedBy: user.email,
      })
      .returning();

    res.status(201).json(formatBlacklist(entry));
  });

  app.put(`${api}/blacklist/:id`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const parsed = UpdateBlacklistBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [updated] = await db
      .update(blacklistTable)
      .set({
        name: parsed.data.name,
        mobile: parsed.data.mobile,
        reason: parsed.data.reason,
      })
      .where(and(
        eq(blacklistTable.organizationId, organizationId(req)),
        eq(blacklistTable.id, id),
      ))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Blacklist entry not found" });
      return;
    }

    res.json(formatBlacklist(updated));
  });

  app.delete(`${api}/blacklist/:id`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    const [deleted] = await db.delete(blacklistTable).where(and(
      eq(blacklistTable.organizationId, organizationId(req)),
      eq(blacklistTable.id, id),
    )).returning({ id: blacklistTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Blacklist entry not found" });
      return;
    }
    res.json({ success: true, message: "Removed from blacklist" });
  });

  /* ------------------------------- notifications ------------------------------- */
  app.get(`${api}/notifications`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.organizationId, organizationId(req)),
        eq(notificationsTable.userId, user.userId),
      ))
      .orderBy(notificationsTable.createdAt);
    res.json(notifications.map(formatNotification).reverse());
  });

  app.put(`${api}/notifications/:id/read`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid notification ID" });
      return;
    }
    const [updated] = await db
      .update(notificationsTable)
      .set({ readStatus: true })
      .where(and(
        eq(notificationsTable.organizationId, organizationId(req)),
        eq(notificationsTable.userId, (req as AuthedRequest).user.userId),
        eq(notificationsTable.id, id),
      ))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json(formatNotification(updated));
  });

  app.put(`${api}/notifications/read-all`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    await db.update(notificationsTable).set({ readStatus: true }).where(and(
      eq(notificationsTable.organizationId, organizationId(req)),
      eq(notificationsTable.userId, user.userId),
    ));
    res.json({ success: true, message: "All notifications marked as read" });
  });

  /* ------------------------------ subscriptions ------------------------------ */
  app.get(`${api}/subscription`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const org = (req as AuthedRequest).org!;
    const settings = await getSystemSettings(org.id);
    const monthCondition = sql`date_trunc('month', ${visitorsTable.createdAt} AT TIME ZONE ${settings.timezone}) =
      date_trunc('month', now() AT TIME ZONE ${settings.timezone})`;
    const [[visitorUsage], [staffUsage]] = await Promise.all([
      db.select({ count: count() }).from(visitorsTable).where(and(
        eq(visitorsTable.organizationId, org.id),
        monthCondition,
      )),
      db.select({ count: count() }).from(usersTable)
        .where(eq(usersTable.organizationId, org.id)),
    ]);

    res.json({
      organization: { id: org.id, name: org.name },
      subscription: {
        planId: org.planId,
        status: org.status,
        billingCycle: org.billingCycle,
        trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
        currentPeriodStart: org.currentPeriodStart.toISOString(),
        currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null,
        readOnly: org.readOnly,
      },
      plan: PLANS[org.planId],
      usage: {
        visitorsThisMonth: visitorUsage.count,
        staffUsers: staffUsage.count,
      },
    });
  });

  app.get(`${api}/subscription/invoices`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Administrator access is required" });
      return;
    }
    const invoices = await db.select().from(subscriptionInvoicesTable)
      .where(eq(subscriptionInvoicesTable.organizationId, organizationId(req)))
      .orderBy(desc(subscriptionInvoicesTable.issuedAt));
    res.json(invoices.map((invoice) => ({
      ...invoice,
      issuedAt: invoice.issuedAt.toISOString(),
      paidAt: invoice.paidAt?.toISOString() ?? null,
    })));
  });

  app.post(`${api}/subscription/change-plan`, authMiddleware, requireOrganization, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Administrator access is required" });
      return;
    }
    const parsed = z.object({
      planId: z.enum(["starter", "business", "enterprise"]),
      billingCycle: z.enum(["monthly", "annual"]),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose a valid plan and billing cycle" });
      return;
    }
    const orgId = organizationId(req);
    const [existingRequest] = await db.select({ id: subscriptionPlanRequestsTable.id })
      .from(subscriptionPlanRequestsTable)
      .where(and(
        eq(subscriptionPlanRequestsTable.organizationId, orgId),
        eq(subscriptionPlanRequestsTable.status, "pending"),
      )).limit(1);
    if (existingRequest) {
      res.status(409).json({ error: "A plan change request is already awaiting review" });
      return;
    }
    const [request] = await db.insert(subscriptionPlanRequestsTable).values({
      organizationId: orgId,
      requestedBy: user.userId,
      requestedPlanId: parsed.data.planId,
      billingCycle: parsed.data.billingCycle,
    }).returning();
    res.status(202).json({
      requestId: request.id,
      status: request.status,
      message: "Your request has been sent to the VMS billing team for manual review.",
    });
  });

  app.get(`${api}/superadmin/organizations`, authMiddleware, requireSuperAdmin, async (_req, res): Promise<void> => {
    const organizations = await db.select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      contactEmail: organizationsTable.contactEmail,
      contactMobile: organizationsTable.contactMobile,
      createdAt: organizationsTable.createdAt,
      planId: subscriptionsTable.planId,
      subscriptionStatus: subscriptionsTable.status,
      billingCycle: subscriptionsTable.billingCycle,
      trialEndsAt: subscriptionsTable.trialEndsAt,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
    }).from(organizationsTable)
      .leftJoin(subscriptionsTable, eq(subscriptionsTable.organizationId, organizationsTable.id))
      .orderBy(desc(organizationsTable.createdAt));

    const results = await Promise.all(organizations.map(async (organization) => {
      const [[staff], [visitors]] = await Promise.all([
        db.select({ count: count() }).from(usersTable)
          .where(eq(usersTable.organizationId, organization.id)),
        db.select({ count: count() }).from(visitorsTable)
          .where(eq(visitorsTable.organizationId, organization.id)),
      ]);
      return {
        ...organization,
        createdAt: organization.createdAt.toISOString(),
        trialEndsAt: organization.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: organization.currentPeriodEnd?.toISOString() ?? null,
        staffUsers: staff.count,
        totalVisitors: visitors.count,
      };
    }));
    res.json(results);
  });

  app.get(`${api}/superadmin/organizations/:id`, authMiddleware, requireSuperAdmin, async (req, res): Promise<void> => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid organization ID" });
      return;
    }
    const [organization] = await db.select().from(organizationsTable)
      .where(eq(organizationsTable.id, id));
    if (!organization) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    const [[subscription], users, invoices] = await Promise.all([
      db.select().from(subscriptionsTable).where(eq(subscriptionsTable.organizationId, id)),
      db.select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
      }).from(usersTable).where(eq(usersTable.organizationId, id)),
      db.select().from(subscriptionInvoicesTable)
        .where(eq(subscriptionInvoicesTable.organizationId, id))
        .orderBy(desc(subscriptionInvoicesTable.issuedAt)),
    ]);
    res.json({
      organization: { ...organization, createdAt: organization.createdAt.toISOString() },
      subscription: subscription ? {
        ...subscription,
        trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        canceledAt: subscription.canceledAt?.toISOString() ?? null,
        createdAt: subscription.createdAt.toISOString(),
        updatedAt: subscription.updatedAt.toISOString(),
      } : null,
      users: users.map((member) => ({ ...member, createdAt: member.createdAt.toISOString() })),
      invoices: invoices.map((invoice) => ({
        ...invoice,
        issuedAt: invoice.issuedAt.toISOString(),
        paidAt: invoice.paidAt?.toISOString() ?? null,
      })),
    });
  });

  app.get(`${api}/superadmin/plan-requests`, authMiddleware, requireSuperAdmin, async (_req, res): Promise<void> => {
    const requests = await db.select({
      id: subscriptionPlanRequestsTable.id,
      organizationId: subscriptionPlanRequestsTable.organizationId,
      organizationName: organizationsTable.name,
      requestedBy: subscriptionPlanRequestsTable.requestedBy,
      requesterName: usersTable.name,
      requesterEmail: usersTable.email,
      requestedPlanId: subscriptionPlanRequestsTable.requestedPlanId,
      billingCycle: subscriptionPlanRequestsTable.billingCycle,
      status: subscriptionPlanRequestsTable.status,
      createdAt: subscriptionPlanRequestsTable.createdAt,
    }).from(subscriptionPlanRequestsTable)
      .innerJoin(organizationsTable, eq(organizationsTable.id, subscriptionPlanRequestsTable.organizationId))
      .innerJoin(usersTable, eq(usersTable.id, subscriptionPlanRequestsTable.requestedBy))
      .orderBy(desc(subscriptionPlanRequestsTable.createdAt));
    res.json(requests.map((request) => ({
      ...request,
      createdAt: request.createdAt.toISOString(),
    })));
  });

  app.patch(`${api}/superadmin/plan-requests/:id`, authMiddleware, requireSuperAdmin, async (req, res): Promise<void> => {
    const id = Number.parseInt(req.params.id, 10);
    const parsed = z.object({ action: z.enum(["approve", "decline"]) }).safeParse(req.body);
    if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
      res.status(400).json({ error: "Invalid plan request review" });
      return;
    }
    const reviewer = (req as AuthedRequest).user;
    const result = await db.transaction(async (tx) => {
      const [planRequest] = await tx.select().from(subscriptionPlanRequestsTable)
        .where(and(
          eq(subscriptionPlanRequestsTable.id, id),
          eq(subscriptionPlanRequestsTable.status, "pending"),
        ));
      if (!planRequest || !isPlanId(planRequest.requestedPlanId)) return null;

      const now = new Date();
      const plan = PLANS[planRequest.requestedPlanId];
      const cycleEnd = plan.id === "enterprise"
        ? null
        : new Date(now.getTime() + (planRequest.billingCycle === "annual" ? 365 : 30) * 24 * 60 * 60 * 1000);
      if (parsed.data.action === "approve") {
        await tx.update(subscriptionsTable).set({
          planId: planRequest.requestedPlanId,
          status: "active",
          billingCycle: planRequest.billingCycle,
          trialEndsAt: null,
          currentPeriodStart: now,
          currentPeriodEnd: cycleEnd,
          canceledAt: null,
          updatedAt: now,
        }).where(eq(subscriptionsTable.organizationId, planRequest.organizationId));
        if (!planHasFeature(planRequest.requestedPlanId, "mandatoryPhoto")) {
          await tx.update(systemSettingsTable).set({ requirePhoto: false })
            .where(eq(systemSettingsTable.organizationId, planRequest.organizationId));
        }
      }

      const [updatedRequest] = await tx.update(subscriptionPlanRequestsTable).set({
        status: parsed.data.action === "approve" ? "approved" : "declined",
        reviewedAt: now,
        reviewedBy: reviewer.userId,
      }).where(eq(subscriptionPlanRequestsTable.id, id)).returning();
      return updatedRequest;
    });
    if (!result) {
      res.status(404).json({ error: "Pending plan request was not found" });
      return;
    }
    res.json({ ...result, createdAt: result.createdAt.toISOString(), reviewedAt: result.reviewedAt?.toISOString() ?? null });
  });

  app.patch(`${api}/superadmin/organizations/:id/subscription`, authMiddleware, requireSuperAdmin, async (req, res): Promise<void> => {
    const organization = Number.parseInt(req.params.id, 10);
    const parsed = z.object({
      planId: z.enum(["starter", "business", "enterprise"]),
      status: z.enum(["trial", "active", "past_due", "canceled", "expired"]),
      billingCycle: z.enum(["monthly", "annual"]),
      trialDays: z.number().int().min(1).max(90).optional(),
    }).safeParse(req.body);
    if (!Number.isInteger(organization) || organization <= 0 || !parsed.success) {
      res.status(400).json({ error: "Invalid subscription update" });
      return;
    }
    const now = new Date();
    const trialEndsAt = parsed.data.status === "trial"
      ? new Date(now.getTime() + (parsed.data.trialDays ?? 14) * 24 * 60 * 60 * 1000)
      : null;
    const plan = PLANS[parsed.data.planId];
    const currentPeriodEnd = parsed.data.status === "trial"
      ? trialEndsAt
      : parsed.data.status === "active" && plan.id !== "enterprise"
        ? new Date(now.getTime() + (parsed.data.billingCycle === "annual" ? 365 : 30) * 24 * 60 * 60 * 1000)
        : null;
    const [updated] = await db.transaction(async (tx) => {
      const [subscription] = await tx.update(subscriptionsTable).set({
        planId: parsed.data.planId,
        status: parsed.data.status,
        billingCycle: parsed.data.billingCycle,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd,
        canceledAt: parsed.data.status === "canceled" ? now : null,
        updatedAt: now,
      }).where(eq(subscriptionsTable.organizationId, organization)).returning();
      if (subscription && !planHasFeature(parsed.data.planId, "mandatoryPhoto")) {
        await tx.update(systemSettingsTable).set({ requirePhoto: false })
          .where(eq(systemSettingsTable.organizationId, organization));
      }
      return [subscription];
    });
    if (!updated) {
      res.status(404).json({ error: "Organization subscription not found" });
      return;
    }
    res.json({
      ...updated,
      trialEndsAt: updated.trialEndsAt?.toISOString() ?? null,
      currentPeriodStart: updated.currentPeriodStart.toISOString(),
      currentPeriodEnd: updated.currentPeriodEnd?.toISOString() ?? null,
      canceledAt: updated.canceledAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  });

  app.post(`${api}/superadmin/organizations/:id/invoices`, authMiddleware, requireSuperAdmin, async (req, res): Promise<void> => {
    const organization = Number.parseInt(req.params.id, 10);
    const parsed = z.object({
      amountRupees: z.number().int().positive(),
      description: z.string().trim().min(1).max(500),
      status: z.enum(["pending", "paid"]),
    }).safeParse(req.body);
    if (!Number.isInteger(organization) || organization <= 0 || !parsed.success) {
      res.status(400).json({ error: "Enter a valid invoice amount and description" });
      return;
    }
    const [invoice] = await db.insert(subscriptionInvoicesTable).values({
      organizationId: organization,
      invoiceNumber: `VMS-${Date.now()}-${generateId().slice(0, 8).toUpperCase()}`,
      amountPaise: parsed.data.amountRupees * 100,
      currency: "INR",
      description: parsed.data.description,
      status: parsed.data.status,
      paidAt: parsed.data.status === "paid" ? new Date() : null,
    }).returning();
    res.status(201).json({
      ...invoice,
      issuedAt: invoice.issuedAt.toISOString(),
      paidAt: invoice.paidAt?.toISOString() ?? null,
    });
  });
}

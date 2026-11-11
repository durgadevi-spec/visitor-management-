import type { Express, Request } from "express";
import type { Server } from "http";
import { eq, and, or, ilike, gte, lte, desc } from "drizzle-orm";
import { db } from "./db";
import { authMiddleware, hashPassword, signToken, type JwtPayload } from "./auth";
import {
  usersTable,
  visitorsTable,
  blacklistTable,
  notificationsTable,
  systemSettingsTable,
  visitorAuditTable,
  visitorGadgetsTable,
  LoginBody,
  SignupBody,
  CreateVisitorBody,
  UpdateVisitorBody,
  GetVisitorsQueryParams,
  LookupVisitorByMobileQueryParams,
  ApproveVisitorBody,
  GetReportsQueryParams,
  CreateUserBody,
  UpdateUserBody,
  AddToBlacklistBody,
  UpdateBlacklistBody,
  UpdateSystemSettingsBody,
  ReviewVisitorGadgetBody,
} from "../shared/schema.ts";
import { getSystemSettings } from "./settings";

type AuthedRequest = Request & { user: JwtPayload };

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatVisitor(v: typeof visitorsTable.$inferSelect) {
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
    createdAt: v.createdAt.toISOString(),
  };
}

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
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

  /* ----------------------------------- auth ----------------------------------- */
  app.post(`${api}/auth/signup`, async (req, res): Promise<void> => {
    const parsed = SignupBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid signup details" });
      return;
    }

    const name = parsed.data.name;
    const email = parsed.data.email.toLowerCase();
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
    if (existing.length > 0) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const [user] = await db
      .insert(usersTable)
      .values({
        name,
        email,
        role: "employee",
        password: hashPassword(parsed.data.password),
      })
      .returning();

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.status(201).json({ token, user: formatUser(user) });
  });

  app.post(`${api}/auth/login`, async (req, res): Promise<void> => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { email, password } = parsed.data;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const hashedPassword = hashPassword(password);
    if (user.password !== hashedPassword && user.password !== password) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

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

  app.get(`${api}/settings`, authMiddleware, async (_req, res): Promise<void> => {
    const settings = await getSystemSettings();
    res.json(settings);
  });

  app.put(`${api}/settings`, authMiddleware, async (req, res): Promise<void> => {
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

    const [settings] = await db
      .insert(systemSettingsTable)
      .values({ id: 1, ...parsed.data })
      .onConflictDoUpdate({
        target: systemSettingsTable.id,
        set: parsed.data,
      })
      .returning();

    res.json(settings);
  });

  /* --------------------------------- visitors --------------------------------- */
  app.get(`${api}/visitors`, authMiddleware, async (req, res): Promise<void> => {
    const params = GetVisitorsQueryParams.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }

    const { status, date, search, person_to_meet } = params.data;
    const conditions = [];
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

    const blacklistEntries = await db.select().from(blacklistTable);
    const visitors = await db
      .select()
      .from(visitorsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(visitorsTable.createdAt));

    res.json(visitors.map((visitor) => formatVisitor(buildVisitorWithBlacklistFlag(visitor, blacklistEntries))));
  });

  app.get(`${api}/visitors/lookup`, authMiddleware, async (req, res): Promise<void> => {
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
      .where(eq(visitorsTable.mobile, parsed.data.mobile))
      .orderBy(desc(visitorsTable.createdAt))
      .limit(5);

    res.json(matches.map((visitor) => ({
      ...visitor,
      email: visitor.email ?? null,
      createdAt: visitor.createdAt.toISOString(),
    })));
  });

  app.post(`${api}/visitors`, authMiddleware, async (req, res): Promise<void> => {
    const parsed = CreateVisitorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;
    const settings = await getSystemSettings();
    if (settings.requirePhoto && !data.photoUrl) {
      res.status(400).json({ error: "A visitor photo is required by system settings" });
      return;
    }

    const id = generateId();
    const visitorId = generateVisitorId();
    const blacklistEntries = await db.select().from(blacklistTable);
    const blacklistMatch = findBlacklistMatchEntry(blacklistEntries, data.name, data.mobile);
    const isBlacklisted = !!blacklistMatch;
    const user = (req as AuthedRequest).user;

    const visitor = await db.transaction(async (tx) => {
      const [createdVisitor] = await tx
        .insert(visitorsTable)
        .values({
          id,
          visitorId,
          name: data.name,
          mobile: data.mobile,
          email: data.email ?? null,
          purpose: data.purpose,
          personToMeet: data.personToMeet,
          personToMeetId: data.personToMeetId ?? null,
          idProofType: data.idProofType,
          idNumber: data.idNumber,
          photoUrl: data.photoUrl ?? null,
          qrCode: visitorId,
          status: "checked_in",
          checkIn: new Date(),
          isBlacklisted,
          isFlagged: isBlacklisted,
          remarks: isBlacklisted ? `Security alert: matched blacklist reason "${blacklistMatch.reason}"` : null,
        })
        .returning();

      await tx.insert(visitorAuditTable).values({
        visitorId: id,
        action: "registered",
        actorUserId: user.userId,
        actorEmail: user.email,
        details: "Visitor registered and checked in.",
      });
      if (data.gadgets?.length) {
        await tx.insert(visitorGadgetsTable).values(data.gadgets.map((gadget) => ({
          visitorId: id,
          name: gadget.name,
          makeModel: gadget.makeModel || null,
          serialNumber: gadget.serialNumber || null,
        })));
        await tx.insert(visitorAuditTable).values({
          visitorId: id,
          action: "gadgets_recorded",
          actorUserId: user.userId,
          actorEmail: user.email,
          details: `${data.gadgets.length} gadget${data.gadgets.length === 1 ? "" : "s"} recorded; approval is pending.`,
        });
        const reviewers = await tx.select({ id: usersTable.id }).from(usersTable)
          .where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "security")));
        if (reviewers.length > 0) {
          await tx.insert(notificationsTable).values(reviewers.map((reviewer) => ({
            userId: reviewer.id,
            message: `${data.gadgets!.length} gadget${data.gadgets!.length === 1 ? "" : "s"} carried by ${data.name} need approval.`,
            type: "warning",
            readStatus: false,
            visitorId: id,
          })));
        }
      }

      return createdVisitor;
    });

    if (data.personToMeetId) {
      await db.insert(notificationsTable).values({
        userId: data.personToMeetId,
        message: `${data.name} has arrived to meet you. Purpose: ${data.purpose}`,
        type: "info",
        readStatus: false,
        visitorId: id,
      });
    }

    res.status(201).json(formatVisitor(visitor));
  });

  app.get(`${api}/visitors/:id`, authMiddleware, async (req, res): Promise<void> => {
    const [visitor] = await db.select().from(visitorsTable).where(eq(visitorsTable.id, req.params.id));
    if (!visitor) {
      res.status(404).json({ error: "Visitor not found" });
      return;
    }
    const blacklistEntries = await db.select().from(blacklistTable);
    res.json(formatVisitor(buildVisitorWithBlacklistFlag(visitor, blacklistEntries)));
  });

  app.get(`${api}/visitors/:id/audit`, authMiddleware, async (req, res): Promise<void> => {
    const entries = await db
      .select()
      .from(visitorAuditTable)
      .where(eq(visitorAuditTable.visitorId, req.params.id))
      .orderBy(desc(visitorAuditTable.createdAt));

    res.json(entries.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })));
  });

  app.get(`${api}/visitors/:id/gadgets`, authMiddleware, async (req, res): Promise<void> => {
    const [visitor] = await db.select({ id: visitorsTable.id }).from(visitorsTable).where(eq(visitorsTable.id, req.params.id));
    if (!visitor) {
      res.status(404).json({ error: "Visitor not found" });
      return;
    }
    const gadgets = await db.select().from(visitorGadgetsTable)
      .where(eq(visitorGadgetsTable.visitorId, req.params.id))
      .orderBy(visitorGadgetsTable.createdAt);
    res.json(gadgets.map((gadget) => ({
      ...gadget,
      reviewedAt: gadget.reviewedAt?.toISOString() ?? null,
      returnedAt: gadget.returnedAt?.toISOString() ?? null,
      createdAt: gadget.createdAt.toISOString(),
    })));
  });

  app.get(`${api}/gadgets`, authMiddleware, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    if (user.role !== "admin" && user.role !== "security") {
      res.status(403).json({ error: "Administrator or security access is required to export gadget details" });
      return;
    }
    const gadgets = await db.select().from(visitorGadgetsTable)
      .orderBy(visitorGadgetsTable.createdAt);
    res.json(gadgets.map((gadget) => ({
      ...gadget,
      reviewedAt: gadget.reviewedAt?.toISOString() ?? null,
      returnedAt: gadget.returnedAt?.toISOString() ?? null,
      createdAt: gadget.createdAt.toISOString(),
    })));
  });

  app.put(`${api}/visitors/:id/gadgets/:gadgetId/approval`, authMiddleware, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
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
        .where(eq(visitorsTable.id, req.params.id));
      if (!visitor || visitor.status !== "checked_in") return [null];
      const [gadget] = await tx.select().from(visitorGadgetsTable).where(and(
        eq(visitorGadgetsTable.id, gadgetId),
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
          eq(visitorGadgetsTable.approvalStatus, "pending"),
        ))
        .returning();
      if (!updated) return [null];
      await tx.insert(visitorAuditTable).values({
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

  app.put(`${api}/visitors/:id/gadgets/:gadgetId/return`, authMiddleware, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
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
        .where(eq(visitorsTable.id, req.params.id));
      if (!visitor || visitor.status !== "checked_in") return [null];
      const [gadget] = await tx.select().from(visitorGadgetsTable).where(and(
        eq(visitorGadgetsTable.id, gadgetId),
        eq(visitorGadgetsTable.visitorId, req.params.id),
      ));
      if (!gadget || gadget.approvalStatus !== "approved" || gadget.returnedAt) return [null];
      const [updated] = await tx.update(visitorGadgetsTable)
        .set({ returnedAt: new Date() })
        .where(and(
          eq(visitorGadgetsTable.id, gadgetId),
          eq(visitorGadgetsTable.approvalStatus, "approved"),
        ))
        .returning();
      if (!updated) return [null];
      await tx.insert(visitorAuditTable).values({
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

  app.put(`${api}/visitors/:id`, authMiddleware, async (req, res): Promise<void> => {
    const parsed = UpdateVisitorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;
    const blacklistEntries = await db.select().from(blacklistTable);
    const blacklistMatch = findBlacklistMatchEntry(blacklistEntries, data.name, data.mobile);
    const user = (req as AuthedRequest).user;
    const { updated, notFound } = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(visitorsTable).where(eq(visitorsTable.id, req.params.id));
      if (!existing) return { updated: null, notFound: true };

      const changedFields = [
        ["name", existing.name !== data.name],
        ["mobile", existing.mobile !== data.mobile],
        ["email", (existing.email ?? "") !== (data.email ?? "")],
        ["purpose", existing.purpose !== data.purpose],
        ["person to meet", existing.personToMeet !== data.personToMeet],
        ["ID proof type", existing.idProofType !== data.idProofType],
        ["ID number", existing.idNumber !== data.idNumber],
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
          isBlacklisted: !!blacklistMatch,
          isFlagged: !!blacklistMatch,
        })
        .where(eq(visitorsTable.id, req.params.id))
        .returning();

      if (changedFields.length > 0) {
        await tx.insert(visitorAuditTable).values({
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

  app.put(`${api}/visitors/:id/checkout`, authMiddleware, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    const { updated, gadgetsNotReturned } = await db.transaction(async (tx) => {
      const approvedGadgets = await tx.select().from(visitorGadgetsTable).where(and(
        eq(visitorGadgetsTable.visitorId, req.params.id),
        eq(visitorGadgetsTable.approvalStatus, "approved"),
      ));
      if (approvedGadgets.some((gadget) => !gadget.returnedAt)) {
        return { updated: null, gadgetsNotReturned: true };
      }
      const [checkedOut] = await tx
        .update(visitorsTable)
        .set({ status: "checked_out", checkOut: new Date() })
        .where(eq(visitorsTable.id, req.params.id))
        .returning();

      if (!checkedOut) return { updated: null, gadgetsNotReturned: false };
      await tx.insert(visitorAuditTable).values({
        visitorId: checkedOut.id,
        action: "checked_out",
        actorUserId: user.userId,
        actorEmail: user.email,
        details: "Visitor manually checked out.",
      });
      return { updated: checkedOut, gadgetsNotReturned: false };
    });

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

  app.put(`${api}/visitors/:id/approve`, authMiddleware, async (req, res): Promise<void> => {
    const parsed = ApproveVisitorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const user = (req as AuthedRequest).user;
    const newStatus = parsed.data.action === "approve" ? "approved" : "rejected";

    const [updated] = await db
      .update(visitorsTable)
      .set({
        status: newStatus,
        remarks: parsed.data.remarks ?? null,
        approvedBy: user.userId,
      })
      .where(eq(visitorsTable.id, req.params.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Visitor not found" });
      return;
    }

    const admins = await db.select().from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        message: `Visitor ${updated.name} has been ${newStatus} by ${user.email}`,
        type: newStatus === "approved" ? "success" : "warning",
        readStatus: false,
        visitorId: req.params.id,
      });
    }

    res.json(formatVisitor(updated));
  });

  app.put(`${api}/visitors/:id/checkin`, authMiddleware, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    const updated = await db.transaction(async (tx) => {
      const [checkedIn] = await tx
        .update(visitorsTable)
        .set({ status: "checked_in", checkIn: new Date() })
        .where(eq(visitorsTable.id, req.params.id))
        .returning();

      if (!checkedIn) return null;
      await tx.insert(visitorAuditTable).values({
        visitorId: checkedIn.id,
        action: "checked_in",
        actorUserId: user.userId,
        actorEmail: user.email,
        details: "Visitor checked in.",
      });
      return checkedIn;
    });
    if (!updated) {
      res.status(404).json({ error: "Visitor not found" });
      return;
    }
    res.json(formatVisitor(updated));
  });

  /* --------------------------------- dashboard --------------------------------- */
  app.get(`${api}/dashboard/stats`, authMiddleware, async (_req, res): Promise<void> => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayVisitors = await db.select().from(visitorsTable).where(gte(visitorsTable.createdAt, today));

    const totalToday = todayVisitors.length;
    const visitorsInside = todayVisitors.filter((v) => v.status === "checked_in").length;
    const checkedOut = todayVisitors.filter((v) => v.status === "checked_out").length;
    const pendingVisitors = await db.select({ id: visitorsTable.id }).from(visitorsTable)
      .where(eq(visitorsTable.status, "pending"));
    const pendingApprovals = pendingVisitors.length;

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekVisitors = await db.select().from(visitorsTable).where(gte(visitorsTable.createdAt, weekStart));

    const monthStart = new Date();
    monthStart.setDate(1);
    const monthVisitors = await db.select().from(visitorsTable).where(gte(visitorsTable.createdAt, monthStart));

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

  app.get(`${api}/dashboard/recent`, authMiddleware, async (_req, res): Promise<void> => {
    const visitors = await db.select().from(visitorsTable).orderBy(desc(visitorsTable.createdAt)).limit(10);
    res.json(visitors.map(formatVisitor));
  });

  app.get(`${api}/dashboard/activity`, authMiddleware, async (_req, res): Promise<void> => {
    const visitors = await db.select().from(visitorsTable).orderBy(desc(visitorsTable.createdAt)).limit(20);

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
  app.get(`${api}/reports`, authMiddleware, async (req, res): Promise<void> => {
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

    const visitors = await db.select().from(visitorsTable).where(gte(visitorsTable.createdAt, start));

    const totalVisitors = visitors.length;
    const avgDailyVisitors = days > 1 ? totalVisitors / days : totalVisitors;

    const dayCount: Record<string, number> = {};
    for (let d = 0; d < Math.max(days, 7); d++) {
      const date = new Date(now);
      date.setDate(now.getDate() - (Math.max(days, 7) - 1 - d));
      const key = date.toISOString().split("T")[0];
      dayCount[key] = 0;
    }
    for (const v of visitors) {
      const key = v.createdAt.toISOString().split("T")[0];
      if (key in dayCount) dayCount[key] = (dayCount[key] || 0) + 1;
    }

    const timeline = Object.entries(dayCount)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    const peakEntry = Object.entries(dayCount).sort(([, a], [, b]) => b - a)[0];
    const peakDay = peakEntry ? peakEntry[0] : "N/A";

    const hourCount: Record<number, number> = {};
    for (let h = 6; h <= 20; h++) hourCount[h] = 0;
    for (const v of visitors) {
      const h = v.createdAt.getHours();
      hourCount[h] = (hourCount[h] || 0) + 1;
    }
    const hourlyDistribution = Object.entries(hourCount)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([hour, count]) => ({ hour: formatHour(parseInt(hour)), count }));

    const purposeCount: Record<string, number> = {};
    for (const v of visitors) {
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
  app.get(`${api}/users`, authMiddleware, async (_req, res): Promise<void> => {
    const users = await db.select().from(usersTable);
    res.json(users.map(formatUser));
  });

  app.post(`${api}/users`, authMiddleware, async (req, res): Promise<void> => {
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email));
    if (existing.length > 0) {
      res.status(400).json({ error: "User with this email already exists" });
      return;
    }

    const [user] = await db
      .insert(usersTable)
      .values({
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        password: hashPassword(parsed.data.password),
      })
      .returning();

    res.status(201).json(formatUser(user));
  });

  app.put(`${api}/users/:id`, authMiddleware, async (req, res): Promise<void> => {
    const requester = (req as AuthedRequest).user;
    const [admin] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, requester.userId));
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

    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
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
      .where(eq(usersTable.id, id))
      .returning();

    res.json(formatUser(updated));
  });

  app.delete(`${api}/users/:id`, authMiddleware, async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.json({ success: true, message: "User deleted" });
  });

  /* --------------------------------- blacklist --------------------------------- */
  app.get(`${api}/blacklist`, authMiddleware, async (_req, res): Promise<void> => {
    const entries = await db.select().from(blacklistTable).orderBy(blacklistTable.createdAt);
    res.json(entries.map(formatBlacklist).reverse());
  });

  app.post(`${api}/blacklist`, authMiddleware, async (req, res): Promise<void> => {
    const parsed = AddToBlacklistBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const user = (req as AuthedRequest).user;

    const [entry] = await db
      .insert(blacklistTable)
      .values({
        name: parsed.data.name,
        mobile: parsed.data.mobile,
        reason: parsed.data.reason,
        addedBy: user.email,
      })
      .returning();

    res.status(201).json(formatBlacklist(entry));
  });

  app.put(`${api}/blacklist/:id`, authMiddleware, async (req, res): Promise<void> => {
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
      .where(eq(blacklistTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Blacklist entry not found" });
      return;
    }

    res.json(formatBlacklist(updated));
  });

  app.delete(`${api}/blacklist/:id`, authMiddleware, async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    await db.delete(blacklistTable).where(eq(blacklistTable.id, id));
    res.json({ success: true, message: "Removed from blacklist" });
  });

  /* ------------------------------- notifications ------------------------------- */
  app.get(`${api}/notifications`, authMiddleware, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, user.userId))
      .orderBy(notificationsTable.createdAt);
    res.json(notifications.map(formatNotification).reverse());
  });

  app.put(`${api}/notifications/:id/read`, authMiddleware, async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid notification ID" });
      return;
    }
    const [updated] = await db
      .update(notificationsTable)
      .set({ readStatus: true })
      .where(eq(notificationsTable.id, id))
      .returning();
    res.json(formatNotification(updated));
  });

  app.put(`${api}/notifications/read-all`, authMiddleware, async (req, res): Promise<void> => {
    const user = (req as AuthedRequest).user;
    await db.update(notificationsTable).set({ readStatus: true }).where(eq(notificationsTable.userId, user.userId));
    res.json({ success: true, message: "All notifications marked as read" });
  });
}

import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "http";
import { and, eq, inArray, lte, lt } from "drizzle-orm";
import cors from "cors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { checkDatabaseConnection, db, pool } from "./db";
import {
  appointmentAuditTable,
  appointmentsTable,
  organizationsTable,
  subscriptionsTable,
  usersTable,
  visitorAuditTable,
  visitorsTable,
} from "../shared/schema.ts";
import { getSystemSettings } from "./settings";
import { hashPassword } from "./auth";
import { processAppointmentReminders } from "./appointment-routes";
import { PLANS, isPlanId } from "../shared/plans";

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

export function log(message: string, source = "express") {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${time} [${source}] ${message}`);
}

function getVisitorLocalDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error(`Missing ${type} in formatted visitor time`);
    return Number(value);
  };

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
    second: getPart("second"),
  };
}

function getVisitorDayEnd(year: number, month: number, day: number, time: string, timeZone: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  const targetTimestamp = Date.UTC(year, month - 1, day, hour, minute, 59, 999);
  let timestamp = targetTimestamp;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const guess = new Date(timestamp);
    const local = getVisitorLocalDate(guess, timeZone);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
      guess.getUTCMilliseconds(),
    );
    timestamp += targetTimestamp - localAsUtc;
  }

  return new Date(timestamp);
}

function getMostRecentVisitorDayEnd(now: Date, time: string, timeZone: string): Date {
  const local = getVisitorLocalDate(now, timeZone);
  const [checkoutHour, checkoutMinute] = time.split(":").map(Number);
  const checkoutTimeReached = local.hour * 60 + local.minute >= checkoutHour * 60 + checkoutMinute;
  const checkoutDay = new Date(Date.UTC(local.year, local.month - 1, local.day));
  if (!checkoutTimeReached) checkoutDay.setUTCDate(checkoutDay.getUTCDate() - 1);
  return getVisitorDayEnd(
    checkoutDay.getUTCFullYear(),
    checkoutDay.getUTCMonth() + 1,
    checkoutDay.getUTCDate(),
    time,
    timeZone,
  );
}

let visitorCheckoutRunning = false;

async function checkoutVisitorsAtEndOfDay() {
  if (visitorCheckoutRunning) return;
  visitorCheckoutRunning = true;

  try {
    const now = new Date();
    let checkedOutCount = 0;
    const organizations = await db.select({ id: organizationsTable.id }).from(organizationsTable);
    for (const organization of organizations) {
      const settings = await getSystemSettings(organization.id);
      if (!settings.autoCheckoutEnabled) continue;

      const cutoff = getMostRecentVisitorDayEnd(now, settings.autoCheckoutTime, settings.timezone);
      const visitors = await db
        .select({
          id: visitorsTable.id,
          checkIn: visitorsTable.checkIn,
          appointmentId: visitorsTable.appointmentId,
        })
        .from(visitorsTable)
        .where(and(
          eq(visitorsTable.organizationId, organization.id),
          eq(visitorsTable.status, "checked_in"),
          lte(visitorsTable.checkIn, cutoff),
        ));

      for (const visitor of visitors) {
        if (!visitor.checkIn) continue;

        const localCheckIn = getVisitorLocalDate(visitor.checkIn, settings.timezone);
        const checkOut = getVisitorDayEnd(
          localCheckIn.year,
          localCheckIn.month,
          localCheckIn.day,
          settings.autoCheckoutTime,
          settings.timezone,
        );
        const updated = await db.transaction(async (tx) => {
          const [checkedOut] = await tx
            .update(visitorsTable)
            .set({
              status: "checked_out",
              checkOut,
              currentLocationLatitude: null,
              currentLocationLongitude: null,
              currentLocationUpdatedAt: null,
            })
            .where(and(
              eq(visitorsTable.organizationId, organization.id),
              eq(visitorsTable.id, visitor.id),
              eq(visitorsTable.status, "checked_in"),
              lte(visitorsTable.checkIn, cutoff),
            ))
            .returning({ id: visitorsTable.id, appointmentId: visitorsTable.appointmentId });

          if (!checkedOut) return false;
          await tx.insert(visitorAuditTable).values({
            organizationId: organization.id,
            visitorId: visitor.id,
            action: "auto_checked_out",
            actorEmail: "system",
            actorUserId: null,
            details: "Automatically checked out at the configured daily checkout time.",
          });
          if (checkedOut.appointmentId) {
            const [appointment] = await tx.update(appointmentsTable).set({
              status: "completed",
              completedAt: checkOut,
              updatedAt: checkOut,
            }).where(and(
              eq(appointmentsTable.organizationId, organization.id),
              eq(appointmentsTable.id, checkedOut.appointmentId),
              inArray(appointmentsTable.status, ["approved", "checked_in"]),
            )).returning();
            if (appointment) {
              await tx.insert(appointmentAuditTable).values({
                organizationId: organization.id,
                appointmentId: appointment.id,
                action: "completed",
                actorEmail: "system",
                actorUserId: null,
                details: `Visitor automatically checked out for appointment ${appointment.appointmentNumber}.`,
                createdAt: checkOut,
              });
            }
          }
          return true;
        });

        if (updated) checkedOutCount += 1;
      }
    }

    if (checkedOutCount > 0) {
      log(`Automatically checked out ${checkedOutCount} visitor(s) across organizations.`, "visitor-checkout");
    }
  } catch (error) {
    console.error("Automatic end-of-day visitor checkout failed:", error);
  } finally {
    visitorCheckoutRunning = false;
  }
}

let auditPruningRunning = false;

async function pruneExpiredAuditLogs() {
  if (auditPruningRunning) return;
  auditPruningRunning = true;

  try {
    const subscriptions = await db.select({
      organizationId: subscriptionsTable.organizationId,
      planId: subscriptionsTable.planId,
    }).from(subscriptionsTable);
    for (const subscription of subscriptions) {
      if (!isPlanId(subscription.planId)) {
        throw new Error(`Unknown plan '${subscription.planId}' on organization ${subscription.organizationId}`);
      }
      const retentionDays = PLANS[subscription.planId].limits.auditRetentionDays;
      if (retentionDays === null) continue;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      await db.delete(visitorAuditTable).where(and(
        eq(visitorAuditTable.organizationId, subscription.organizationId),
        lt(visitorAuditTable.createdAt, cutoff),
      ));
    }
  } catch (error) {
    console.error("Expired audit-log cleanup failed; it will retry on the next scheduled run:", error);
  } finally {
    auditPruningRunning = false;
  }
}

async function seedSuperAdmin() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD before starting VMS in production.");
    }
    return;
  }
  if (password.length < 12) {
    throw new Error("SUPERADMIN_PASSWORD must be at least 12 characters.");
  }

  const [existingSuperAdmin] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.role, "superadmin")).limit(1);
  if (existingSuperAdmin) return;

  const [emailOwner] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.email, email));
  if (emailOwner) {
    throw new Error("SUPERADMIN_EMAIL is already assigned to a non-superadmin user.");
  }

  await db.insert(usersTable).values({
    name: process.env.SUPERADMIN_NAME?.trim() || "VMS Super Admin",
    email,
    role: "superadmin",
    organizationId: null,
    password: hashPassword(password),
  });
}

async function verifyTenantSchema() {
  const result = await pool.query(`
    WITH required(table_name, column_name) AS (
      VALUES
        ('organizations', 'id'),
        ('subscriptions', 'organization_id'),
        ('users', 'organization_id'),
        ('visitors', 'organization_id'),
        ('visitors', 'id_card_number'),
        ('visitors', 'id_card_returned'),
        ('visitors', 'checked_out_by'),
        ('blacklist', 'organization_id'),
        ('notifications', 'organization_id'),
        ('system_settings', 'organization_id'),
        ('system_settings', 'require_approval'),
        ('system_settings', 'reception_latitude'),
        ('system_settings', 'reception_longitude'),
        ('visitors', 'current_location_latitude'),
        ('visitors', 'current_location_longitude'),
        ('visitors', 'current_location_updated_at'),
        ('visitor_audit_log', 'organization_id'),
        ('visitor_gadgets', 'organization_id'),
        ('visitors', 'appointment_id'),
        ('appointments', 'registration_token_hash'),
        ('appointments', 'meeting_person_id'),
        ('appointment_submissions', 'appointment_id'),
        ('appointment_submissions', 'photo_url'),
        ('appointment_passes', 'token_hash'),
        ('appointment_audit_logs', 'appointment_id'),
        ('appointment_sms_logs', 'dedupe_key'),
        ('appointment_sms_logs', 'status'),
        ('appointment_reminders', 'status'),
        ('appointment_reminders', 'processing_started_at'),
        ('appointment_rate_limits', 'key'),
        ('appointment_rate_limits', 'request_count')
    )
    SELECT count(*)::int AS ready
    FROM required r
    JOIN information_schema.columns c
      ON c.table_schema = current_schema()
     AND c.table_name = r.table_name
     AND c.column_name = r.column_name
  `);
  if (result.rows[0]?.ready !== 31) {
    throw new Error("Required database migrations are missing. Run `npm run db:migrate` before starting VMS.");
  }
}

app.use((req, res, next) => {
  const start = Date.now();
  const rawPath = req.path;
  const path = rawPath
    .replace(/^\/api\/public\/appointments\/[^/]+/, "/api/public/appointments/:token")
    .replace(/^\/api\/public\/appointment-passes\/[^/]+/, "/api/public/appointment-passes/:token")
    .replace(/^\/api\/appointments\/passes\/verify\/[^/]+/, "/api/appointments/passes/verify/:token");
  const suppressResponseBody = rawPath.startsWith("/api/appointments") ||
    rawPath.startsWith("/api/public/appointments") ||
    rawPath.startsWith("/api/public/appointment-passes");
  let capturedJsonResponse: any;

  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    capturedJsonResponse = body;
    return originalJson(body);
  }) as typeof res.json;

  res.on("finish", () => {
    if (path.startsWith("/api")) {
      const duration = Date.now() - start;
      let line = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && !suppressResponseBody) line += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      log(line);
    }
  });

  next();
});

async function bootstrap() {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.SESSION_SECRET ||
      process.env.SESSION_SECRET === "vms-secret-key-2024" ||
      process.env.SESSION_SECRET === "REPLACE_WITH_A_UNIQUE_RANDOM_SECRET")
  ) {
    throw new Error("Set a unique SESSION_SECRET before starting VMS in production.");
  }

  const isConnected = await checkDatabaseConnection();
  if (!isConnected) {
    throw new Error("Database connection failed; refusing to start VMS.");
  }
  await verifyTenantSchema();
  await seedSuperAdmin();
  console.log("✨ Database is ready for queries.");

  await registerRoutes(httpServer, app);
  void checkoutVisitorsAtEndOfDay();
  void pruneExpiredAuditLogs();
  void processAppointmentReminders();
  setInterval(() => {
    void checkoutVisitorsAtEndOfDay();
  }, 60_000);
  setInterval(() => {
    void pruneExpiredAuditLogs();
  }, 24 * 60 * 60 * 1000);
  setInterval(() => {
    void processAppointmentReminders();
  }, 60_000);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: err.message || "Internal Server Error" });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const PORT = Number(process.env.PORT) || 5000;
  const HOST = process.env.HOST || "127.0.0.1";
  httpServer.listen(PORT, HOST, () => {
    log(`Server running at http://${HOST}:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});

import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "http";
import { and, eq, lte } from "drizzle-orm";
import cors from "cors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { checkDatabaseConnection, db, ensureSystemSettingsTable, ensureVisitorAuditTable, ensureVisitorGadgetsTable } from "./db";
import { visitorAuditTable, visitorsTable } from "../shared/schema.ts";
import { getSystemSettings } from "./settings";

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
    const settings = await getSystemSettings();
    if (!settings.autoCheckoutEnabled) return;

    const cutoff = getMostRecentVisitorDayEnd(now, settings.autoCheckoutTime, settings.timezone);
    const visitors = await db
      .select({ id: visitorsTable.id, checkIn: visitorsTable.checkIn })
      .from(visitorsTable)
      .where(and(
        eq(visitorsTable.status, "checked_in"),
        lte(visitorsTable.checkIn, cutoff),
      ));

    let checkedOutCount = 0;
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
          .set({ status: "checked_out", checkOut })
          .where(and(
            eq(visitorsTable.id, visitor.id),
            eq(visitorsTable.status, "checked_in"),
            lte(visitorsTable.checkIn, cutoff),
          ))
          .returning({ id: visitorsTable.id });

        if (!checkedOut) return false;
        await tx.insert(visitorAuditTable).values({
          visitorId: visitor.id,
          action: "auto_checked_out",
          actorEmail: "system",
          actorUserId: null,
          details: "Automatically checked out at the configured daily checkout time.",
        });
        return true;
      });

      if (updated) checkedOutCount += 1;
    }

    if (checkedOutCount > 0) {
      log(`Automatically checked out ${checkedOutCount} visitor(s) at ${settings.autoCheckoutTime} (${settings.timezone}).`, "visitor-checkout");
    }
  } catch (error) {
    console.error("Automatic end-of-day visitor checkout failed:", error);
  } finally {
    visitorCheckoutRunning = false;
  }
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
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
      if (capturedJsonResponse) line += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      log(line);
    }
  });

  next();
});

async function bootstrap() {
  const isConnected = await checkDatabaseConnection();
  if (!isConnected) {
    console.warn("⚠️  Database connection failed. Server will start but API calls may fail.");
  } else {
    await ensureSystemSettingsTable();
    await ensureVisitorAuditTable();
    await ensureVisitorGadgetsTable();
    console.log("✨ Database is ready for queries.");
  }

  await registerRoutes(httpServer, app);
  void checkoutVisitorsAtEndOfDay();
  setInterval(() => {
    void checkoutVisitorsAtEndOfDay();
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
  httpServer.listen(PORT, "0.0.0.0", () => {
    log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});

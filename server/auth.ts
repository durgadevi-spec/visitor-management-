import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { type Request, type Response, type NextFunction } from "express";
import { db } from "./db";
import { organizationsTable, subscriptionsTable, usersTable } from "../shared/schema.ts";
import { isPlanId, type PlanId } from "../shared/plans";

const SESSION_SECRET = process.env.SESSION_SECRET || "vms-secret-key-2024";
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
  organizationId: number | null;
  iat: number;
  exp: number;
}

export interface OrganizationContext {
  id: number;
  name: string;
  planId: PlanId;
  status: string;
  billingCycle: string;
  trialEndsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date | null;
  readOnly: boolean;
}

export type AuthenticatedRequest = Request & {
  user: JwtPayload;
  org: OrganizationContext | null;
};

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function tokenSignature(value: string): string {
  return createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

export function signToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(JSON.stringify({
    ...payload,
    iat: issuedAt,
    exp: issuedAt + TOKEN_LIFETIME_SECONDS,
  }));
  const unsignedToken = `${header}.${body}`;
  return `${unsignedToken}.${tokenSignature(unsignedToken)}`;
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const unsignedToken = `${parts[0]}.${parts[1]}`;
    const expected = Buffer.from(tokenSignature(unsignedToken));
    const actual = Buffer.from(parts[2]);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    const header = JSON.parse(base64UrlDecode(parts[0]));
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const validPayload =
      Number.isInteger(payload.userId) &&
      typeof payload.email === "string" &&
      typeof payload.role === "string" &&
      (payload.organizationId === null || Number.isInteger(payload.organizationId)) &&
      Number.isInteger(payload.iat) &&
      Number.isInteger(payload.exp) &&
      payload.exp > Math.floor(Date.now() / 1000);

    return validPayload ? payload as JwtPayload : null;
  } catch {
    return null;
  }
}

function legacyPasswordHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    hash = (hash << 5) - hash + password.charCodeAt(i);
    hash &= hash;
  }
  return Math.abs(hash).toString(16) + SESSION_SECRET.slice(0, 8);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64);
  return `$scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export function verifyPassword(password: string, storedPassword: string): { valid: boolean; needsUpgrade: boolean } {
  if (storedPassword.startsWith("$scrypt$")) {
    const [, , saltHex, keyHex] = storedPassword.split("$");
    if (!saltHex || !keyHex || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(keyHex)) {
      return { valid: false, needsUpgrade: false };
    }
    const expected = Buffer.from(keyHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return {
      valid: expected.length === actual.length && timingSafeEqual(expected, actual),
      needsUpgrade: false,
    };
  }

  const legacyMatch = storedPassword === legacyPasswordHash(password);
  const plaintextMatch = storedPassword === password;
  return {
    valid: legacyMatch || plaintextMatch,
    needsUpgrade: legacyMatch || plaintextMatch,
  };
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  try {
    const [user] = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      organizationId: usersTable.organizationId,
    }).from(usersTable).where(eq(usersTable.id, payload.userId));

    if (!user || user.email !== payload.email || user.role !== payload.role || user.organizationId !== payload.organizationId) {
      res.status(401).json({ error: "Session is no longer valid" });
      return;
    }

    const authenticatedRequest = req as AuthenticatedRequest;
    authenticatedRequest.user = payload;
    authenticatedRequest.org = null;

    if (user.role !== "superadmin") {
      if (user.organizationId === null) {
        res.status(403).json({ error: "Organization membership is required" });
        return;
      }

      const [[organization], [subscription]] = await Promise.all([
        db.select({
          id: organizationsTable.id,
          name: organizationsTable.name,
        }).from(organizationsTable).where(eq(organizationsTable.id, user.organizationId)),
        db.select({
          planId: subscriptionsTable.planId,
          status: subscriptionsTable.status,
          billingCycle: subscriptionsTable.billingCycle,
          trialEndsAt: subscriptionsTable.trialEndsAt,
          currentPeriodStart: subscriptionsTable.currentPeriodStart,
          currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
        }).from(subscriptionsTable).where(eq(subscriptionsTable.organizationId, user.organizationId)),
      ]);

      if (!organization || !subscription || !isPlanId(subscription.planId)) {
        res.status(403).json({ error: "Organization subscription is not configured" });
        return;
      }

      const now = new Date();
      let status = subscription.status;
      if (status === "trial" && subscription.trialEndsAt && subscription.trialEndsAt <= now) {
        status = "expired";
        await db.update(subscriptionsTable).set({ status, updatedAt: now })
          .where(eq(subscriptionsTable.organizationId, user.organizationId));
      } else if (
        status === "active" &&
        subscription.currentPeriodEnd &&
        subscription.currentPeriodEnd <= now
      ) {
        status = "past_due";
        await db.update(subscriptionsTable).set({ status, updatedAt: now })
          .where(eq(subscriptionsTable.organizationId, user.organizationId));
      }

      const graceEnd = subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd.getTime() + 7 * 24 * 60 * 60 * 1000)
        : null;
      const readOnly = status === "canceled" || status === "expired" ||
        (status === "past_due" && (!graceEnd || graceEnd < now));

      authenticatedRequest.org = {
        id: organization.id,
        name: organization.name,
        planId: subscription.planId,
        status,
        billingCycle: subscription.billingCycle,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        readOnly,
      };

      if (
        readOnly &&
        ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
        req.path !== "/api/subscription/change-plan"
      ) {
        res.status(402).json({
          error: "Your subscription is read-only. Choose a plan to restore editing.",
          code: "subscription_read_only",
        });
        return;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}
